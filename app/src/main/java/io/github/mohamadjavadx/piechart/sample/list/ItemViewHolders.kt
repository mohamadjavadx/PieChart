package io.github.mohamadjavadx.piechart.sample.list

import android.text.TextUtils
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import androidx.core.widget.doAfterTextChanged
import androidx.recyclerview.widget.RecyclerView
import io.github.mohamadjavadx.piechart.sample.components.DataSetRowView
import io.github.mohamadjavadx.piechart.sample.components.IntControlView
import io.github.mohamadjavadx.piechart.sample.components.OutlineButtonView
import io.github.mohamadjavadx.piechart.sample.components.SwitchView
import io.github.mohamadjavadx.piechart.sample.components.UnitSliderRow
import io.github.mohamadjavadx.piechart.sample.model.Button
import io.github.mohamadjavadx.piechart.sample.model.DataSetRow
import io.github.mohamadjavadx.piechart.sample.model.IntControl
import io.github.mohamadjavadx.piechart.sample.model.SizeUnit
import io.github.mohamadjavadx.piechart.sample.model.Spacer
import io.github.mohamadjavadx.piechart.sample.model.Switch
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.toAmountOrZero
import io.github.mohamadjavadx.piechart.sample.utils.toDisplayString
import java.math.BigDecimal

// Callbacks take the adapter position; the adapter resolves it to the current list item.

internal class ButtonVH(
    private val view: OutlineButtonView,
    onClick: (position: Int) -> Unit,
) : RecyclerView.ViewHolder(view) {

    init {
        view.setOnClickListener { onClick(bindingAdapterPosition) }
    }

    fun bind(item: Button) {
        view.text = item.label
    }
}

/** What the adapter needs from the holder of an [IntControl]. */
internal interface IntControlHolder {

    /** What the control shows right now, which may be ahead of the adapter's list while dragging. */
    val displayedValue: Int

    fun bind(item: IntControl)

    fun setValue(value: Int)
}

/** Slider, stepped slider and stepper all edit an [IntControl] the same way. */
internal class IntControlVH(
    private val view: IntControlView,
    onChanged: (position: Int, newValue: Int) -> Unit,
) : RecyclerView.ViewHolder(view), IntControlHolder {

    init {
        view.setOnValueChangeListener { onChanged(bindingAdapterPosition, it) }
    }

    override fun bind(item: IntControl) {
        view.maxValue = item.maxValue
        view.value = item.value
        view.setLabelFormat(item.label)
    }

    override val displayedValue: Int get() = view.value

    override fun setValue(value: Int) {
        view.value = value
    }
}

/**
 * The row of a setting that is measured in either of two units. Both units are the same row of
 * the list (see [IntControl.diffId]), so a change of unit rebinds this holder: the toggle slides
 * to the new unit and the new slider content fades in. A holder that is bound to another row, or
 * that is not on screen, shows it at once.
 */
internal class UnitRowVH(
    private val row: UnitSliderRow,
    onChanged: (position: Int, newValue: Int) -> Unit,
    onUnitSelected: (position: Int, unit: SizeUnit) -> Unit,
) : RecyclerView.ViewHolder(row), IntControlHolder {

    private var boundRow: String? = null
    private var boundUnit: SizeUnit? = null

    init {
        row.setOnValueChangeListener { onChanged(bindingAdapterPosition, it) }
        row.toggle.setOnSelectedListener { onUnitSelected(bindingAdapterPosition, SizeUnit.entries[it]) }
    }

    override fun bind(item: IntControl) {
        val choice = requireNotNull(item.unitChoice) { "A unit row needs a unit choice" }
        val changedUnit = row.isShown && boundRow == item.diffId && boundUnit != choice.unit
        boundRow = item.diffId
        boundUnit = choice.unit

        row.show(item, fade = changedUnit)
        row.toggle.labels = choice.labels
        row.toggle.setSelectedIndex(choice.unit.ordinal, animate = changedUnit)
        row.toggle.contentDescription = item.label.substringBefore("%d").trim() + " unit"
    }

    override val displayedValue: Int get() = row.activeSlider.value

    override fun setValue(value: Int) {
        row.activeSlider.value = value
    }
}

internal class SwitchVH(
    private val view: SwitchView,
    onChanged: (position: Int, isChecked: Boolean) -> Unit,
) : RecyclerView.ViewHolder(view) {

    init {
        view.setOnCheckedChangeListener { onChanged(bindingAdapterPosition, it) }
    }

    fun bind(item: Switch) {
        view.labelText = item.label
        view.isChecked = item.value
    }

    val displayedValue: Boolean get() = view.isChecked

    fun setValue(value: Boolean) {
        view.isChecked = value
    }
}

internal class SpacerVH(private val view: View) : RecyclerView.ViewHolder(view) {

    fun bind(item: Spacer) {
        view.layoutParams.height = item.heightDp.dp
    }
}

internal class DataSetRowVH(
    private val view: DataSetRowView,
    private val onLabelEdited: (rowId: Int, label: String) -> Unit,
    private val onValueEdited: (rowId: Int, value: BigDecimal) -> Unit,
    private val consumeFocusRequest: (rowId: Int) -> Boolean,
    private val onNextFromRow: (position: Int) -> Unit,
) : RecyclerView.ViewHolder(view) {

    // The bound row is captured instead of looked up by adapter position, so an edit
    // can never land on a different row after a rebind.
    private var row: DataSetRow? = null

    // Programmatic setText calls must not be reported back as user edits.
    private var isBinding = false

    init {
        // One watcher per field: a keystroke only reads and parses the field that changed.
        view.labelEt.doAfterTextChanged { if (!isBinding) commitLabel() }
        view.valueEt.doAfterTextChanged { if (!isBinding) commitValue() }

        view.labelEt.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) view.labelEt.moveCursorToEnd()
        }
        view.valueEt.setOnFocusChangeListener { _, hasFocus -> onValueFocusChanged(hasFocus) }

        // The focus always moves between value fields: from a label to the value of its row,
        // from a value to the value of the next row. A label is edited by tapping it.
        view.labelEt.setOnEditorActionListener { _, actionId, event ->
            val isNext = isNextAction(actionId, event)
            if (isNext) view.valueEt.requestFocus()
            isNext
        }
        // The adapter moves the focus on "Next" itself, so the framework's default focus
        // search, which scrolls only as far as the cursor needs, must not run as well.
        view.valueEt.setOnEditorActionListener { _, actionId, event ->
            val isNext = isNextAction(actionId, event)
            if (isNext) onNextFromRow(bindingAdapterPosition)
            isNext
        }
    }

    fun bind(item: DataSetRow) {
        view.rowNumber = item.position + 1
        view.barColor = item.color
        bindEditable(item)
        if (consumeFocusRequest(item.rowId)) view.post { focusValue() }
    }

    /** Rebinds only what the user can edit; used when nothing else about the row changed. */
    fun bindEditable(item: DataSetRow) {
        isBinding = true
        this.row = item
        view.isValueInvalid = item.value.signum() <= 0
        view.labelEt.setTextIfChanged(item.label)
        // Don't rewrite what the user is typing when it already means the same number
        // ("1." or "2.50" vs. 1 / 2.5); that would move the cursor.
        val keepTypedText = view.valueEt.hasFocus() &&
                view.valueEt.text.toString().toAmountOrZero().compareTo(item.value) == 0
        if (!keepTypedText) view.valueEt.setTextIfChanged(item.value.toDisplayString())
        isBinding = false
    }

    private fun commitLabel() {
        val row = row ?: return
        val label = view.labelEt.text.toString()
        if (label == row.label) return
        // Keep the local copy current: the list emits the new row asynchronously.
        this.row = row.copy(label = label)
        onLabelEdited(row.rowId, label)
    }

    private fun commitValue() {
        val row = row ?: return
        val value = view.valueEt.text.toString().toAmountOrZero()
        if (value.compareTo(row.value) != 0) this.row = row.copy(value = value)
        // Reported even when the number is the same: it is still what the user typed.
        onValueEdited(row.rowId, value)
    }

    // While typing, "1." is already committed as 1 and an empty entry as 0,
    // so the text itself is only tidied once the user leaves the field.
    private fun onValueFocusChanged(hasFocus: Boolean) {
        val field = view.valueEt
        val typed = field.text.toString().toAmountOrZero()
        when {
            !hasFocus -> {
                // Tidying is not an edit.
                isBinding = true
                field.setTextIfChanged(typed.toDisplayString())
                isBinding = false
            }
            // A 0 is a placeholder the user is about to replace.
            typed.signum() == 0 -> field.selectAll()
            else -> field.moveCursorToEnd()
        }
    }

    // The cursor position comes from the focus listener: end of the text, or the whole
    // value selected when it is 0.
    fun focusValue() {
        view.valueEt.requestFocus()
        view.context.getSystemService(InputMethodManager::class.java)
            .showSoftInput(view.valueEt, InputMethodManager.SHOW_IMPLICIT)
    }

    // Numeric keyboards without a Next key send Enter as a key event instead.
    private fun isNextAction(actionId: Int, event: KeyEvent?) =
        actionId == EditorInfo.IME_ACTION_NEXT ||
                (actionId == EditorInfo.IME_NULL && event?.keyCode == KeyEvent.KEYCODE_ENTER &&
                        event.action == KeyEvent.ACTION_DOWN)

    private fun EditText.moveCursorToEnd() = setSelection(text.length)

    private fun EditText.setTextIfChanged(newText: String) {
        if (TextUtils.equals(text, newText)) return
        // setText applies the length filter too, which would cut a longer stored value.
        val inputFilters = filters
        filters = emptyArray()
        setText(newText)
        filters = inputFilters
    }
}
