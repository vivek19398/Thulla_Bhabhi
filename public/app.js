import { rank } from "./engine.js";
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
  if (session && !home && !document.hidden) poll = setTimeout(refresh, 1800);
}
async function refresh() {
  if (!session || home || document.hidden || busy) return schedule();
  try {
    const d = await request({ ...session, action: "state" });
    if (table && d.table.version < table.version) return;
    const changed = !table || table.version !== d.table.version;
    table = d.table;
    if (changed || lastError) {
      lastError = "";
      render();
    }
  } catch (e) {
    message(e.message + " Reconnecting…");
  }
  schedule();
}
function accept(d) {
  session = { code: d.table.code, token: d.token || session?.token };
  save();
  table = d.table;
  home = false;
  lastError = "";
  render();
  schedule();
}
async function command(action, extra = {}) {
  if (busy) return;
  busy = true;
  message("Saving…");
  app.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    accept(
      await request({
        ...session,
        action,
        id: crypto.randomUUID(),
        version: table.version,
        ...extra,
      }),
    );
  } catch (e) {
    lastError = e.message;
    if (e.status === 409) {
      try {
        table = (await request({ ...session, action: "state" })).table;
      } catch {}
    }
    render();
  } finally {
    busy = false;
    schedule();
  }
}
function setup() {
  home = true;
  clearTimeout(poll);
  const invite = new URLSearchParams(location.search).get("table") || "";
  app.innerHTML = `<section class="intro"><img class="hero-logo" src="assets/bhabhi-tulla-logo.webp" alt="Bhabhi / Tulla card emblem" width="160" height="160"><p class="eyebrow">THE FAMILY TABLE</p><h1>Bhabhi / Tulla</h1><p class="intro-tagline">Your family. One table. Any phone.</p><p>Create a table and share its code. Everyone plays on their own device, with their own private hand.</p><form class="form" id="online-form"><label>Your name<input id="name" maxlength="24" autocomplete="nickname" required placeholder="Your name"></label><div class="mode-switch"><button type="button" id="create-tab" class="gold" aria-pressed="true">Create table</button><button type="button" id="join-tab" aria-pressed="false">Join with code</button></div><label id="title-label">Table name<input id="title" maxlength="24" value="Family table"></label><label id="code-label" hidden>Table code<input id="code" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="8-character code" value="${esc(invite)}"></label><p id="notice" class="error" role="status">${esc(lastError)}</p><button class="gold" id="submit">Create table ↗</button>${session ? '<button type="button" id="resume">Return to my table</button>' : ""}</form><p class="muted">3–8 people · Private hands · Rejoin after a refresh</p></section>`;
  let joining = false;
  function setJoin(value) {
    joining = value;
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
function render() {
  if (!table) return setup();
  home = false;
  const t = table,
    g = t.game,
    me = t.players[t.seat];
  const humanTurn = g && g.turn === t.seat && !g.over;
  app.innerHTML = `<div class="table-head"><div><p class="eyebrow">${esc(t.title)}</p><h2 style="margin:0">Bhabhi / Tulla</h2></div><div class="table-code"><span class="muted">TABLE CODE</span><b>${esc(t.code)}</b><button id="invite">Copy invite</button></div></div><p id="notice" class="error" role="status">${esc(lastError)}</p><section class="seats" aria-label="Players">${t.players.map((p, i) => `<div class="seat ${g?.turn === i && !g?.over ? "active" : ""} ${p.out ? "out" : ""}"><span class="avatar">${esc(p.name[0])}</span><b>${esc(p.name)}${i === t.seat ? " (you)" : ""}</b><span class="muted">${g ? (p.out ? "✓ Escaped" : `${p.count} cards`) : p.ready ? "✓ Ready" : "Getting ready"}${i === 0 ? " · host" : ""}</span></div>`).join("")}</section>${
    !g
      ? `<section class="privacy lobby"><p class="eyebrow">PULL UP A CHAIR</p><h2>${t.players.length} / 8 players at the table</h2><p class="muted">Share code <b>${esc(t.code)}</b> with your family.<br>At least 3 players must join and everyone must be ready.</p><button class="gold" id="ready">${me.ready ? "Not ready" : "I’m ready"}</button>${t.host ? `<button id="deal" ${t.players.length < 3 || t.players.some((p) => !p.ready) ? "disabled" : ""}>Shuffle & deal</button>` : '<p class="muted">The host deals when everyone is ready.</p>'}</section>`
      : `<div class="banner" role="status">${g.over ? `${esc(t.players[g.loser].name)} is the last holding cards.` : esc(g.message)}</div><section class="arena"><p class="eyebrow">${g.over ? "THE TABLE IS SETTLED" : g.trick.length ? `FOLLOW ${g.trick[0].card.s}` : "A FRESH LEAD"} · TRICK ${g.round}</p><div class="pile">${g.trick.length ? g.trick.map((x) => `<div class="played">${card(x.card)}<small>${esc(t.players[x.player].name)}</small></div>`).join("") : `<span class="muted">${g.over ? "Until the next deal." : `${esc(t.players[g.turn].name)} to lead`}</span>`}</div></section><section class="hand-head"><p class="eyebrow">${esc(me.name)} · ${g.hand.length} cards</p><h2>${g.over ? "One more round?" : me.out ? "You’re safely away." : humanTurn ? "Your move. Make it count." : `Waiting for ${esc(t.players[g.turn].name)}…`}</h2><p class="muted">${g.over ? "The host can return everyone to the lobby." : humanTurn ? "Tap a highlighted card to play. Follow suit if you can." : "Your hand stays private on this device."}</p><div class="hand" aria-label="Your cards">${[
          ...g.hand,
        ]
          .sort((a, b) => a.s.localeCompare(b.s) || a.r - b.r)
          .map((c) => card(c, g.legal.includes(c.id)))
          .join(
            "",
          )}</div>${g.canTake ? '<button id="take">Take the next player’s hand</button>' : ""}</section><details class="feed"><summary>At the table · recent tricks</summary>${g.lastTrick ? `<p>Last trick: ${g.lastTrick.cards.map((x) => `${esc(t.players[x.player].name)} ${rank(x.card)}${x.card.s}`).join(" · ")}</p>` : ""}${g.history.map((s) => `<div>${esc(s)}</div>`).join("")}</details>${t.host ? '<div class="actions"><button id="reset">Return everyone to lobby</button></div>' : ""}`
  }<footer>Code ${esc(t.code)} · Saved after every move · Refresh to restore your seat<br>Keep this browser’s data to keep your seat.</footer><dialog id="reset-dialog"><h2>Start fresh at this table?</h2><p>This replaces the current game. Everyone returns to the lobby and marks ready before a new deal.</p><button id="cancel-reset">Keep playing</button><button class="gold" id="confirm-reset">Return to lobby</button></dialog>`;
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
  $("#ready")?.addEventListener("click", () => command("ready"));
  $("#deal")?.addEventListener("click", () => command("start"));
  $("#take")?.addEventListener("click", () => command("take"));
  app
    .querySelectorAll("[data-card]:not(:disabled)")
    .forEach(
      (b) => (b.onclick = () => command("play", { card: b.dataset.card })),
    );
  $("#reset")?.addEventListener("click", () => $("#reset-dialog").showModal());
  $("#cancel-reset")?.addEventListener("click", () =>
    $("#reset-dialog").close(),
  );
  $("#confirm-reset")?.addEventListener("click", () => command("lobby"));
}
$("#rules").onclick = () => $("#help").showModal();
$("#close").onclick = () => $("#help").close();
$("#new").onclick = setup;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(poll);
  else if (!home) refresh();
});
if (session) {
  app.innerHTML =
    '<div class="privacy">Restoring your table…<p id="notice" role="status"></p><button id="other">Create or join a different table</button></div>';
  $("#other").onclick = setup;
  refresh();
} else setup();
