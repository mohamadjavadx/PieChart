import type { SvgNode } from "./nodes.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Makes the children of [element] the ones that [node] describes, changing as little of the DOM as it can:
 * an element of the same kind at the same place is kept, and only the attributes that differ are set. The
 * chart draws every frame of an animation this way, so elements are not made and thrown away 60 times a second.
 */
export function patchChildren(element: Element, nodes: readonly SvgNode[]): void {
  const existing = element.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const current = existing[i] as Element | undefined;
    if (current === undefined) {
      element.appendChild(create(node));
    } else if (current.localName === node.tag) {
      patchAttributes(current, node.attrs);
      patchChildren(current, node.children ?? []);
    } else {
      element.replaceChild(create(node), current);
    }
  }
  while (element.childNodes.length > nodes.length) element.removeChild(element.lastChild!);
}

/** Makes [element] show [root]: its attributes and its children. */
export function patchElement(element: Element, root: SvgNode): void {
  patchAttributes(element, root.attrs);
  patchChildren(element, root.children ?? []);
}

function create(node: SvgNode): Element {
  const element = document.createElementNS(SVG_NS, node.tag);
  for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, String(value));
  for (const child of node.children ?? []) element.appendChild(create(child));
  return element;
}

function patchAttributes(element: Element, attrs: SvgNode["attrs"]): void {
  for (const [name, value] of Object.entries(attrs)) {
    const text = String(value);
    if (element.getAttribute(name) !== text) element.setAttribute(name, text);
  }
  for (const attribute of Array.from(element.attributes)) {
    if (!(attribute.name in attrs) && attribute.name !== "xmlns") element.removeAttribute(attribute.name);
  }
}
