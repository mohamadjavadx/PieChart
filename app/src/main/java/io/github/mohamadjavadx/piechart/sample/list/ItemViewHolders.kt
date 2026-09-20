package io.github.mohamadjavadx.piechart.sample.list

import android.text.TextUtils
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.recyclerview.widget.RecyclerView
import io.github.mohamadjavadx.piechart.sample.components.DataSetRowView
import io.github.mohamadjavadx.piechart.sample.components.IntControlView
import io.github.mohamadjavadx.piechart.sample.components.OutlineButtonView
import io.github.mohamadjavadx.piechart.sample.components.SwitchView
import io.github.mohamadjavadx.piechart.sample.components.UnitToggleView
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

/**
 * Slider, stepped slider and stepper all edit an [IntControl] the same way. A slider row also has
 * a [unitToggle] when its control comes in two units, and [root] is then the row that holds both.
 *
 * Both units of a setting are the same row of the list (see [IntControl.diffId]); the change from
 * one unit to the other is a swap of holders, which [ListItemAnimator] hands to [takeOver].
 */
internal class IntControlVH(
    private val view: IntControlView,
    private val unitToggle: UnitToggleView?,
    root: View,
    onChanged: (position: Int, newValue: Int) -> Unit,
    onUnitSelected: (position: Int, unit: SizeUnit) -> Unit,
) : RecyclerView.ViewHolder(root) {

    init {
        view.setOnValueChangeListener { onChanged(bindingAdapterPosition, it) }
        unitToggle?.setOnSelectedListener { onUnitSelected(bindingAdapterPosition, SizeUnit.entries[it]) }
    }

    fun bind(item: IntControl) {
        // A holder that was recycled in the middle of a fade must not stay faded.
        view.animate().cancel()
        view.alpha = 1f

        view.maxValue = item.maxValue
        view.value = item.value
        view.setLabelFormat(item.label)
        bindUnitToggle(item)
    }

    private fun bindUnitToggle(item: IntControl) {
        val toggle = unitToggle ?: return
        val choice = item.unitChoice
        toggle.isVisible = choice != null
        if (choice == null) return
        toggle.labels = choice.labels
        toggle.selectedIndex = choice.unit.ordinal
        toggle.contentDescription = item.label.substringBefore("%d").trim() + " unit"
    }

    /**
     * This holder replaces [old], which showed the same setting in its other unit. The unit toggle
     * carries on from where the old one is, so it never seems to go away, and the slider, which is
     * new, fades in.
     */
    fun takeOver(old: IntControlVH) {
        val toggle = unitToggle
        val oldToggle = old.unitToggle
        if (toggle != null && oldToggle != null) toggle.continueFrom(oldToggle)

        view.animate().cancel()
        view.alpha = 0f
        view.animate().alpha(1f).setDuration(UNIT_CHANGE_MS).start()
    }

    /** What the control shows right now, which may be ahead of the adapter's list while dragging. */
    val displayedValue: Int get() = view.value

    fun setValue(value: Int) {
        view.value = value
    }

    private companion object {
        const val UNIT_CHANGE_MS = 150L
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
