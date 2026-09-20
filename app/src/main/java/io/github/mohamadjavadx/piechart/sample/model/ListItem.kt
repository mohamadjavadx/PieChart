package io.github.mohamadjavadx.piechart.sample.model

import io.github.mohamadjavadx.piechart.PieChartData
import java.math.BigDecimal

/** One entry of the list: a control, a data set row or a gap. */
internal sealed interface ListItem {
    val id: String

    /**
     * What the list diff takes for the same item. A control that changes into the control of
     * another unit keeps it, so that the row changes in place instead of leaving and coming back.
     */
    val diffId: String get() = id

    /** What to update when only part of the item's view changed from [old]; null means all of it. */
    fun changePayloadFrom(old: ListItem): ItemPayload? = null
}

/** An item the user operates, with a text [label]. */
internal sealed interface Control : ListItem {
    val label: String
}

/**
 * The unit toggle of a control that is measured in either of two units: the [setting] it belongs
 * to, the label of the relative unit (`%` or `deg`), and which of the two units this control is
 * in. The other unit is dp.
 */
internal data class UnitChoice(val setting: SizedSetting, val relativeLabel: String, val unit: SizeUnit) {
    val labels: List<String> = listOf(relativeLabel, "dp")

    /** The list item that both units of the setting share; see [ListItem.diffId]. */
    val rowId: String = "unit_${setting.name}"
}

internal sealed interface IntControl : Control {
    val value: Int
    val maxValue: Int

    /** Shown as a toggle beside the title; null for a control that has one unit only. */
    val unitChoice: UnitChoice? get() = null

    override val diffId: String get() = unitChoice?.rowId ?: id

    fun withValue(value: Int): IntControl

    override fun changePayloadFrom(old: ListItem): ItemPayload? =
        if (old is IntControl && old.id == id && old.label == label && old.maxValue == maxValue && old.value != value)
            ItemPayload.ProgressChanged(value)
        else
            null
}

internal sealed interface BooleanControl : Control {
    val value: Boolean

    fun withValue(value: Boolean): BooleanControl

    override fun changePayloadFrom(old: ListItem): ItemPayload? =
        if (old is BooleanControl && old.id == id && old.label == label && old.value != value)
            ItemPayload.Toggled(value)
        else
            null
}

internal data class Button(
    override val id: String,
    override val label: String,
) : Control

internal data class Slider(
    override val id: String,
    override val label: String,
    override val value: Int,
    override val maxValue: Int,
    override val unitChoice: UnitChoice? = null,
) : IntControl {
    override fun withValue(value: Int) = copy(value = value)
}

internal data class SteppedSlider(
    override val id: String,
    override val label: String,
    override val value: Int,
    override val maxValue: Int,
    override val unitChoice: UnitChoice? = null,
) : IntControl {
    override fun withValue(value: Int) = copy(value = value)
}

internal data class Stepper(
    override val id: String,
    override val label: String,
    override val value: Int,
    override val maxValue: Int,
) : IntControl {
    override fun withValue(value: Int) = copy(value = value)
}

internal data class Switch(
    override val id: String,
    override val label: String,
    override val value: Boolean,
) : BooleanControl {
    override fun withValue(value: Boolean) = copy(value = value)
}

/** One editable row of the pie chart data set; [label] is the slice label. */
internal data class DataSetRow(
    val rowId: Int,
    val label: String,
    val position: Int,
    val value: BigDecimal,
    val color: Int,
) : ListItem {
    override val id: String = "row_$rowId"

    /** Only the editable fields changed, e.g. while typing; number and colour stay as they are. */
    override fun changePayloadFrom(old: ListItem): ItemPayload? =
        if (old is DataSetRow && old.rowId == rowId && old.position == position && old.color == color &&
            (old.label != label || old.value.compareTo(value) != 0)
        ) ItemPayload.RowEdited
        else null
}

/** Gap between list items; the list has no per-item margins or top padding. */
internal data class Spacer(override val id: String, val heightDp: Int) : ListItem

internal enum class ItemViewType {
    Button,
    Slider,
    SteppedSlider,

    /** A slider or a stepped slider with a unit toggle; one row for both units of a setting. */
    UnitRow,
    Stepper,
    Switch,
    DataSetRow,
    Spacer,
}

internal val ListItem.viewType: ItemViewType
    get() = when (this) {
        is Button -> ItemViewType.Button
        is Slider -> if (unitChoice != null) ItemViewType.UnitRow else ItemViewType.Slider
        is SteppedSlider -> if (unitChoice != null) ItemViewType.UnitRow else ItemViewType.SteppedSlider
        is Stepper -> ItemViewType.Stepper
        is Switch -> ItemViewType.Switch
        is DataSetRow -> ItemViewType.DataSetRow
        is Spacer -> ItemViewType.Spacer
    }

internal sealed interface ItemPayload {
    data class ProgressChanged(val value: Int) : ItemPayload
    data class Toggled(val value: Boolean) : ItemPayload
    data object RowEdited : ItemPayload
}

/** The sample gives every row of the chart data an `Int` id; the library accepts any type. */
internal val PieChartData.rowId: Int get() = id as Int
