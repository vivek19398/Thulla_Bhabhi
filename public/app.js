import { patchView } from "./dom.js";
import { rank } from "./engine.js";
import {
  pollDelay,
  inviteConflict,
  retrySameCommand,
  groupHand,
} from "./client-policy.js";
let failures = 0,
  idle = 0,
  refreshing = false,
  pendingCommand = null,
  connection = "Connected";
function status(text) {
  connection = text;
  const node = document.querySelector("#connection");
  if (node) node.textContent = text;
}

const $ = (s) => document.querySelector(s),
  app = $("#app");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let session = null,
  table = null,
  poll = null,
  busy = false,
  lastError = "",
  home = false;
try {
  session = JSON.parse(localStorage.getItem("bhabhi-online-seat"));
} catch {}
function save() {
  localStorage.setItem("bhabhi-online-seat", JSON.stringify(session));
}
async function request(body) {
  const response = await fetch("/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("Game server unavailable. Please try again.");
  }
  if (!response.ok)
    throw Object.assign(Error(data.error || "Request failed."), {
      status: response.status,
    });
  return data;
}
function message(s) {
  lastError = s;
  const el = $("#notice");
  if (el) el.textContent = s;
}
function card(c, enabled = false) {
  return `<button class="card ${["♥", "♦"].includes(c.s) ? "red" : ""}" ${enabled ? "" : "disabled"} data-card="${esc(c.id)}" aria-label="${rank(c)} ${c.s}"><span>${rank(c)} ${c.s}</span><span class="pip">${c.s}</span><span class="bottom">${rank(c)} ${c.s}</span></button>`;
}
function schedule() {
  clearTimeout(poll);
  if (session && !home && !document.hidden)
    poll = setTimeout(
      refresh,
      pollDelay({ failures, idle, game: table?.game }),
    );
}
async function refresh() {
  if (!session || home || document.hidden || busy || refreshing)
    return schedule();
  refreshing = true;
  const requestedCode = session.code;
  status(failures ? "Reconnecting…" : "Connected");
  try {
    const d = await request({
      ...session,
      action: "state",
      ...(table ? { knownVersion: table.version } : {}),
    });
    if (home || busy || session.code !== requestedCode) return;
    failures = 0;
    status(pendingCommand ? "Move unconfirmed · retry safely" : "Connected");
    if (d.unchanged) {
      idle++;
      return;
    }
    if (table && d.table.version < table.version) return;
    idle = 0;
    const changed = !table || table.version !== d.table.version;
    table = d.table;
    if (changed || lastError) {
      if (!pendingCommand) lastError = "";
      render();
    }
  } catch (e) {
    failures++;
    status("Reconnecting…");
    if (e.status === 404) {
      lastError = e.message;
      table = null;
      pendingCommand = null;
      setup();
    } else if (e.status === 403) {
      lastError = e.message;
      setup();
    } else message(e.message);
  } finally {
    refreshing = false;
    schedule();
  }
}
function accept(d) {
  session = { code: d.table.code, token: d.token || session?.token };
  save();
  table = d.table;
  failures = 0;
  idle = 0;
  status("Connected");
  home = false;
  lastError = "";
  render();
  schedule();
}
async function command(action, extra = {}) {
  if (busy) return;
  const body = pendingCommand || {
    ...session,
    action,
    id: crypto.randomUUID(),
    version: table.version,
    ...extra,
  };
  pendingCommand = body;
  busy = true;
  lastError = "";
  status("Saving…");
  app
    .querySelectorAll("[data-card],#ready,#deal,#take,#confirm-reset")
    .forEach((b) => (b.disabled = true));
  try {
    const d = await retrySameCommand(request, body);
    pendingCommand = null;
    accept(d);
  } catch (e) {
    lastError = e.message;
    if (e.status && e.status < 500) {
      pendingCommand = null;
      if (e.status === 409) {
        try {
          table = (await request({ ...session, action: "state" })).table;
        } catch {}
      }
    }
    render();
    status(pendingCommand ? "Move unconfirmed · retry safely" : "Connected");
  } finally {
    busy = false;
    schedule();
  }
}
function setup() {
  if (busy) return;
  home = true;
  clearTimeout(poll);
  const invite = new URLSearchParams(location.search).get("table") || "";
  app.innerHTML = `<section class="intro"><img class="hero-logo" src="assets/bhabhi-tulla-logo.webp" alt="Bhabhi / Tulla card emblem" width="160" height="160"><p class="eyebrow">THE FAMILY TABLE</p><h1>Bhabhi / Tulla</h1><p class="intro-tagline">Your family. One table. Any phone.</p><p>Create a table and share its code. Everyone plays on their own device, with their own private hand.</p><form class="form" id="online-form"><label>Your name<input id="name" maxlength="24" autocomplete="nickname" required placeholder="Your name"></label><div class="mode-switch"><button type="button" id="create-tab" class="gold" aria-pressed="true">Create table</button><button type="button" id="join-tab" aria-pressed="false">Join with code</button></div><label id="title-label">Table name<input id="title" maxlength="24" value="Family table"></label><label id="code-label" hidden>Table code<input id="code" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="8-character code" value="${esc(invite)}"></label><p id="cleanup-note" class="muted">Creating a new table permanently replaces all older tables and ends their games.</p><p id="notice" class="error" role="status">${esc(lastError)}</p><button class="gold" id="submit">Create table ↗</button>${session ? '<button type="button" id="resume">Return to my table</button>' : ""}</form><p class="muted">3–8 people · Private hands · Rejoin after a refresh</p></section>`;
  let joining = false;
  function setJoin(value) {
    joining = value;
    $("#cleanup-note").hidden = value;
    $("#title-label").hidden = value;
    $("#code-label").hidden = !value;
    $("#submit").textContent = value ? "Join table ↗" : "Create table ↗";
    $("#create-tab").classList.toggle("gold", !value);
    $("#join-tab").classList.toggle("gold", value);
    $("#create-tab").setAttribute("aria-pressed", String(!value));
    $("#join-tab").setAttribute("aria-pressed", String(value));
  }
  $("#create-tab").onclick = () => setJoin(false);
  $("#join-tab").onclick = () => setJoin(true);
  if (invite) setJoin(true);
  $("#resume")?.addEventListener("click", () => {
    home = false;
    table = null;
    app.innerHTML =
      '<div class="privacy">Restoring your seat…<p id="notice" role="status"></p></div>';
    refresh();
  });
  $("#online-form").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("#submit").disabled = true;
    message("Connecting…");
    try {
      const code = $("#code").value.trim().toUpperCase();
      const body = {
        action: joining ? "join" : "create",
        name: $("#name").value.trim(),
        title: $("#title").value.trim(),
        code,
        ...(joining && session?.code === code ? { token: session.token } : {}),
      };
      accept(await request(body));
    } catch (e) {
      message(e.message);
      $("#submit").disabled = false;
    } finally {
      busy = false;
    }
  };
}
const collectedTricks = new Set();
function handView(g) {
  return groupHand(g.hand)
    .map(
      ({ suit, cards }) =>
        `<details class="suit-group" data-suit="${suit}" open><summary><span class="${["♥", "♦"].includes(suit) ? "red" : ""}">${suit}</span> ${cards.length} cards</summary><div class="hand suit-hand">${cards.map((c) => card(c, !pendingCommand && g.legal.includes(c.id))).join("")}</div></details>`,
    )
    .join("");
}
function inspectTrick() {
  const g = table?.game;
  if (!g) return;
  const cards = g.trick.length ? g.trick : g.lastTrick?.cards || [];
  $("#trick-content").innerHTML = cards.length
    ? cards
        .map(
          (x) =>
            `<div class="inspect-card">${card(x.card)}<span>${esc(table.players[x.player].name)}</span></div>`,
        )
        .join("")
    : "<p>No cards played yet.</p>";
  $("#trick-dialog").showModal();
}
function collectTrick(t) {
  const g = t.game;
  if (!g || g.trick.length || !g.lastTrick) return;
  const key = `${t.code}:${g.round}`;
  if (collectedTricks.has(key)) return;
  collectedTricks.add(key);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const destination = g.lastTrick.hit
    ? app.querySelector(`[data-seat="${g.lastTrick.winner}"]`)
    : app.querySelector(".discard-stack");
  if (!destination) return;
  const end = destination.getBoundingClientRect();
  const motions = [...app.querySelectorAll(".tossed-card")].map((node) => ({
    node,
    box: node.getBoundingClientRect(),
  }));
  for (const { node, box } of motions)
    node.animate(
      [
        { translate: "0 0", opacity: 1 },
        {
          translate: `${end.x + end.width / 2 - box.x - box.width / 2}px ${end.y + end.height / 2 - box.y - box.height / 2}px`,
          scale: ".4",
          opacity: 0,
        },
      ],
      { delay: 1400, duration: 500, easing: "ease-in", fill: "forwards" },
    );
}
let paintedRoom = null;
let paintedCards = new Set();
function roundTable(t) {
  const g = t.game;
  const initial = paintedRoom !== t.code;
  if (initial && g.lastTrick) collectedTricks.add(`${t.code}:${g.round}`);
  if (initial) paintedCards = new Set();
  paintedRoom = t.code;
  const completed = !g.trick.length && g.lastTrick;
  const cards = g.trick.length ? g.trick : g.lastTrick?.cards || [];
  const round = completed ? g.round - 1 : g.round;
  const seats = t.players
    .map((p, i) => {
      const relative = (i - t.seat + t.players.length) % t.players.length;
      const angle = Math.PI / 2 + (relative * 2 * Math.PI) / t.players.length;
      const x = 50 + Math.cos(angle) * 44,
        y = 50 + Math.sin(angle) * 44;
      return `<div data-seat="${i}" class="seat orbit-seat ${g.turn === i && !g.over ? "active" : ""} ${p.out ? "out" : ""}" style="left:${x}%;top:${y}%"><span class="avatar">${esc(p.name[0])}</span><b>${esc(p.name)}${i === t.seat ? " (you)" : ""}</b><span class="muted">${p.out ? "✓ Escaped" : `${p.count} cards`}</span></div>`;
    })
    .join("");
  const pile = cards
    .map((x, i) => {
      const key = `${round}:${x.player}:${x.card.id}`;
      const fresh = !initial && !paintedCards.has(key);
      paintedCards.add(key);
      const offset =
        (i - (cards.length - 1) / 2) *
        Math.min(25, 110 / Math.max(1, cards.length - 1));
      const tilt = ((x.card.r * 7 + x.player * 11) % 19) - 9;
      return `<div class="played tossed-card" data-play-key="${esc(key)}" data-from="${x.player}" data-fresh="${fresh}" style="--offset:${offset}px;--tilt:${tilt}deg;z-index:${i + 1}">${card(x.card)}<small>${esc(t.players[x.player].name)}</small></div>`;
    })
    .join("");
  return `<section class="round-stage" aria-label="Circular card table"><div class="round-felt"><div class="table-grain"></div><p class="eyebrow table-caption">${g.over ? "THE TABLE IS SETTLED" : completed ? (g.lastTrick.hit ? "TULLA · PICKED UP" : "TRICK DISCARDED") : g.trick.length ? `FOLLOW ${g.trick[0].card.s}` : "A FRESH LEAD"}<span>TRICK ${round}</span></p><div class="round-pile ${completed ? "completed-pile" : ""}">${pile || '<span class="muted">Waiting for the lead</span>'}</div><button class="inspect-trick" id="inspect">Inspect trick</button><div class="discard-stack" aria-label="Discard pile">♠<small>${g.wasteCount} out</small></div></div>${seats}</section>`;
}
function animateThrows() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  app
    .querySelectorAll('.tossed-card[data-fresh="true"]')
    .forEach((played, i) => {
      const origin = app.querySelector(`[data-seat="${played.dataset.from}"]`);
      const target = played.querySelector(".card");
      if (!origin || !target) return;
      const a = origin.getBoundingClientRect(),
        b = target.getBoundingClientRect();
      const dx = a.x + a.width / 2 - b.x - b.width / 2;
      const dy = a.y + a.height / 2 - b.y - b.height / 2;
      target.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px) rotate(-18deg) scale(.75)`,
            opacity: 0.4,
            filter: "drop-shadow(0 18px 12px #0005)",
          },
          {
            transform: `translate(${dx * 0.28}px, ${dy * 0.2 - 18}px) rotate(6deg) scale(1.06)`,
            opacity: 1,
            offset: 0.65,
          },
          {
            transform: "translate(0, -3px) rotate(-2deg) scale(1.01)",
            offset: 0.88,
          },
          { transform: "translate(0, 0) rotate(0) scale(1)" },
        ],
        {
          duration: 540,
          delay: i * 55,
          easing: "cubic-bezier(.2,.7,.25,1)",
          fill: "backwards",
        },
      );
    });
}
function render() {
  if (!table) return setup();
  home = false;
  const t = table,
    g = t.game,
    me = t.players[t.seat];
  if (!g) {
    paintedRoom = null;
    paintedCards.clear();
    collectedTricks.clear();
  }
  const humanTurn = g && g.turn === t.seat && !g.over;
  patchView(
    app,
    `<div class="table-head"><div><p class="eyebrow">${esc(t.title)}</p><h2 style="margin:0">Bhabhi / Tulla</h2></div><div class="table-code"><span class="muted">TABLE CODE</span><b>${esc(t.code)}</b><button id="invite">Copy invite</button></div></div><p id="connection" class="connection" role="status">${esc(connection)}</p><p id="notice" class="error" role="alert">${esc(lastError)}</p>${pendingCommand ? '<button class="gold" id="retry-move">Retry unconfirmed move</button>' : ""}${!g ? `<section class="seats" aria-label="Players">${t.players.map((p, i) => `<div class="seat ${g?.turn === i && !g?.over ? "active" : ""} ${p.out ? "out" : ""}"><span class="avatar">${esc(p.name[0])}</span><b>${esc(p.name)}${i === t.seat ? " (you)" : ""}</b><span class="muted">${g ? (p.out ? "✓ Escaped" : `${p.count} cards`) : p.ready ? "✓ Ready" : "Getting ready"}${i === 0 ? " · host" : ""}</span></div>`).join("")}</section>` : ""}${
      !g
        ? `<section class="privacy lobby"><p class="eyebrow">PULL UP A CHAIR</p><h2>${t.players.length} / 8 players at the table</h2><p class="muted">Share code <b>${esc(t.code)}</b> with your family.<br>At least 3 players must join and everyone must be ready.</p><button class="gold" id="ready">${me.ready ? "Not ready" : "I’m ready"}</button>${t.host ? `<button id="deal" ${t.players.length < 3 || t.players.some((p) => !p.ready) ? "disabled" : ""}>Shuffle & deal</button>` : '<p class="muted">The host deals when everyone is ready.</p>'}</section>`
        : `<div class="banner" role="status">${g.over ? `${esc(t.players[g.loser].name)} is the last holding cards.` : esc(g.message)}</div>${roundTable(t)}<section class="hand-head"><p class="eyebrow">${esc(me.name)} · ${g.hand.length} cards</p><h2>${g.over ? "One more round?" : me.out ? "You’re safely away." : humanTurn ? "Your move. Make it count." : `Waiting for ${esc(t.players[g.turn].name)}…`}</h2><p class="muted">${g.over ? "The host can return everyone to the lobby." : humanTurn ? "Tap a highlighted card to play. Follow suit if you can." : "Your hand stays private on this device."}</p><div class="grouped-hand" aria-label="Your cards">${handView(g)}</div>${g.canTake ? '<button id="take">Take the next player’s hand</button>' : ""}</section><details class="feed"><summary>At the table · recent tricks</summary>${g.lastTrick ? `<p>Last trick: ${g.lastTrick.cards.map((x) => `${esc(t.players[x.player].name)} ${rank(x.card)}${x.card.s}`).join(" · ")}</p>` : ""}${g.history.map((s) => `<div>${esc(s)}</div>`).join("")}</details>${t.host ? '<div class="actions"><button id="reset">Return everyone to lobby</button></div>' : ""}`
    }<footer>Code ${esc(t.code)} · Saved after every move · Refresh to restore your seat<br>Keep this browser’s data to keep your seat.</footer><dialog id="trick-dialog"><button id="close-trick">Close ✕</button><h2>Cards on the table</h2><div id="trick-content" class="inspect-grid"></div></dialog><dialog id="reset-dialog"><h2>Start fresh at this table?</h2><p>This replaces the current game. Everyone returns to the lobby and marks ready before a new deal.</p><button id="cancel-reset">Keep playing</button><button class="gold" id="confirm-reset">Return to lobby</button></dialog>`,
  );
  animateThrows();
  collectTrick(t);
  if ($("#retry-move")) $("#retry-move").onclick = () => command();
  if ($("#inspect")) $("#inspect").onclick = inspectTrick;
  $("#close-trick").onclick = () => $("#trick-dialog").close();
  $("#invite").onclick = async () => {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("table", t.code);
    try {
      await navigator.clipboard.writeText(url.href);
      message("Invite copied. Share it with your family.");
    } catch {
      message(`Share this code: ${t.code}`);
    }
  };
  if ($("#ready")) $("#ready").onclick = () => command("ready");
  if ($("#deal")) $("#deal").onclick = () => command("start");
  if ($("#take")) $("#take").onclick = () => command("take");
  app
    .querySelectorAll("[data-card]:not(:disabled)")
    .forEach(
      (b) => (b.onclick = () => command("play", { card: b.dataset.card })),
    );
  if ($("#reset")) $("#reset").onclick = () => $("#reset-dialog").showModal();
  $("#cancel-reset").onclick = () => $("#reset-dialog").close();
  $("#confirm-reset").onclick = () => command("lobby");
}
$("#rules").onclick = () => $("#help").showModal();
$("#close").onclick = () => $("#help").close();
$("#new").onclick = () => {
  if (!busy && !pendingCommand) setup();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(poll);
  else if (!home) refresh();
});
const invitedCode = new URLSearchParams(location.search)
  .get("table")
  ?.toUpperCase();
if (inviteConflict(invitedCode, session)) {
  home = true;
  app.innerHTML = `<section class="privacy"><p class="eyebrow">YOU HAVE AN INVITATION</p><h2>Which table?</h2><p>You have a saved seat at ${esc(session.code)} and an invite to ${esc(invitedCode)}.</p><button class="gold" id="join-invited">Join invited table</button><button id="saved-table">Return to saved table</button></section>`;
  $("#join-invited").onclick = setup;
  $("#saved-table").onclick = () => {
    home = false;
    refresh();
  };
} else if (session) {
  app.innerHTML =
    '<div class="privacy">Restoring your table…<p id="notice" role="status"></p><button id="other">Create or join a different table</button></div>';
  $("#other").onclick = setup;
  refresh();
} else setup();
