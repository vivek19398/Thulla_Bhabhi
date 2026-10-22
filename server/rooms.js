import { createHash, randomBytes, randomInt } from "node:crypto";
import { createGame, legal, play, takeNext } from "../public/engine.js";
import { Conflict } from "./store.js";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const name = (s) => {
  if (typeof s !== "string" || !s.trim() || s.trim().length > 24)
    fail(400, "Enter a name of 1–24 characters.");
  return s.trim();
};
export function view(r, seat) {
  const g = r.game;
  return {
    code: r.code,
    title: r.title,
    version: r.version,
    seat,
    host: seat === 0,
    players: r.members.map((m, i) => ({
      name: m.name,
      ready: m.ready,
      count: g?.players[i].hand.length ?? 0,
      out: g?.players[i].out ?? false,
    })),
    game: g
      ? {
          turn: g.turn,
          trick: g.trick,
          lastTrick: g.lastTrick,
          round: g.round,
          wasteCount: g.waste.length,
          over: g.over,
          loser: g.loser,
          message: g.message,
          history: g.history,
          hand: g.players[seat].hand,
          legal: g.turn === seat ? legal(g).map((c) => c.id) : [],
          canTake:
            g.turn === seat &&
            !g.over &&
            !g.first &&
            !g.trick.length &&
            !g.forced,
        }
      : null,
  };
}
export function roomService(store) {
  return async (b) => {
    if (!b || typeof b !== "object") fail(400, "Invalid request.");
    if (b.action === "create") {
      const token = randomBytes(32).toString("hex");
      const code = randomBytes(4).toString("hex").toUpperCase();
      const r = {
        code,
        title: name(b.title || "Family table"),
        members: [{ name: name(b.name), tokenHash: hash(token), ready: false }],
        game: null,
        version: 1,
        receipts: [],
        updatedAt: new Date().toISOString(),
      };
      // Snapshot before creating so a simultaneous, newer table is never swept.
      const olderTables = await store.listTables();
      await store.write(code, r, null);
      await store.deleteTables(olderTables.filter((old) => old !== code));
      return { table: view(r, 0), token };
    }
    if (typeof b.code !== "string" || !/^[A-F0-9]{8}$/.test(b.code))
      fail(400, "Enter an eight-character table code.");
    const loaded = await store.read(b.code);
    if (!loaded)
      fail(
        404,
        "This table no longer exists. A new table may have replaced it.",
      );
    const { room: r, etag } = loaded;
    let seat =
      typeof b.token === "string"
        ? r.members.findIndex((m) => m.tokenHash === hash(b.token))
        : -1;
    let token;
    if (b.action === "join" && seat < 0) {
      if (r.game || r.members.length >= 8)
        fail(409, "This table has started or is full.");
      const n = name(b.name);
      if (r.members.some((m) => m.name.toLowerCase() === n.toLowerCase()))
        fail(400, "Choose a different player name.");
      token = randomBytes(32).toString("hex");
      r.members.push({ name: n, tokenHash: hash(token), ready: false });
      seat = r.members.length - 1;
    } else {
      if (seat < 0)
        fail(403, "Your seat could not be restored. Join the table again.");
      if (["state", "join"].includes(b.action)) return { table: view(r, seat) };
      if (typeof b.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(b.id))
        fail(400, "Missing move ID.");
      const receipt = `${seat}:${b.id}`;
      if (r.receipts.includes(receipt)) return { table: view(r, seat) };
      if (b.version !== r.version)
        fail(409, "The table changed. Refreshing; try your move again.");
      switch (b.action) {
        case "ready":
          if (r.game) fail(400, "Game already started.");
          r.members[seat].ready = !r.members[seat].ready;
          break;
        case "start":
          if (seat !== 0) fail(403, "Only the host can deal.");
          if (r.game && !r.game.over)
            fail(400, "Finish the current game or return to the lobby first.");
          if (r.members.length < 3 || r.members.some((m) => !m.ready))
            fail(400, "At least three players must all be ready.");
          r.game = createGame(
            r.members.map((m) => m.name),
            rng,
          );
          break;
        case "lobby":
          if (seat !== 0) fail(403, "Only the host can reset the table.");
          r.game = null;
          r.members.forEach((m) => (m.ready = false));
          break;
        case "play":
        case "take":
          if (!r.game || r.game.over || r.game.turn !== seat)
            fail(400, "Wait for your turn.");
          try {
            r.game =
              b.action === "play"
                ? play(r.game, b.card, rng)
                : takeNext(r.game);
          } catch (e) {
            fail(400, e.message);
          }
          break;
        default:
          fail(400, "Unknown request.");
      }
      r.receipts.push(receipt);
      r.receipts = r.receipts.slice(-128);
    }
    r.version++;
    r.updatedAt = new Date().toISOString();
    try {
      await store.write(r.code, r, etag);
    } catch (e) {
      if (e instanceof Conflict)
        fail(409, "Another move arrived first. Refreshing; please try again.");
      throw e;
    }
    return { table: view(r, seat), ...(token ? { token } : {}) };
  };
}
