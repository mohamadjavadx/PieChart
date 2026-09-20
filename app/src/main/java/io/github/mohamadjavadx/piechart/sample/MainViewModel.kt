package io.github.mohamadjavadx.piechart.sample

import androidx.lifecycle.ViewModel
import io.github.mohamadjavadx.piechart.PieChartData
import io.github.mohamadjavadx.piechart.sample.data.PieChartMockData
import io.github.mohamadjavadx.piechart.sample.list.ListItemsBuilder
import io.github.mohamadjavadx.piechart.sample.model.BooleanControl
import io.github.mohamadjavadx.piechart.sample.model.Button
import io.github.mohamadjavadx.piechart.sample.model.ChartSetting
import io.github.mohamadjavadx.piechart.sample.model.ChartStyle
import io.github.mohamadjavadx.piechart.sample.model.Control
import io.github.mohamadjavadx.piechart.sample.model.DefaultControls
import io.github.mohamadjavadx.piechart.sample.model.DefaultDpSettings
import io.github.mohamadjavadx.piechart.sample.model.IntControl
import io.github.mohamadjavadx.piechart.sample.model.ListState
import io.github.mohamadjavadx.piechart.sample.model.SampleTab
import io.github.mohamadjavadx.piechart.sample.model.SizeUnit
import io.github.mohamadjavadx.piechart.sample.model.SizedSetting
import io.github.mohamadjavadx.piechart.sample.model.maxCornerRadius
import io.github.mohamadjavadx.piechart.sample.model.rowId
import io.github.mohamadjavadx.piechart.sample.model.toChartStyle
import java.math.BigDecimal
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update

internal class MainViewModel : ViewModel() {

    private val _controls = MutableStateFlow(DefaultControls)

    /** The settings that are measured in dp; the others are measured relatively (a ratio, or degrees). */
    private val _dpSettings = MutableStateFlow(DefaultDpSettings)

    /** The corner radius the user picked; the slider shows less of it while the hole ratio is small. */
    private var chosenCornerRadius = defaultCornerRadius()

    private var nextRowId = 1

    /** Rows whose value the user typed; those keep it when the generated values are redone. */
    private val editedValueIds = mutableSetOf<Int>()

    private val _dataSet = MutableStateFlow(emptyList<PieChartData>())
    val dataSet: StateFlow<List<PieChartData>> = _dataSet.asStateFlow()

    private val _tab = MutableStateFlow(SampleTab.ChartSettings)
    val tab = _tab.asStateFlow()

    /**
     * The row whose slice the user tapped in the chart. The chart forgets its selection whenever
     * the data changes, so the activity selects this row again if it is still in the data.
     * Row ids are never reused, so a row that has gone stays unselected.
     */
    private val _selectedRowId = MutableStateFlow<Int?>(null)
    val selectedRowId: StateFlow<Int?> = _selectedRowId.asStateFlow()

    init {
        _dataSet.value = resized(emptyList(), defaultSegmentCount())
        _selectedRowId.value = _dataSet.value.firstOrNull()?.rowId
    }

    private val listItemsBuilder = ListItemsBuilder()

    val listItems: Flow<ListState> = combine(_tab, _controls, _dpSettings, _dataSet) { tab, controls, dpSettings, dataSet ->
        ListState(tab, listItemsBuilder.build(tab, controls, dpSettings, dataSet))
    }

    /** Only emits when an actual style setting changed, not for e.g. the segment count. */
    val chartStyle: Flow<ChartStyle> =
        combine(_controls, _dpSettings) { controls, dpSettings -> controls.toChartStyle(dpSettings) }
            .distinctUntilChanged()

    /** Row whose value field should take focus once it is on screen; see [clearPendingFocus]. */
    var pendingFocusRowId: Int? = null
        private set

    fun clearPendingFocus() {
        pendingFocusRowId = null
    }

    fun selectTab(tab: SampleTab) {
        if (tab == _tab.value) return
        pendingFocusRowId = null
        _tab.value = tab
    }

    fun updateIntControl(control: IntControl, value: Int) {
        if (control.id == ChartSetting.CornerRadius.id) chosenCornerRadius = value
        // One update, so that the chart gets the new hole ratio and corner radius together.
        _controls.update { controls ->
            val updated = controls.map { if (it.id == control.id) control.withValue(value) else it }
            if (control.id == ChartSetting.HoleRatio.id) updated.withCornerRadiusFor(holeRatio = value) else updated
        }
        if (control.id == ChartSetting.Segments.id) {
            resizeDataSet(value, NewRowFocus.IfValueEmpty)
        }
    }

    /** The chosen corner radius, held back to what a small hole ratio allows; it comes back as the hole grows. */
    private fun List<Control>.withCornerRadiusFor(holeRatio: Int): List<Control> = map {
        if (it.id != ChartSetting.CornerRadius.id) return@map it
        (it as IntControl).withValue(minOf(chosenCornerRadius, maxCornerRadius(holeRatio)))
    }

    /** The unit toggle of [control] was set to [unit]; the setting then shows and uses the control of that unit. */
    fun selectUnit(control: IntControl, unit: SizeUnit) {
        val setting = ChartSetting.entries.firstOrNull { it.id == control.id }?.sized ?: return
        _dpSettings.update { if (unit == SizeUnit.Dp) it + setting else it - setting }
    }

    fun updateBooleanControl(control: BooleanControl, value: Boolean) {
        replaceControl(control.withValue(value))
    }

    fun selectRow(rowId: Int) {
        _selectedRowId.value = rowId
    }

    fun onButtonClicked(button: Button) {
        if (button.id == ChartSetting.Restore.id) restoreSettings()
    }

    fun updateRowLabel(rowId: Int, label: String) {
        updateRow(rowId) { it.copy(label = label) }
    }

    /**
     * Any value the user types counts as their choice, even when it equals the generated one:
     * the row then keeps it when the generated values are redone.
     */
    fun updateRowValue(rowId: Int, value: BigDecimal) {
        editedValueIds += rowId
        updateRow(rowId) { if (it.value.compareTo(value) == 0) it else it.copy(value = value) }
    }

    private inline fun updateRow(rowId: Int, transform: (PieChartData) -> PieChartData) {
        val rows = _dataSet.value
        val index = rows.indexOfFirst { it.rowId == rowId }
        if (index < 0) return
        val updated = transform(rows[index])
        if (updated == rows[index]) return
        _dataSet.value = rows.toMutableList().apply { this[index] = updated }
    }

    private fun replaceControl(updated: Control) {
        _controls.update { controls ->
            controls.map { if (it.id == updated.id) updated else it }
        }
    }

    /**
     * Rows keep their identity; only the tail is dropped or appended. Every row the user did
     * not edit gets its value from the generated sequence for the new count (so the last two
     * stay equal); an edited row keeps the user's value. Rows past the mock limit start at 0.
     */
    private fun resized(rows: List<PieChartData>, count: Int): List<PieChartData> {
        val mock = PieChartMockData.createMockDataSet(count = count)
        return List(count) { index ->
            val row = rows.getOrNull(index) ?: PieChartData(
                id = nextRowId++,
                label = PieChartMockData.labelAt(index),
                value = BigDecimal.ZERO,
                color = PieChartMockData.colorAt(index),
            )
            if (row.rowId in editedValueIds) row
            else row.copy(value = mock.getOrNull(index)?.value ?: BigDecimal.ZERO)
        }
    }

    /** Whether the value field of a newly added row takes the focus. */
    private enum class NewRowFocus {
        None,

        /** Only for a row that starts at 0 (past the mock limit): it has no value yet. */
        IfValueEmpty,

        Always,
    }

    private fun resizeDataSet(count: Int, focus: NewRowFocus = NewRowFocus.None) {
        val old = _dataSet.value
        val resized = resized(old, count)

        val oldIds = old.mapTo(HashSet()) { it.rowId }
        val added = resized.filter { it.rowId !in oldIds }
        val focusedRow = when (focus) {
            NewRowFocus.None -> null
            NewRowFocus.IfValueEmpty -> added.lastOrNull { it.value.signum() == 0 }
            NewRowFocus.Always -> added.lastOrNull()
        }

        // The request goes first: collectors can run as soon as the data set changes, and the
        // list update that shows the new row is when the request gets picked up.
        pendingFocusRowId = focusedRow?.rowId
        // The row can only be edited on the Data tab.
        if (focusedRow != null) _tab.value = SampleTab.Data
        _dataSet.value = resized
    }

    /**
     * Adds a row at the end, as the stepper's + does, for a keyboard user who moves on from the
     * last row. Returns false when the data set is already at the stepper's maximum.
     */
    fun appendRow(): Boolean {
        val segments = _controls.value.first { it.id == ChartSetting.Segments.id } as IntControl
        val count = _dataSet.value.size
        if (count >= segments.maxValue) return false
        replaceControl(segments.withValue(count + 1))
        resizeDataSet(count + 1, NewRowFocus.Always)
        return true
    }

    /** Back to the initial state: default controls and the generated data set. */
    private fun restoreSettings() {
        _controls.value = DefaultControls
        _dpSettings.value = DefaultDpSettings
        chosenCornerRadius = defaultCornerRadius()
        editedValueIds.clear()
        _dataSet.value = resized(emptyList(), defaultSegmentCount())
        _selectedRowId.value = _dataSet.value.firstOrNull()?.rowId
    }

    private fun defaultCornerRadius(): Int =
        (DefaultControls.first { it.id == ChartSetting.CornerRadius.id } as IntControl).value

    private fun defaultSegmentCount(): Int =
        (DefaultControls.first { it.id == ChartSetting.Segments.id } as IntControl).value
}
