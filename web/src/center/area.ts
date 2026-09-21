/**
 * The hole of the donut, in the chart's own coordinates. The chart makes a new instance whenever the
 * hole changes (its size, the padding, the hole ratio), and only then, so it can be compared by identity.
 */
export class CenterArea {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;

  constructor(cx: number, cy: number, radius: number) {
    this.cx = cx;
    this.cy = cy;
    this.radius = radius;
  }

  /** True when the chart has no hole, or has not been laid out yet. */
  get isEmpty(): boolean {
    return this.radius <= 0;
  }

  /** The largest square that fits inside the hole. */
  get safeRect(): { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } {
    const half = this.radius / Math.SQRT2;
    return { left: this.cx - half, top: this.cy - half, right: this.cx + half, bottom: this.cy + half };
  }

  /**
   * The width available to content of the given [height] that is centered in the hole: the length of
   * the chord through its top and bottom edge. Wider than the safe square for content that is wider than
   * it is tall, such as a line of text.
   */
  widthFor(height: number): number {
    const halfHeight = height / 2;
    return halfHeight >= this.radius ? 0 : 2 * Math.sqrt(this.radius * this.radius - halfHeight * halfHeight);
  }
}
