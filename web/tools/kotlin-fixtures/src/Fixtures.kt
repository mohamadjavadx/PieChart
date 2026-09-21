import io.github.mohamadjavadx.piechart.OtherSliceId
import io.github.mohamadjavadx.piechart.PieChartData
import io.github.mohamadjavadx.piechart.geometry.computeCornerRadii
import io.github.mohamadjavadx.piechart.geometry.computeGapDeg
import io.github.mohamadjavadx.piechart.geometry.computeInnerGapDeg
import io.github.mohamadjavadx.piechart.geometry.computeTargetSweeps
import io.github.mohamadjavadx.piechart.geometry.degreesOfArc
import io.github.mohamadjavadx.piechart.geometry.enforceMinSweepAngle
import io.github.mohamadjavadx.piechart.geometry.groupSlices
import io.github.mohamadjavadx.piechart.geometry.planMorph
import io.github.mohamadjavadx.piechart.geometry.ratioOfPx
import io.github.mohamadjavadx.piechart.geometry.sliceIndexAt
import java.io.File
import java.math.BigDecimal
import java.math.MathContext
import kotlin.random.Random

// Runs the library's pure code on many inputs and writes the answers as JSON, for the TypeScript port to be tested against.

private fun plain(v: BigDecimal): String = if (v.signum() == 0) "0" else v.stripTrailingZeros().toPlainString()
private fun idOf(id: Any): String = if (id === OtherSliceId) "OTHER" else id.toString()
private fun slice(id: Int, value: String) = PieChartData(id, "Row $id", BigDecimal(value), 0)

/** 100 in all: 50, 25, 12.5, ..., the last two equal, like the demo's data. */
private fun halving(count: Int): List<PieChartData> = List(count) { i ->
    val k = minOf(i + 1, count - 1)
    PieChartData(i + 1, "Row ${i + 1}", BigDecimal(100).divide(BigDecimal.valueOf(2).pow(k)), 0)
}

private fun datasets(): Map<String, List<PieChartData>> = mapOf(
    "halving30" to halving(30),
    "halving8" to halving(8),
    "tiny" to listOf("95", "3", "0.5", "0.5", "1").mapIndexed { i, v -> slice(i + 1, v) },
    "mixed" to listOf("70", "20", "4", "3", "3").mapIndexed { i, v -> slice(i + 1, v) },
    "nine" to listOf("40", "30", "20", "5", "3", "1", "0.5", "0.3", "0.2").mapIndexed { i, v -> slice(i + 1, v) },
    "equal3" to List(3) { slice(it + 1, "1") },
    "equal12" to List(12) { slice(it + 1, "1") },
    "one" to listOf(slice(1, "5")),
    "two" to listOf(slice(1, "3"), slice(2, "1")),
    "many200" to List(200) { slice(it + 1, if (it == 0) "1000" else "1") },
    "decimals" to listOf("0.1", "0.2", "0.3", "1234.5678", "0.0001", "77.7").mapIndexed { i, v -> slice(i + 1, v) },
)

private fun json(v: Any?): String = when (v) {
    null -> "null"
    is String -> "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
    is Boolean, is Int, is Long -> v.toString()
    is Float -> v.toString()
    is Double -> v.toString()
    is FloatArray -> json(v.toList())
    is IntArray -> json(v.toList())
    is List<*> -> v.joinToString(",", "[", "]") { json(it) }
    is Map<*, *> -> v.entries.joinToString(",", "{", "}") { json(it.key.toString()) + ":" + json(it.value) }
    else -> error("cannot write ${v::class}")
}

private fun decimalCases(): Map<String, Any> {
    val quotients = listOf(
        "1" to "3", "2" to "3", "1" to "8", "10" to "4", "-1" to "3", "1" to "-4", "100" to "3", "0.5" to "0.25",
        "1200" to "1800", "0" to "7", "1" to "7", "22" to "7", "1e-7" to "3", "50" to "268435456",
        "0.0000001862645149230957" to "100", "999999999999999999999" to "7", "7" to "999999999999999999999",
        "123456789012345.65" to "1", "123456789012345.75" to "1", "12345678901234.5000000000000001" to "1",
        "1234567890123455.1" to "1", "1234567890123455.5000000001" to "1", "1234567890123456.5" to "1",
        "1234567890123457.5" to "1", "0.1" to "0.3", "5" to "0.03", "1e10" to "3e-5", "-2.5" to "-0.5",
        "1.5625" to "100", "98.4375" to "349", "0.78125" to "100", "3" to "9",
    ).map { (a, b) ->
        mapOf("a" to a, "b" to b, "quotient" to plain(BigDecimal(a).divide(BigDecimal(b), MathContext.DECIMAL64)))
    }
    val sums = listOf(
        listOf("0.1", "0.2"), listOf("1", "2", "3.5"), listOf("100", "-99.21875"),
        List(29) { i -> BigDecimal(50).divide(BigDecimal.valueOf(2).pow(i)).toPlainString() } +
            BigDecimal(50).divide(BigDecimal.valueOf(2).pow(28)).toPlainString(),
    ).map { list -> mapOf("values" to list, "sum" to plain(list.fold(BigDecimal.ZERO) { acc, s -> acc + BigDecimal(s) })) }
    val floats = listOf("0.006103515625", "1200", "0.3333333333333333", "-1e-7", "123456789.123456789")
        .map { mapOf("value" to it, "number" to BigDecimal(it).toDouble()) }
    return mapOf("quotients" to quotients, "sums" to sums, "toNumber" to floats)
}

private fun mathCases(): Map<String, Any> {
    val counts = listOf(0, 1, 2, 3, 10, 24, 100, 200, 359, 360, 400)
    val gaps = listOf(-1f, 0f, 0.5f, 0.69f, 1f, 2f, 5f, 20f)
    val gapCases = counts.flatMap { n -> gaps.flatMap { g -> listOf(true, false).map { e ->
        mapOf("count" to n, "gap" to g, "ensure" to e, "result" to computeGapDeg(n, g, e))
    } } }
    val innerGap = listOf(0f, 2f).flatMap { g -> listOf(0.1f, 0.25f, 0.2500001f, 0.85f).flatMap { h ->
        listOf(0f, 80f).flatMap { r -> listOf(true, false).map { has ->
            mapOf("gap" to g, "hole" to h, "innerRadius" to r, "hasSlices" to has, "result" to computeInnerGapDeg(g, h, r, has))
        } }
    } }
    val ratios = listOf(0f to 100f, 25f to 100f, 500f to 100f, -5f to 100f, 10f to 0f, 5.75f to 331f)
        .map { (px, whole) -> mapOf("px" to px, "whole" to whole, "result" to ratioOfPx(px, whole)) }
    val arcs = listOf(3.14159265f to 2f, 100f to 100f, 10f to 0f, 1e9f to 1f, 5.75f to 331f, 0f to 50f)
        .map { (px, r) -> mapOf("arcPx" to px, "radius" to r, "result" to degreesOfArc(px, r)) }
    val enforce = listOf(
        floatArrayOf(10f, 0.5f, 0.5f, 349f) to 2f, floatArrayOf(0f, 100f, 260f) to 2f, floatArrayOf(180f, 180f) to 2f,
        floatArrayOf(300f, 30f, 20f, 5f, 3f, 1.5f, 0.5f) to 3f, floatArrayOf(359f, 0.5f, 0.5f) to 1.7f,
        floatArrayOf(1f, 1f, 1f, 357f) to 5f, floatArrayOf(2f, 2f, 2f, 354f) to 2f,
    ).map { (input, min) ->
        val copy = input.copyOf(); enforceMinSweepAngle(copy, min)
        mapOf("input" to input, "min" to min, "result" to copy)
    }
    return mapOf("gap" to gapCases, "innerGap" to innerGap, "ratioOfPx" to ratios, "degreesOfArc" to arcs, "enforce" to enforce)
}

private fun sweepCases(): List<Map<String, Any>> = datasets().flatMap { (name, data) ->
    val total = data.fold(BigDecimal.ZERO) { acc, d -> acc + d.value }
    listOf(0f, 1f, 2.5f).flatMap { gap -> listOf(true, false).flatMap { ensure ->
        listOf(0, 2, 6, data.size).filter { it <= data.size }.map { band ->
            mapOf(
                "dataset" to name, "gap" to gap, "ensure" to ensure, "bandCount" to band, "bandSweep" to 90f,
                "sweeps" to computeTargetSweeps(data, total, gap, ensure, band, 90f),
            )
        }
    } }
}

private fun cornerCases(): List<Map<String, Any>> {
    val out = ArrayList<Map<String, Any>>()
    for (o in listOf(0.5f, 2f, 10f, 45f, 90f, 180f, 359f)) for (i in listOf(o, o - 1f).filter { it > 0f })
        for (radius in listOf(100f, 37.5f)) for (hole in listOf(0.1f, 0.26f, 0.5f, 0.85f))
            for (ratio in listOf(0f, 0.5f, 1f, 1.5f)) for (roundInner in listOf(true, false)) for (count in listOf(5)) {
                val inner = radius * hole
                val r = computeCornerRadii(o, i, radius, inner, hole, ratio, roundInner, count)
                out += mapOf(
                    "outerSweep" to o, "innerSweep" to i, "outerRadius" to radius, "innerRadius" to inner, "hole" to hole,
                    "ratio" to ratio, "roundInner" to roundInner, "count" to count, "outer" to r.outer, "inner" to r.inner,
                )
            }
    // A single slice is a closed ring, whatever else: no corners.
    for (o in listOf(90f, 359f)) {
        val r = computeCornerRadii(o, o, 100f, 85f, 0.85f, 0.5f, true, 1)
        out += mapOf(
            "outerSweep" to o, "innerSweep" to o, "outerRadius" to 100f, "innerRadius" to 85f, "hole" to 0.85f, "ratio" to 0.5f,
            "roundInner" to true, "count" to 1, "outer" to r.outer, "inner" to r.inner,
        )
    }
    return out
}

private fun groupingCases(): List<Map<String, Any>> = datasets().flatMap { (name, data) ->
    listOf(0f, 0.5f, 0.69f, 1f, 2f, 5f, 8f, 30f, 60f, 175f, 300f).flatMap { gap ->
        listOf(false, true).map { expanded ->
            val g = groupSlices(data, gap, expanded, 7)
            mapOf(
                "dataset" to name, "gap" to gap, "expanded" to expanded, "hasGroup" to g.hasGroup, "bandCount" to g.bandCount,
                "ids" to g.slices.map { idOf(it.id) }, "values" to g.slices.map { plain(it.value) },
            )
        }
    }
}

private fun hitCases(): List<Map<String, Any>> {
    val random = Random(20260921)
    val configs = listOf(
        Triple(listOf(90f, 90f, 90f, 90f), 0f, 0), Triple(listOf(90f, 90f, 90f, 90f), 3f, 0),
        Triple(listOf(200f, 100f, 40f, 15f, 4f, 1f), 1f, 0), Triple(listOf(2f, 90f, 90f, 90f, 88f), 5f, 0),
        Triple(listOf(1f, 1f, 1f, 30f, 327f), 2f, 3), Triple(listOf(0.5f, 359.5f), 1f, 1),
    )
    val out = ArrayList<Map<String, Any>>()
    for ((sweeps, gap, band) in configs) for (start in listOf(-90f, 0f, 45f, 1080f - 90f, -400f)) {
        val starts = FloatArray(sweeps.size); val ends = FloatArray(sweeps.size); var cursor = 0f
        for (k in sweeps.indices) { starts[k] = cursor; cursor += sweeps[k]; ends[k] = cursor }
        val map = IntArray(sweeps.size) { it }
        repeat(25) {
            val x = random.nextFloat() * 220f; val y = random.nextFloat() * 220f
            val exiting = if (it % 10 == 0) map.copyOf().also { m -> m[it % sweeps.size] = -1 } else map
            out += mapOf(
                "sweeps" to sweeps, "gap" to gap, "band" to band, "start" to start, "x" to x, "y" to y, "cx" to 110f, "cy" to 110f,
                "inner" to 80f, "outer" to 108f, "map" to exiting,
                "result" to sliceIndexAt(x, y, 110f, 110f, 80f, 108f, start, gap, sweeps.toFloatArray(), starts, ends, exiting, band),
            )
        }
    }
    return out
}

private fun morphCases(): List<Map<String, Any>> {
    fun sweepsOf(d: List<PieChartData>, gap: Float, ensure: Boolean, band: Int): FloatArray =
        computeTargetSweeps(d, d.fold(BigDecimal.ZERO) { acc, x -> acc + x.value }, gap, ensure, band, 90f)

    fun case(name: String, oldData: List<PieChartData>, oldMap: IntArray, oldSweeps: FloatArray, newData: List<PieChartData>,
             newSweeps: FloatArray, seed: Float, fromGap: Float, toGap: Float, oldBand: FloatArray, newBand: Int): Map<String, Any> {
        val m = planMorph(oldData, oldMap, oldSweeps, newData, newSweeps, seed, fromGap, toGap, oldBand, newBand)
        val progress = listOf(0f, 0.25f, 1f)
        return mapOf(
            "name" to name, "old" to oldData.map { idOf(it.id) }, "oldMap" to oldMap, "oldSweeps" to oldSweeps,
            "new" to newData.map { idOf(it.id) }, "newSweeps" to newSweeps, "seed" to seed, "fromGap" to fromGap, "toGap" to toGap,
            "oldBand" to oldBand, "newBand" to newBand,
            "render" to m.renderList.map { idOf(it.id) }, "renderMap" to m.renderIndexMap, "from" to m.from, "to" to m.to,
            "bandFrom" to m.bandFrom, "bandTo" to m.bandTo, "identical" to m.isVisuallyIdentical,
            "progress" to progress,
            "sweepAt" to progress.map { p -> m.from.indices.map { m.sweepAt(it, p) } },
            "bandAt" to progress.map { p -> m.from.indices.map { m.bandAt(it, p) } },
            "gapAt" to progress.map { m.gapAt(it) }, "fractionAt" to progress.map { m.fractionAt(it) },
        )
    }

    val d = datasets()
    val out = ArrayList<Map<String, Any>>()
    val steady = { data: List<PieChartData> -> IntArray(data.size) { it } }
    val zeros = { n: Int -> FloatArray(n) }

    val abc = d.getValue("equal3"); val two = d.getValue("two")
    out += case("identical", abc, steady(abc), floatArrayOf(120f, 120f, 120f), abc, floatArrayOf(120f, 120f, 120f), 1f, 1f, 1f, zeros(3), 0)
    out += case("resize", two, steady(two), floatArrayOf(270f, 90f), listOf(slice(1, "1"), slice(2, "1")), floatArrayOf(180f, 180f), 1f, 1f, 2f, zeros(2), 0)
    out += case("remove middle", abc, steady(abc), floatArrayOf(120f, 120f, 120f), listOf(abc[0], abc[2]), floatArrayOf(180f, 180f), 1f, 1f, 1f, zeros(3), 0)
    out += case("remove last", abc, steady(abc), floatArrayOf(120f, 120f, 120f), abc.take(2), floatArrayOf(180f, 180f), 0.5f, 1f, 1f, zeros(3), 0)
    out += case("add middle", listOf(abc[0], abc[2]), intArrayOf(0, 1), floatArrayOf(180f, 180f), abc, floatArrayOf(120f, 120f, 120f), 1f, 1f, 1f, zeros(2), 0)
    out += case("reorder", two, steady(two), floatArrayOf(270f, 90f), listOf(two[1], two[0]), floatArrayOf(90f, 270f), 1f, 1f, 1f, zeros(2), 0)
    out += case("already leaving", listOf(abc[0], abc[1], abc[2]), intArrayOf(0, -1, 1), floatArrayOf(100f, 40f, 220f),
        listOf(abc[0], abc[2], slice(9, "1")), floatArrayOf(100f, 100f, 160f), 1f, 1f, 1f, zeros(3), 0)
    out += case("duplicate id", listOf(abc[0], abc[0]), intArrayOf(0, 1), floatArrayOf(180f, 180f), listOf(abc[0]), floatArrayOf(360f), 1f, 1f, 1f, zeros(2), 0)

    for ((name, gap) in listOf("halving30" to 1f, "halving8" to 0.69f, "tiny" to 2f)) {
        val data = d.getValue(name)
        val collapsed = groupSlices(data, gap, false, 7).slices
        val expanded = groupSlices(data, gap, true, 7)
        val cs = sweepsOf(collapsed, gap, true, 0); val es = sweepsOf(expanded.slices, gap, true, expanded.bandCount)
        out += case("$name expand", collapsed, steady(collapsed), cs, expanded.slices, es, 1f, gap, gap, zeros(collapsed.size), expanded.bandCount)
        out += case("$name collapse", expanded.slices, steady(expanded.slices), es, collapsed, cs, 1f, gap, gap,
            FloatArray(expanded.slices.size) { if (it < expanded.bandCount) 1f else 0f }, 0)
    }
    return out
}

fun main(args: Array<String>) {
    val all = mapOf(
        "decimal" to decimalCases(), "math" to mathCases(), "sweeps" to sweepCases(), "cornerRadii" to cornerCases(),
        "grouping" to groupingCases(), "hitTest" to hitCases(), "morph" to morphCases(),
        "datasets" to datasets().mapValues { (_, list) -> list.map { mapOf("id" to it.id, "value" to plain(it.value)) } },
    )
    val file = File(args[0]); file.parentFile.mkdirs(); file.writeText(json(all) + "\n")
    println("wrote ${file.path} (${file.length() / 1024} KB)")
}
