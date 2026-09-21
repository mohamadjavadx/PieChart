// The constants and small helpers that the chart's math shares. Angles are in degrees, measured
// clockwise from 3 o'clock (the x axis, with y pointing down), like Android's Canvas and like SVG.

export const MAX_DEG = 360;

/** The smallest sweep a slice is given when `ensureRenderableSlices` is on, on top of the gap. */
export const MIN_SWEEP = 1;

/**
 * Below this hole ratio the hole is too small for rounded inner corners, and the geometry can become
 * numerically unstable.
 */
export const INNER_FEATURES_THRESHOLD = 0.25;

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;
