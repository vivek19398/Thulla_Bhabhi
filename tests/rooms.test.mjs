import { test } from "node:test";
import assert from "node:assert/strict";
import { roomService } from "../server/rooms.js";
import { Conflict, diskStore } from "../server/store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
function memory() {
  const records = new Map();
  return {
    records,
    async read(code) {
      return structuredClone(records.get(code) || null);
    },
    async write(code, room, etag) {
      if ((records.get(code)?.etag ?? null) !== etag) throw new Conflict();
      records.set(code, {
        room: structuredClone(room),
        etag: String(room.version),
      });
    },
  };
}
let counter = 0;
const cmd = (p, action, version, extra = {}) => ({
  ...p,
  action,
  version,
  id: `request-${++counter}`,
  ...extra,
});
async function lobby(store = memory()) {
  const service = roomService(store);
  const a = await service({
    action: "create",
    name: "Host",
    title: "Sunday table",
  });
  const code = a.table.code;
  const b = await service({ action: "join", code, name: "Second" });
  const c = await service({ action: "join", code, name: "Third" });
  return {
    store,
    service,
    seats: [a, b, c].map((x) => ({ code, token: x.token })),
    code,
  };
}
async function started() {
  const f = await lobby();
  let v = 3;
  for (const p of f.seats) await f.service(cmd(p, "ready", v++));
  await f.service(cmd(f.seats[0], "start", v));
  return f;
}
test("only authenticated seats see their hand; raw deck and hashes stay private", async () => {
  const f = await started();
  for (let i = 0; i < 3; i++) {
    const r = await f.service({ ...f.seats[i], action: "state" });
    assert.equal(r.table.seat, i);
    assert.ok(r.table.game.hand.length >= 17);
    assert.equal(r.table.players[0].hand, undefined);
    const json = JSON.stringify(r);
    assert.ok(!json.includes("tokenHash"));
    assert.ok(!json.includes("receipts"));
    assert.equal(r.table.game.waste, undefined);
  }
  await assert.rejects(
    f.service({ action: "state", code: f.code, token: "fake" }),
    (e) => e.status === 403,
  );
});
test("host-only deal, readiness, late joins and out-of-turn moves are enforced", async () => {
  const f = await lobby();
  await assert.rejects(
    f.service(cmd(f.seats[1], "start", 3)),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.service(cmd(f.seats[0], "start", 3)),
    (e) => e.status === 400,
  );
  const g = await started();
  const r = (await g.service({ ...g.seats[0], action: "state" })).table;
  const wrong = (r.game.turn + 1) % 3;
  await assert.rejects(
    g.service(cmd(g.seats[wrong], "play", r.version, { card: "♠14" })),
    (e) => e.status === 400,
  );
  await assert.rejects(
    g.service({ action: "join", code: g.code, name: "Late" }),
    (e) => e.status === 409,
  );
});
test("simultaneous changes cannot overwrite and retry cannot apply twice", async () => {
  const f = await lobby();
  const results = await Promise.allSettled([
    f.service(cmd(f.seats[0], "ready", 3)),
    f.service(cmd(f.seats[1], "ready", 3)),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    results.filter((x) => x.status === "rejected" && x.reason.status === 409)
      .length,
    1,
  );
  const s = (await f.service({ ...f.seats[0], action: "state" })).table;
  const body = cmd(f.seats[0], "ready", s.version);
  const first = await f.service(body);
  const retry = await f.service(body);
  assert.equal(first.table.version, retry.table.version);
  assert.equal(first.table.players[0].ready, retry.table.players[0].ready);
});
test("host reset replaces saved game while retaining seats and table code", async () => {
  const f = await started();
  const before = (await f.service({ ...f.seats[0], action: "state" })).table;
  await f.service(cmd(f.seats[0], "lobby", before.version));
  const after = (await f.service({ ...f.seats[1], action: "state" })).table;
  assert.equal(after.game, null);
  assert.equal(after.code, f.code);
  assert.ok(after.players.every((p) => !p.ready));
  assert.equal(f.store.records.size, 1);
  let v = after.version;
  for (const seat of f.seats) await f.service(cmd(seat, "ready", v++));
  const fresh = await f.service(cmd(f.seats[0], "start", v));
  assert.equal(fresh.table.game.round, 1);
  assert.equal(f.store.records.size, 1);
});
test("disk JSON survives a new store instance and rejects stale writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bhabhi-test-"));
  try {
    const f = await lobby(diskStore(dir));
    const restored = roomService(diskStore(dir));
    const r = await restored({ ...f.seats[0], action: "state" });
    assert.equal(r.table.players.length, 3);
    assert.equal(r.table.title, "Sunday table");
    await assert.rejects(
      diskStore(dir).write(f.code, { version: 1 }, "0"),
      Conflict,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("full online game uses only legal authenticated moves and preserves privacy", async () => {
  const f = await started();
  let t = (await f.service({ ...f.seats[0], action: "state" })).table;
  for (let i = 0; i < 12000 && !t.game.over; i++) {
    const seat = t.game.turn;
    const v = (await f.service({ ...f.seats[seat], action: "state" })).table;
    t = (
      await f.service(
        cmd(f.seats[seat], "play", v.version, { card: v.game.legal[0] }),
      )
    ).table;
  }
  assert.ok(t.game.over);
});
test("private Blob adapter bypasses caches and translates ETag conflicts", async () => {
  const { makeBlobStore } = await import("../server/store.js");
  class Precondition extends Error {}
  let getOptions, putOptions;
  const sdk = {
    BlobPreconditionFailedError: Precondition,
    async get(path, opts) {
      getOptions = { path, ...opts };
      return {
        stream: new Response(JSON.stringify({ version: 4 })).body,
        blob: { etag: "etag-4" },
      };
    },
    async put(path, body, opts) {
      putOptions = { path, ...opts };
      if (opts.ifMatch === "stale") throw new Precondition();
    },
  };
  const store = makeBlobStore(async () => sdk);
  const read = await store.read("ABCDEF12");
  assert.equal(read.etag, "etag-4");
  assert.equal(getOptions.useCache, false);
  assert.equal(getOptions.headers["Accept-Encoding"], "identity");
  assert.equal(getOptions.access, "private");
  await store.write("ABCDEF12", { version: 5 }, read.etag);
  assert.equal(putOptions.ifMatch, "etag-4");
  assert.equal(putOptions.allowOverwrite, true);
  assert.equal(putOptions.path, "tables/ABCDEF12.json");
  await assert.rejects(store.write("ABCDEF12", {}, "stale"), Conflict);
  await store.write("ABCDEF12", { version: 1 }, null);
  assert.equal(putOptions.allowOverwrite, false);
});
test("dashboard-prefixed Blob environment variables are passed to the SDK", async () => {
  const { makeBlobStore } = await import("../server/store.js");
  let options;
  class Precondition extends Error {}
  const store = makeBlobStore(
    async () => ({
      BlobPreconditionFailedError: Precondition,
      async put(p, b, o) {
        options = o;
      },
    }),
    {
      BLOB_READ_WRITE_TOKEN_STORE_ID: "store_test",
      BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN: "test-token",
    },
  );
  await store.write("ABCDEF12", { version: 1 }, null);
  assert.equal(options.storeId, "store_test");
  assert.equal(options.token, "test-token");
});
test("empty/oversized names, path-like codes, capacity and duplicate names", async () => {
  const f = await lobby();
  for (const n of ["", " ".repeat(2), "x".repeat(25)])
    await assert.rejects(
      f.service({ action: "create", name: n }),
      (e) => e.status === 400,
    );
  await assert.rejects(
    f.service({ action: "state", code: "../state" }),
    (e) => e.status === 400,
  );
  await assert.rejects(
    f.service({ action: "join", code: f.code, name: " second " }),
    (e) => e.status === 400,
  );
  for (let n = 3; n < 8; n++)
    await f.service({ action: "join", code: f.code, name: "Extra " + n });
  await assert.rejects(
    f.service({ action: "join", code: f.code, name: "Ninth" }),
    (e) => e.status === 409,
  );
});
