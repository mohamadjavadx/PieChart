package io.github.mohamadjavadx.piechart

import java.math.BigDecimal

public data class PieChartData(
    val id: Any,
    val label: String,
    val value: BigDecimal,
    val color: Int,
)