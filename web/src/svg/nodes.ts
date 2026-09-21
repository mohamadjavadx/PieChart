import type { OutlinePath } from "../core/ringPath.ts";
import type { Scene } from "../chart/scene.ts";
import type { SvgNode } from "./node.ts";

export type { SvgAttributes, SvgNode } from "./node.ts";

// A scene as a tree of SVG elements: plain data, so that it can be written as text (for a server, a test
// or a file) and also patched into the DOM (see dom.ts) with the same result.

export interface SvgOptions {
  /** Makes the ids inside the SVG (of the band's mask) unique on a page that has several charts. */
  readonly idPrefix?: string;
}

/** The elements that draw [scene]. */
export function sceneToNodes(scene: Scene, options: SvgOptions = {}): SvgNode {
  const prefix = options.idPrefix ?? "pie";
  const children: SvgNode[] = [];

  if (scene.placeholder) {
    children.push(pathNode(scene.placeholder.path, scene.placeholder.color, 1));
  }
  for (const slice of scene.slices) children.push(pathNode(slice.path, slice.color, slice.opacity));

  const band = scene.band;
  if (band) {
    const maskId = `${prefix}-band`;
    children.push({
      tag: "defs",
      attrs: {},
      children: [
        {
          tag: "mask",
          attrs: { id: maskId, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: scene.width, height: scene.height },
          children: [pathNode(band.outline, "#fff", 1)],
        },
      ],
    });
    children.push({
      tag: "g",
      attrs: { ...(band.opacity < 1 ? { opacity: number(band.opacity) } : {}), mask: `url(#${maskId})` },
      children: band.sectors.map((sector) => pathNode(sector.path, sector.color, sector.opacity)),
    });
  }

  // What is in the hole, on top of everything, faded as a whole.
  if (scene.center && scene.center.nodes.length > 0) {
    children.push({
      tag: "g",
      attrs: scene.center.opacity < 1 ? { opacity: number(scene.center.opacity) } : {},
      children: scene.center.nodes,
    });
  }

  return {
    tag: "svg",
    attrs: {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${number(scene.width)} ${number(scene.height)}`,
      width: number(scene.width),
      height: number(scene.height),
    },
    children,
  };
}

function pathNode(path: OutlinePath, color: string, opacity: number): SvgNode {
  return {
    tag: "path",
    attrs: {
      d: path.d,
      fill: color,
      ...(opacity < 1 ? { opacity: number(opacity) } : {}),
      ...(path.evenOdd ? { "fill-rule": "evenodd" } : {}),
    },
  };
}

/** A number with at most 4 decimals and no trailing zeros. */
const number = (value: number): string => String(Number(value.toFixed(4)));

const escapeAttribute = (value: string | number): string =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const escapeText = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** [node] as SVG text. */
export function nodeToString(node: SvgNode): string {
  const attrs = Object.entries(node.attrs).map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join("");
  if (node.text !== undefined) return `<${node.tag}${attrs}>${escapeText(node.text)}</${node.tag}>`;
  if (!node.children || node.children.length === 0) return `<${node.tag}${attrs}/>`;
  return `<${node.tag}${attrs}>${node.children.map(nodeToString).join("")}</${node.tag}>`;
}

/** [scene] as SVG text. */
export const sceneToSvg = (scene: Scene, options?: SvgOptions): string => nodeToString(sceneToNodes(scene, options));
