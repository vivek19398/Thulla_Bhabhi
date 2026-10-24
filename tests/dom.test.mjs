import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { patchView } from "../public/dom.js";
const fixture = () => {
  const dom = new JSDOM('<main id="app"></main>');
  return {
    doc: dom.window.document,
    root: dom.window.document.querySelector("main"),
  };
};
test("card DOM identity, focus and collapsed suit choice survive updates", () => {
  const { doc, root } = fixture();
  const html = (n) =>
    `<details data-suit="♥" open><summary>Hearts</summary><button data-card="♥2">${n}</button></details>`;
  patchView(root, html(1));
  const group = root.querySelector("details"),
    card = root.querySelector("button");
  group.open = false;
  card.focus();
  patchView(root, html(2));
  assert.strictEqual(root.querySelector("button"), card);
  assert.equal(card.textContent, "2");
  assert.equal(group.open, false);
  assert.strictEqual(doc.activeElement, card);
});
test("an open inspector and its inspected snapshot survive background updates", () => {
  const { root } = fixture();
  const html =
    '<dialog id="trick-dialog"><div id="trick-content"></div><button id="close">Close</button></dialog>';
  patchView(root, html);
  const dialog = root.querySelector("dialog");
  dialog.open = true;
  root.querySelector("#trick-content").textContent = "Inspected ace";
  patchView(root, html);
  assert.strictEqual(root.querySelector("dialog"), dialog);
  assert.equal(dialog.open, true);
  assert.equal(
    root.querySelector("#trick-content").textContent,
    "Inspected ace",
  );
});
test("removed cards disappear, new cards are inserted in order, and legal state updates", () => {
  const { root } = fixture();
  patchView(
    root,
    '<div class="hand"><button data-card="A">A</button><button data-card="B">B</button></div>',
  );
  const b = root.querySelector('[data-card="B"]');
  patchView(
    root,
    '<div class="hand"><button data-card="B" disabled>B</button><button data-card="C">C</button></div>',
  );
  assert.strictEqual(root.querySelector('[data-card="B"]'), b);
  assert.ok(b.disabled);
  assert.deepEqual(
    [...root.querySelectorAll("button")].map((b) => b.dataset.card),
    ["B", "C"],
  );
});
test("new-trick cards get new wrappers so finished collection animations cannot hide them", () => {
  const { root } = fixture();
  patchView(
    root,
    '<div class="round-pile"><div class="played" data-play-key="1:0:A">A</div></div>',
  );
  const previous = root.querySelector(".played");
  patchView(
    root,
    '<div class="round-pile"><div class="played" data-play-key="2:0:A">A</div></div>',
  );
  assert.notStrictEqual(root.querySelector(".played"), previous);
  assert.equal(previous.isConnected, false);
});
