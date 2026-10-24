export function pollDelay({ failures = 0, idle = 0, game = null } = {}) {
  if (failures) return Math.min(30000, 2000 * 2 ** Math.min(failures - 1, 4));
  if (!game) return idle >= 3 ? 8000 : 4000;
  return game.over ? 10000 : 1600;
}
export function inviteConflict(code, session) {
  return (
    /^[A-F0-9]{8}$/.test(code || "") && !!session?.code && code !== session.code
  );
}
export async function retrySameCommand(
  send,
  body,
  { pause = (ms) => new Promise((r) => setTimeout(r, ms)) } = {},
) {
  try {
    return await send(body);
  } catch (e) {
    if (e.status && e.status < 500) throw e;
    await pause(700);
    return send(body);
  }
}
export function groupHand(hand) {
  return ["♠", "♥", "♣", "♦"]
    .map((suit) => ({
      suit,
      cards: hand.filter((c) => c.s === suit).sort((a, b) => a.r - b.r),
    }))
    .filter((g) => g.cards.length);
}
