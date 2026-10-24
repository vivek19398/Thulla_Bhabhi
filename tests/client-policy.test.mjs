import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pollDelay,
  inviteConflict,
  retrySameCommand,
  groupHand,
} from "../public/client-policy.js";
test("polling slows in idle lobbies, remains responsive in play, and backs off with a cap", () => {
  assert.equal(pollDelay({}), 4000);
  assert.equal(pollDelay({ idle: 4 }), 8000);
  assert.equal(pollDelay({ game: { over: false } }), 1600);
  assert.equal(pollDelay({ game: { over: true } }), 10000);
  assert.equal(pollDelay({ failures: 1 }), 2000);
  assert.equal(pollDelay({ failures: 10 }), 30000);
});
test("different invites require a choice; same saved seat resumes", () => {
  assert.equal(inviteConflict("ABCDEF12", { code: "ABCDEF13" }), true);
  assert.equal(inviteConflict("ABCDEF12", { code: "ABCDEF12" }), false);
  assert.equal(inviteConflict("bad", { code: "ABCDEF12" }), false);
  assert.equal(inviteConflict("ABCDEF12", null), false);
});
test("uncertain response retries exactly the same command and version", async () => {
  const body = { id: "same-command", version: 4 };
  const sent = [];
  const answer = await retrySameCommand(
    async (b) => {
      sent.push(b);
      if (sent.length === 1) throw new TypeError("Network failed");
      return { ok: true };
    },
    body,
    { pause: async () => {} },
  );
  assert.equal(answer.ok, true);
  assert.equal(sent.length, 2);
  assert.strictEqual(sent[0], sent[1]);
  assert.equal(sent[1].id, "same-command");
});
test("validation and conflict errors are never blindly retried", async () => {
  let calls = 0;
  await assert.rejects(
    retrySameCommand(
      async () => {
        calls++;
        throw Object.assign(Error("Conflict"), { status: 409 });
      },
      {},
      { pause: async () => {} },
    ),
  );
  assert.equal(calls, 1);
});
test("grouping sorts within suits without mutating hand or hiding cards", () => {
  const hand = [
    { s: "♥", r: 14 },
    { s: "♠", r: 9 },
    { s: "♥", r: 2 },
  ];
  const before = JSON.stringify(hand);
  const groups = groupHand(hand);
  assert.deepEqual(
    groups.map((g) => g.suit),
    ["♠", "♥"],
  );
  assert.deepEqual(
    groups[1].cards.map((c) => c.r),
    [2, 14],
  );
  assert.equal(JSON.stringify(hand), before);
  assert.equal(groups.flatMap((g) => g.cards).length, 3);
});
