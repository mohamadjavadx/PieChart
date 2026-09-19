package io.github.mohamadjavadx.piechart.sample.utils

import java.math.BigDecimal

/** Canonical form so equal amounts compare equal with `==` (2.50 and 2.5, 0.0 and 0). */
internal fun BigDecimal.normalized(): BigDecimal =
    if (signum() == 0) BigDecimal.ZERO else stripTrailingZeros()

/**
 * Parses what the user typed. A numeric keyboard offers the digits and the decimal separator of
 * the user's locale, so non-Latin digits count as digits, and a comma or an Arabic decimal
 * separator (٫) counts as the decimal point. An empty or unparsable entry counts as 0.
 */
internal fun String.toAmountOrZero(): BigDecimal =
    toLatinNumber().toBigDecimalOrNull()?.normalized() ?: BigDecimal.ZERO

private fun String.toLatinNumber(): String = buildString(length) {
    for (char in this@toLatinNumber) {
        when {
            char == ',' || char == '٫' -> append('.')
            char.isDigit() -> append('0' + char.digitToInt())
            else -> append(char)
        }
    }
}

/** Plain digits, never scientific notation. */
internal fun BigDecimal.toDisplayString(): String = normalized().toPlainString()
