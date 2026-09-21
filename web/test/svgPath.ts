// A small reader for the path data that the core writes (absolute M, L, A and Z only), and the
// geometry to check it with.

export interface Point {
  x: number;
  y: number;
}

export type Primitive =
  | { kind: "line"; from: Point; to: Point }
  | { kind: "arc"; from: Point; to: Point; center: Point; radius: number; clockwise: boolean };

/** The subpaths of [d], each as the primitives that draw it, closing line included when it has a length. */
export function parsePath(d: string): Primitive[][] {
  const subpaths: Primitive[][] = [];
  let current: Primitive[] = [];
  let pen: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  for (const [, command, rest] of d.matchAll(/([MLAZ])([^MLAZ]*)/g)) {
    const n = (rest ?? "").trim().split(/\s+/).filter(Boolean).map(Number);
    if (command === "M") {
      current = [];
      subpaths.push(current);
      pen = start = { x: n[0]!, y: n[1]! };
    } else if (command === "L") {
      const to = { x: n[0]!, y: n[1]! };
      current.push({ kind: "line", from: pen, to });
      pen = to;
    } else if (command === "A") {
      const [radius, , , large, sweep, x, y] = n as [number, number, number, number, number, number, number];
      const to = { x, y };
      current.push({ kind: "arc", from: pen, to, radius, clockwise: sweep === 1, center: arcCenter(pen, to, radius, large === 1, sweep === 1) });
      pen = to;
    } else if (command === "Z") {
      if (Math.hypot(pen.x - start.x, pen.y - start.y) > 1e-6) current.push({ kind: "line", from: pen, to: start });
      pen = start;
    }
  }
  return subpaths;
}

/** The center of the circle of [radius] that an SVG arc from [from] to [to] with these flags lies on. */
function arcCenter(from: Point, to: Point, radius: number, large: boolean, clockwise: boolean): Point {
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const squared = dx * dx + dy * dy;
  const factor = Math.sqrt(Math.max(0, (radius * radius - squared) / squared));
  const sign = large === clockwise ? -1 : 1;
  return { x: sign * factor * dy + (from.x + to.x) / 2, y: sign * factor * -dx + (from.y + to.y) / 2 };
}

const unit = (x: number, y: number): Point => {
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
};

/** The direction a primitive is travelled in, where it starts and where it ends. */
export function tangents(p: Primitive): { start: Point; end: Point } {
  if (p.kind === "line") {
    const t = unit(p.to.x - p.from.x, p.to.y - p.from.y);
    return { start: t, end: t };
  }
  const at = (q: Point): Point => {
    const t = unit(-(q.y - p.center.y), q.x - p.center.x);
    return p.clockwise ? t : { x: -t.x, y: -t.y };
  };
  return { start: at(p.from), end: at(p.to) };
}

/**
 * How many times the primitives, in order, turn a corner where they meet (they must be connected, and
 * they are taken as a loop). A shape with rounded corners turns none.
 */
export function cornerCount(primitives: readonly Primitive[], tolerance = 1e-3): number {
  let corners = 0;
  for (let i = 0; i < primitives.length; i++) {
    const a = primitives[i]!;
    const b = primitives[(i + 1) % primitives.length]!;
    if (Math.hypot(a.to.x - b.from.x, a.to.y - b.from.y) > tolerance) throw new Error("the outline is broken");
    const end = tangents(a).end;
    const start = tangents(b).start;
    if (Math.hypot(end.x - start.x, end.y - start.y) > 0.02) corners++;
  }
  return corners;
}
