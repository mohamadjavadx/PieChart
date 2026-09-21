import type { Slice } from "./types.ts";

// One data-change animation, planned once when the data changes. A port of the Android library's
// Morph.kt.

/**
 * Identity used to match slices between the old and new dataset during a data-change animation, so
 * "the same" slice animates from its old size to its new size. Keys should be unique; duplicates
 * fall back to exit and enter for the extras.
 */
export const sliceKey = (slice: Slice): unknown => slice.id;

/**
 * Everything is parallel to [renderList]: the target dataset plus "exiting" slices that shrink to
 * nothing.
 *
 * Each rendered slice's sweep moves from [from] to [to], so the pie is always complete, and the gap
 * and the reveal fraction move with the same progress. So does how much a slice belongs to the band
 * of an expanded group: [bandFrom] to [bandTo], 0 for a slice of its own and 1 for one in the band,
 * and anything between while a slice changes from one to the other.
 */
export class Morph {
  readonly renderList: readonly Slice[];
  /** renderList index -> dataset index, or -1 for an exiting slice. */
  readonly renderIndexMap: readonly number[];
  /** Sweep at the start (degrees). */
  readonly from: readonly number[];
  /** Sweep at the end (degrees). */
  readonly to: readonly number[];
  readonly bandFrom: readonly number[];
  readonly bandTo: readonly number[];
  /** Reveal fraction carried into the morph, when a reveal was interrupted. */
  private readonly fractionSeed: number;
  /** Gap between slices at the start and at the end, so it never jumps. */
  private readonly fromGap: number;
  private readonly toGap: number;

  constructor(
    renderList: readonly Slice[],
    renderIndexMap: readonly number[],
    from: readonly number[],
    to: readonly number[],
    bandFrom: readonly number[],
    bandTo: readonly number[],
    fractionSeed: number,
    fromGap: number,
    toGap: number,
  ) {
    this.renderList = renderList;
    this.renderIndexMap = renderIndexMap;
    this.from = from;
    this.to = to;
    this.bandFrom = bandFrom;
    this.bandTo = bandTo;
    this.fractionSeed = fractionSeed;
    this.fromGap = fromGap;
    this.toGap = toGap;
  }

  /** True when the layout does not change (a color-only change, say): nothing to animate. */
  get isVisuallyIdentical(): boolean {
    return sameNumbers(this.from, this.to) && sameNumbers(this.bandFrom, this.bandTo);
  }

  sweepAt(index: number, progress: number): number {
    return lerp(this.from[index]!, this.to[index]!, progress);
  }

  bandAt(index: number, progress: number): number {
    return lerp(this.bandFrom[index]!, this.bandTo[index]!, progress);
  }

  gapAt(progress: number): number {
    return lerp(this.fromGap, this.toGap, progress);
  }

  /** If a reveal was interrupted, it completes alongside the morph. */
  fractionAt(progress: number): number {
    return lerp(this.fractionSeed, 1, progress);
  }
}

const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;

const sameNumbers = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * Plans the animation from the current visual state ([oldRender], [oldMap] and [oldSweeps]) to
 * [newData], whose final sweeps are [targetSweeps]. Both layouts sum to 360°, so the pie is always
 * complete: new slices grow in, changed slices resize, removed slices shrink to zero in place.
 *
 * [oldBand] says how much each old rendered slice is in the band now, and the first [newBandCount]
 * slices of [newData] are in it at the end.
 */
export function planMorph(
  oldRender: readonly Slice[],
  oldMap: readonly number[],
  oldSweeps: readonly number[],
  newData: readonly Slice[],
  targetSweeps: readonly number[],
  fractionSeed: number,
  fromGap: number,
  toGap: number,
  oldBand: readonly number[],
  newBandCount: number,
): Morph {
  // 1. Match old render items to new items by key. The first old item with a key wins.
  const matchOldToNew = new Array<number>(oldRender.length).fill(-1);
  const matchNewToOld = new Array<number>(newData.length).fill(-1);
  for (let i = 0; i < oldRender.length; i++) {
    if (oldMap[i]! < 0) continue; // already exiting: stays exiting
    const key = sliceKey(oldRender[i]!);
    const j = newData.findIndex((slice) => sliceKey(slice) === key);
    if (j >= 0 && matchNewToOld[j]! < 0) {
      matchOldToNew[i] = j;
      matchNewToOld[j] = i;
    }
  }

  // 2. Each exiting slice is drawn just before the next surviving slice, so removed slices shrink in
  //    place instead of jumping to the end.
  const exitBefore = new Array<number>(oldRender.length).fill(0);
  let nextMatch = newData.length;
  for (let i = oldRender.length - 1; i >= 0; i--) {
    exitBefore[i] = nextMatch;
    if (matchOldToNew[i]! >= 0) nextMatch = matchOldToNew[i]!;
  }

  // 3. Build the render list: new items in target order, ghosts interleaved.
  const render: Slice[] = [];
  const indexMap: number[] = [];
  const from: number[] = [];
  const to: number[] = [];
  const bandFrom: number[] = [];
  const bandTo: number[] = [];

  const addExiting = (oldIndex: number): void => {
    render.push(oldRender[oldIndex]!);
    indexMap.push(-1);
    from.push(oldSweeps[oldIndex]!);
    to.push(0);
    // Shrinks away in the band, or out of it, as it was.
    bandFrom.push(oldBand[oldIndex]!);
    bandTo.push(oldBand[oldIndex]!);
  };

  for (let j = 0; j < newData.length; j++) {
    for (let i = 0; i < oldRender.length; i++) {
      if (matchOldToNew[i]! < 0 && exitBefore[i] === j) addExiting(i);
    }
    const matchedOldIndex = matchNewToOld[j]!;
    render.push(newData[j]!);
    indexMap.push(j);
    from.push(matchedOldIndex >= 0 ? oldSweeps[matchedOldIndex]! : 0);
    to.push(targetSweeps[j]!);
    const bandEnd = j < newBandCount ? 1 : 0;
    // A new slice grows in where it will be; one that stays goes from what it is now.
    bandFrom.push(matchedOldIndex >= 0 ? oldBand[matchedOldIndex]! : bandEnd);
    bandTo.push(bandEnd);
  }
  for (let i = 0; i < oldRender.length; i++) {
    if (matchOldToNew[i]! < 0 && exitBefore[i] === newData.length) addExiting(i);
  }

  return new Morph(render, indexMap, from, to, bandFrom, bandTo, fractionSeed, fromGap, toGap);
}
