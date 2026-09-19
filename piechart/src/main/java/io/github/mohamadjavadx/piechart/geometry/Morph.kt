package io.github.mohamadjavadx.piechart.geometry

import io.github.mohamadjavadx.piechart.PieChartData

/**
 * Identity used to match slices between the old and new dataset during a
 * data-change animation, so "the same" slice animates from its old size
 * to its new size. Defaults to the id.
 * Keys should be unique; duplicates fall back to
 * exit+enter for the extras.
 */
internal fun sliceKey(data: PieChartData): Any = data.id

/**
 * One data-change (morph) animation, planned once when the data changes. Everything is parallel
 * to [renderList]: the target dataset plus "exiting" slices that shrink to nothing.
 *
 * Each rendered slice's sweep moves from [from] to [to], so the pie is always complete, and the
 * gap and the reveal fraction move with the same progress.
 */
internal class Morph(
    val renderList: List<PieChartData>,
    /** renderList index -> dataset index, or -1 for an exiting slice. */
    val renderIndexMap: IntArray,
    /** Sweep at the start (degrees). */
    val from: FloatArray,
    /** Sweep at the end (degrees). */
    val to: FloatArray,
    /** Reveal fraction carried into the morph, when a reveal was interrupted. */
    private val fractionSeed: Float,
    /** Gap between slices at the start and at the end, so it never jumps. */
    private val fromGap: Float,
    private val toGap: Float,
) {
    /** True when the layout does not change (e.g. a color-only change): nothing to animate. */
    val isVisuallyIdentical: Boolean get() = from.contentEquals(to)

    fun sweepAt(index: Int, progress: Float): Float = from[index] + (to[index] - from[index]) * progress

    fun gapAt(progress: Float): Float = fromGap + (toGap - fromGap) * progress

    /** If a reveal was interrupted, it completes alongside the morph. */
    fun fractionAt(progress: Float): Float = fractionSeed + (1f - fractionSeed) * progress
}

/**
 * Plans the animation from the current visual state ([oldRender], [oldMap] and [oldSweeps]) to
 * [newData], whose final sweeps are [targetSweeps]. Both layouts sum to 360°, so the pie is
 * always complete: new slices grow in, changed slices resize, removed slices shrink to zero in
 * place.
 */
internal fun planMorph(
    oldRender: List<PieChartData>,
    oldMap: IntArray,
    oldSweeps: FloatArray,
    newData: List<PieChartData>,
    targetSweeps: FloatArray,
    fractionSeed: Float,
    fromGap: Float,
    toGap: Float,
): Morph {
    // 1. Match old render items to new items by key (linear search to avoid HashMap allocations).
    val matchOldToNew = IntArray(oldRender.size) { -1 }
    val matchNewToOld = IntArray(newData.size) { -1 }
    for (i in oldRender.indices) {
        if (oldMap[i] < 0) continue   // already exiting — stays exiting
        val key = sliceKey(oldRender[i])
        val j = newData.indexOfFirst { sliceKey(it) == key }
        if (j >= 0 && matchNewToOld[j] < 0) {   // first old item with this key wins
            matchOldToNew[i] = j
            matchNewToOld[j] = i
        }
    }

    // 2. Each exiting slice is drawn just before the next surviving slice,
    //    so removed slices shrink in place instead of jumping to the end.
    val exitBefore = IntArray(oldRender.size)
    var nextMatch = newData.size
    for (i in oldRender.indices.reversed()) {
        exitBefore[i] = nextMatch
        if (matchOldToNew[i] >= 0) nextMatch = matchOldToNew[i]
    }

    // 3. Build the render list: new items in target order, ghosts interleaved.
    val render = ArrayList<PieChartData>(newData.size)
    val indexMap = ArrayList<Int>(newData.size)
    val fromList = ArrayList<Float>(newData.size)
    val toList = ArrayList<Float>(newData.size)

    fun addExiting(oldIndex: Int) {
        render.add(oldRender[oldIndex])
        indexMap.add(-1)
        fromList.add(oldSweeps[oldIndex])
        toList.add(0f)
    }

    for (j in newData.indices) {
        for (i in oldRender.indices) {
            if (matchOldToNew[i] < 0 && exitBefore[i] == j) {
                addExiting(i)
            }
        }
        val matchedOldIndex = matchNewToOld[j]
        render.add(newData[j])
        indexMap.add(j)
        fromList.add(if (matchedOldIndex >= 0) oldSweeps[matchedOldIndex] else 0f)
        toList.add(targetSweeps[j])
    }
    for (i in oldRender.indices) {
        if (matchOldToNew[i] < 0 && exitBefore[i] == newData.size) {
            addExiting(i)
        }
    }

    return Morph(
        renderList = render,
        renderIndexMap = indexMap.toIntArray(),
        from = fromList.toFloatArray(),
        to = toList.toFloatArray(),
        fractionSeed = fractionSeed,
        fromGap = fromGap,
        toGap = toGap,
    )
}
