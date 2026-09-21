import { clamp, MAX_DEG, toDegrees, toRadians } from "./math.ts";

// Builds the outline of a donut slice, or of a whole ring, between two radii around a center, as SVG
// path data. A port of the Android library's RingPathBuilder.kt: the angles are in degrees, clockwise
// from 3 o'clock, which is also how SVG's y-down plane reads them, so the geometry carries over as it is.

/** The circle the chart is drawn in, and its hole. */
export interface Ring {
  readonly cx: number;
  readonly cy: number;
  readonly outerRadius: number;
  readonly innerRadius: number;
}

/** SVG path data and how to fill it: the whole ring is two circles, and only an even-odd fill leaves the hole open. */
export interface OutlinePath {
  readonly d: string;
  readonly evenOdd: boolean;
}

/**
 * Writes path data the way Android's `Path.arcTo` builds a path: an arc that starts elsewhere than
 * the current point is joined to it by a line, and the first arc of a path starts it.
 */
class PathWriter {
  private readonly parts: string[] = [];
  private x = 0;
  private y = 0;
  private started = false;

  private readonly precision: number;

  constructor(precision: number) {
    this.precision = precision;
  }

  /** An arc of the circle of [radius] around ([cx], [cy]), from [startDeg] through [sweepDeg] (negative: anticlockwise). */
  arcTo(cx: number, cy: number, radius: number, startDeg: number, sweepDeg: number): void {
    const startX = cx + radius * Math.cos(toRadians(startDeg));
    const startY = cy + radius * Math.sin(toRadians(startDeg));

    if (!this.started) {
      this.parts.push(`M${this.n(startX)} ${this.n(startY)}`);
      this.started = true;
    } else if (Math.hypot(startX - this.x, startY - this.y) > 1e-6) {
      this.parts.push(`L${this.n(startX)} ${this.n(startY)}`);
    }
    this.x = startX;
    this.y = startY;

    if (sweepDeg === 0) return;
    // A full turn cannot be one SVG arc (its ends would be the same point): it is two halves.
    const pieces = Math.abs(sweepDeg) >= MAX_DEG ? 2 : 1;
    const piece = sweepDeg / pieces;
    for (let i = 1; i <= pieces; i++) {
      const endX = cx + radius * Math.cos(toRadians(startDeg + piece * i));
      const endY = cy + radius * Math.sin(toRadians(startDeg + piece * i));
      if (radius <= 0) {
        this.parts.push(`L${this.n(endX)} ${this.n(endY)}`);
      } else {
        const large = Math.abs(piece) > 180 ? 1 : 0;
        const clockwise = piece > 0 ? 1 : 0;
        this.parts.push(`A${this.n(radius)} ${this.n(radius)} 0 ${large} ${clockwise} ${this.n(endX)} ${this.n(endY)}`);
      }
      this.x = endX;
      this.y = endY;
    }
  }

  close(): string {
    this.parts.push("Z");
    return this.parts.join("");
  }

  /** A number with at most [precision] decimals, and no trailing zeros. */
  private n(value: number): string {
    const rounded = Number(value.toFixed(this.precision));
    return String(Object.is(rounded, -0) ? 0 : rounded);
  }
}

/** A complete donut ring (a full disc if there is no hole). */
export function fullRingPath(ring: Ring, precision = 3): OutlinePath {
  const circle = (radius: number): string => {
    const w = new PathWriter(precision);
    w.arcTo(ring.cx, ring.cy, radius, 0, MAX_DEG);
    return w.close();
  };
  const outer = circle(ring.outerRadius);
  return { d: ring.innerRadius > 0 ? outer + circle(ring.innerRadius) : outer, evenOdd: ring.innerRadius > 0 };
}

/** A slice with sharp corners. */
export function sharpSlicePath(
  ring: Ring,
  outerStartAngle: number,
  outerSweep: number,
  innerStartAngle: number,
  innerSweep: number,
  precision = 3,
): OutlinePath {
  // A full 360° sweep closes on itself: it is not an arc.
  if (outerSweep >= MAX_DEG) return fullRingPath(ring, precision);
  const w = new PathWriter(precision);
  w.arcTo(ring.cx, ring.cy, ring.outerRadius, outerStartAngle, outerSweep);
  w.arcTo(ring.cx, ring.cy, ring.innerRadius, innerStartAngle + innerSweep, -innerSweep);
  return { d: w.close(), evenOdd: false };
}

/**
 * A slice with rounded corners: [cOut] is the radius of the two outer corners and [cIn] of the two
 * inner ones (0 leaves a corner sharp). Each corner is a circle tangent to the ring's edge and to
 * the slice's side, so the arcs join without lines.
 */
export function roundedSlicePath(
  ring: Ring,
  cOut: number,
  cIn: number,
  outerStartAngle: number,
  outerSweep: number,
  innerStartAngle: number,
  innerSweep: number,
  precision = 3,
): OutlinePath {
  const { cx, cy, outerRadius, innerRadius } = ring;
  const w = new PathWriter(precision);

  // The half-angle the outer corner takes (0 if it is sharp).
  const aAlpha = cOut > 0 ? toDegrees(Math.asin(clamp(cOut / (outerRadius - cOut), -1, 1))) : 0;
  // The half-angle the inner corner takes (0 if it is sharp, or there is no hole).
  const bBeta = cIn > 0 && innerRadius > 0 ? toDegrees(Math.asin(clamp(cIn / (innerRadius + cIn), -1, 1))) : 0;

  const outerEndAngle = outerStartAngle + outerSweep;
  const innerEndAngle = innerStartAngle + innerSweep;

  /** A corner: an arc of radius [c] around a point of the circle of [radius], at [pointAngle]. */
  const corner = (pointAngle: number, radius: number, c: number, arcStartAngle: number, sweep: number): void => {
    const px = cx + radius * Math.cos(toRadians(pointAngle));
    const py = cy + radius * Math.sin(toRadians(pointAngle));
    w.arcTo(px, py, c, arcStartAngle, sweep);
  };

  // 1. Outer arc
  w.arcTo(cx, cy, outerRadius, outerStartAngle + aAlpha, Math.max(outerSweep - 2 * aAlpha, 0));

  // 2. End outer corner
  if (cOut > 0) {
    const angle = outerEndAngle - aAlpha;
    corner(angle, outerRadius - cOut, cOut, angle, 90 + aAlpha);
  }

  // 3. End inner corner
  if (cIn > 0 && innerRadius > 0) {
    const angle = innerEndAngle - bBeta;
    corner(angle, innerRadius + cIn, cIn, innerEndAngle + 90, 90 - bBeta);
  }

  // 4. Inner arc, the other way round. With no inner rounding this joins the inner edge directly.
  w.arcTo(cx, cy, innerRadius, innerEndAngle - bBeta, -Math.max(innerSweep - 2 * bBeta, 0));

  // 5. Start inner corner
  if (cIn > 0 && innerRadius > 0) {
    const angle = innerStartAngle + bBeta;
    corner(angle, innerRadius + cIn, cIn, angle + 180, 90 - bBeta);
  }

  // 6. Start outer corner
  if (cOut > 0) {
    const angle = outerStartAngle + aAlpha;
    corner(angle, outerRadius - cOut, cOut, outerStartAngle - 90, 90 + aAlpha);
  }

  return { d: w.close(), evenOdd: false };
}
