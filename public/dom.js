function nodeKey(node) {
  if (node.nodeType !== 1) return null;
  return (
    node.id ||
    node.dataset.card ||
    node.dataset.seat ||
    node.dataset.suit ||
    node.dataset.region ||
    node.classList[0] ||
    null
  );
}
function patchChildren(parent, next) {
  const old = [...parent.childNodes],
    used = new Set();
  let position = 0;
  for (const incoming of [...next.childNodes]) {
    const key = nodeKey(incoming);
    let current = old.find(
      (n) =>
        !used.has(n) &&
        n.nodeType === incoming.nodeType &&
        (n.nodeType !== 1 || n.tagName === incoming.tagName) &&
        (key ? nodeKey(n) === key : !nodeKey(n)),
    );
    if (!current) {
      current = incoming.cloneNode(true);
    } else if (current.nodeType === 3) {
      if (current.textContent !== incoming.textContent)
        current.textContent = incoming.textContent;
    } else if (current.nodeType === 1) {
      for (const attr of [...current.attributes])
        if (
          !incoming.hasAttribute(attr.name) &&
          !(
            attr.name === "open" &&
            ["DETAILS", "DIALOG"].includes(current.tagName)
          )
        )
          current.removeAttribute(attr.name);
      for (const attr of incoming.attributes)
        if (
          !(
            attr.name === "open" &&
            ["DETAILS", "DIALOG"].includes(current.tagName)
          ) &&
          current.getAttribute(attr.name) !== attr.value
        )
          current.setAttribute(attr.name, attr.value);
      if (!(current.id === "trick-content" && current.closest("dialog")?.open))
        patchChildren(current, incoming);
    }
    used.add(current);
    if (parent.childNodes[position] !== current)
      parent.insertBefore(current, parent.childNodes[position] || null);
    position++;
  }
  for (const node of old) if (!used.has(node)) node.remove();
}
export function patchView(parent, html) {
  const document = parent.ownerDocument;
  const focused = document.activeElement;
  const template = document.createElement("template");
  template.innerHTML = html;
  patchChildren(parent, template.content);
  if (focused?.isConnected && document.activeElement !== focused)
    focused.focus({ preventScroll: true });
}
