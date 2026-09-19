package io.github.mohamadjavadx.piechart.utils

import kotlin.math.asin as _asin
import kotlin.math.atan2 as _atan2
import kotlin.math.cos as _cos
import kotlin.math.sin as _sin
import kotlin.math.sqrt as _sqrt

internal const val PI_FLOAT = 3.1415927f

internal fun Float.toRadians(): Float = this * PI_FLOAT / 180f
internal fun Float.toDegrees(): Float = this * 180f / PI_FLOAT
internal fun Float.sin(): Float = _sin(this)
internal fun Float.cos(): Float = _cos(this)
internal fun Float.asin(): Float = _asin(this.toDouble()).toFloat()
internal fun Float.atan2(x: Float): Float = _atan2(this, x)
internal fun Float.sqrt(): Float = _sqrt(this)
