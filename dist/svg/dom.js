const SVG_NS = "http://www.w3.org/2000/svg";
/**
 * Makes the children of [element] the ones that [node] describes, changing as little of the DOM as it can:
 * an element of the same kind at the same place is kept, and only the attributes that differ are set. The
 * chart draws every frame of an animation this way, so elements are not made and thrown away 60 times a second.
 */
export function patchChildren(element, nodes) {
    const existing = element.childNodes;
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const current = existing[i];
        if (current === undefined) {
            element.appendChild(create(node));
        }
        else if (current.localName === node.tag) {
            patchAttributes(current, node.attrs);
            patchContent(current, node);
        }
        else {
            element.replaceChild(create(node), current);
        }
    }
    while (element.childNodes.length > nodes.length)
        element.removeChild(element.lastChild);
}
/** Makes [element] show [root]: its attributes and its children. */
export function patchElement(element, root) {
    patchAttributes(element, root.attrs);
    patchContent(element, root);
}
function patchContent(element, node) {
    if (node.text !== undefined) {
        if (element.textContent !== node.text)
            element.textContent = node.text;
    }
    else {
        patchChildren(element, node.children ?? []);
    }
}
function create(node) {
    const element = document.createElementNS(SVG_NS, node.tag);
    for (const [name, value] of Object.entries(node.attrs))
        element.setAttribute(name, String(value));
    if (node.text !== undefined)
        element.textContent = node.text;
    for (const child of node.children ?? [])
        element.appendChild(create(child));
    return element;
}
function patchAttributes(element, attrs) {
    for (const [name, value] of Object.entries(attrs)) {
        const text = String(value);
        if (element.getAttribute(name) !== text)
            element.setAttribute(name, text);
    }
    for (const attribute of Array.from(element.attributes)) {
        if (!(attribute.name in attrs) && attribute.name !== "xmlns")
            element.removeAttribute(attribute.name);
    }
}
