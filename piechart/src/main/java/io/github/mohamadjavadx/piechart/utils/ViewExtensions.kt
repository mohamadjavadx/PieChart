package io.github.mohamadjavadx.piechart.utils

import android.content.res.Resources
import android.util.TypedValue

internal val Float.dp: Float
    get() {
        return Resources.getSystem().displayMetrics.density * this
    }

internal val Float.sp: Float
    get() = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, this, Resources.getSystem().displayMetrics)
