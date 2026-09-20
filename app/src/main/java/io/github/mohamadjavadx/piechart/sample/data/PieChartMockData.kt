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
        "Compliance",
        "Procurement",
        "Training",
        "Quality",
        "Facilities",
        "Analytics",
        "Brand",
        "Community",
        "Payroll",
        "Strategy",
        "Innovation",
        "Cloud",
        "Mobile",
        "Accounting",
        "Recruiting",
    )

    /**
     * Thirty colors that are easy to tell apart. They are far from each other in OKLab (a color
     * space where distance follows what the eye sees), and ordered so that neighbouring slices,
     * and slices two apart, never look alike. The first five are the default chart's.
     */
    val colors: List<Int> = listOf(
        "#F24822", // red
        "#FF9E42", // orange
        "#FFC943", // amber
        "#A8D94F", // lime
        "#2EA659", // green
        "#B485B8", // mauve
        "#A55EEA", // violet
        "#FFB6A2", // peach
        "#336314", // forest
        "#5AD8CC", // aqua
        "#3373E5", // blue
        "#C8B222", // mustard
        "#8C6640", // brown
        "#D94099", // magenta
        "#3DADFF", // sky
        "#DEBAF6", // lilac
        "#4247A6", // navy
        "#D77C63", // terracotta
        "#9D486B", // plum
        "#49A9AE", // turquoise
        "#6C5CE7", // indigo
        "#E885F1", // orchid
        "#A2041C", // crimson
        "#AC9754", // sand
        "#5C6B84", // slate
        "#FF7096", // pink
        "#861E86", // purple
        "#19D27F", // mint
        "#0E7C86", // deep teal
        "#878BF2", // periwinkle
    ).map { it.toColorInt() }

    /** Rows past this count are added empty (value 0) for the user to fill in. */
    const val MAX_COUNT = 30

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
