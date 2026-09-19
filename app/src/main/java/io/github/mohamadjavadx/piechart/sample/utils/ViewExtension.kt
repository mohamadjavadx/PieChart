package io.github.mohamadjavadx.piechart.sample.utils

import android.annotation.SuppressLint
import android.content.res.Resources
import android.os.Build
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import androidx.core.view.WindowInsetsCompat
import kotlin.math.ceil

@SuppressLint("WrongConstant")
internal fun View.closeKeyboard() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val controller = windowInsetsController
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.ime())
            return
        }
    }
    val imm = context.getSystemService(InputMethodManager::class.java)
    imm.hideSoftInputFromWindow(windowToken, 0)
}

internal val Int.sp: Float
    get() = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_SP,
        toFloat(),
        Resources.getSystem().displayMetrics
    )

internal val Float.dp: Int
    get() = ceil(Resources.getSystem().displayMetrics.density * this).toInt()

internal val Int.dp: Int
    get() = toFloat().dp

internal val Int.dpf: Float
    get() = dp.toFloat()

internal fun ViewGroup.MarginLayoutParams.setHorizontalMargins(margin: Int) {
    leftMargin = margin
    rightMargin = margin
}
