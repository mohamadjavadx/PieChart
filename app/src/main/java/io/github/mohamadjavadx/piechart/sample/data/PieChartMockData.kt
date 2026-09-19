package io.github.mohamadjavadx.piechart.sample.data

import androidx.core.graphics.toColorInt
import io.github.mohamadjavadx.piechart.PieChartData
import io.github.mohamadjavadx.piechart.sample.utils.normalized
import java.math.BigDecimal

internal object PieChartMockData {

    /** One label per sample row, all within the 12 character input limit. */
    val labels = listOf(
        "Engineering",
        "Product",
        "Design",
        "Marketing",
        "Sales",
        "Support",
        "Finance",
        "Legal",
        "HR",
        "Operations",
        "Research",
        "Security",
        "Data",
        "Logistics",
        "Partnerships",
    )

    /** Fifteen distinct hues, ordered so neighbouring slices stay easy to tell apart. */
    val colors: List<Int> = listOf(
        "#F24822", // red
        "#FF9E42", // orange
        "#FFC943", // amber
        "#A8D94F", // lime
        "#2EA659", // green
        "#5AD8CC", // aqua
        "#3DADFF", // sky
        "#3373E5", // blue
        "#6C5CE7", // indigo
        "#A55EEA", // violet
        "#D94099", // magenta
        "#FF7096", // pink
        "#8C6640", // brown
        "#5C6B84", // slate
        "#0E7C86", // deep teal
    ).map { it.toColorInt() }

    /** Rows past this count are added empty (value 0) for the user to fill in. */
    const val MAX_COUNT = 15

    /** Rows beyond the sample labels have no label. */
    fun labelAt(index: Int): String = labels.getOrNull(index).orEmpty()

    fun colorAt(index: Int): Int = colors[index % colors.size]

    /**
     * Each value is half the previous one and the last two are equal, which adds up to exactly
     * [total]: total/2, total/4, ... and the last one repeated. For 100 and five values that is
     * 50, 25, 12.5, 6.25, 6.25.
     */
    private fun generateValues(total: BigDecimal, count: Int): List<BigDecimal> {
        if (count <= 0) return emptyList()

        val values = ArrayList<BigDecimal>(count)
        var current = total

        for (i in 0 until count) {
            // Halving is exact in decimal. The last value keeps the size of the one before it.
            if (i < count - 1) current = current.divide(BigDecimal(2))
            values += current.normalized()
        }

        return values
    }

    /** Sample data whose values add up to [total]; at most [MAX_COUNT] of them. */
    fun createMockDataSet(
        total: BigDecimal = BigDecimal(100),
        count: Int = MAX_COUNT
    ): List<PieChartData> {
        require(total.signum() > 0) { "total must be > 0" }
        val values = generateValues(total, count.coerceAtMost(MAX_COUNT))
        return values.mapIndexed { index, value ->
            PieChartData(
                id = index + 1,
                label = labelAt(index),
                value = value,
                color = colorAt(index),
            )
        }
    }
}
