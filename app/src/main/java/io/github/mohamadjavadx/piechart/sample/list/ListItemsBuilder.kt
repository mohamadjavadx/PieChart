package io.github.mohamadjavadx.piechart.sample.list

import io.github.mohamadjavadx.piechart.PieChartData
import io.github.mohamadjavadx.piechart.sample.model.ChartSetting
import io.github.mohamadjavadx.piechart.sample.model.Control
import io.github.mohamadjavadx.piechart.sample.model.DataSetRow
import io.github.mohamadjavadx.piechart.sample.model.ListItem
import io.github.mohamadjavadx.piechart.sample.model.SampleTab
import io.github.mohamadjavadx.piechart.sample.model.Spacer
import io.github.mohamadjavadx.piechart.sample.model.rowId

private const val DEFAULT_SPACE_DP = 24
private const val SMALL_SPACE_DP = 16

/**
 * Lays out the list of a tab. All spacing comes from [Spacer] items, not margins.
 *
 * It is called for every state change, so it hands back the same [Spacer] and [DataSetRow]
 * instances while they are unchanged instead of allocating them again.
 */
internal class ListItemsBuilder {

    private val spacers = HashMap<String, Spacer>()
    private var rows = HashMap<Int, DataSetRow>()

    fun build(
        tab: SampleTab,
        controls: List<Control>,
        dataSet: List<PieChartData>,
    ): List<ListItem> = when (tab) {
        SampleTab.ChartSettings -> buildList {
            add(spacer("spacer_top", SMALL_SPACE_DP))
            for (control in controls) {
                add(control)
                add(spacer("spacer_after_${control.id}", DEFAULT_SPACE_DP))
            }
        }

        SampleTab.Data -> buildList {
            add(spacer("spacer_top", SMALL_SPACE_DP))
            controls.find { it.id == ChartSetting.Segments.id }?.let {
                add(it)
                add(spacer("spacer_small_after_${it.id}", SMALL_SPACE_DP))
            }
            addAll(dataRows(dataSet))
            if (dataSet.isNotEmpty()) add(spacer("spacer_after_rows", DEFAULT_SPACE_DP))
            controls.find { it.id == ChartSetting.Restore.id }?.let {
                add(it)
                add(spacer("spacer_after_${it.id}", DEFAULT_SPACE_DP))
            }
        }
    }

    // The height is fixed per id, so the id alone is the cache key.
    private fun spacer(id: String, heightDp: Int) = spacers.getOrPut(id) { Spacer(id, heightDp) }

    private fun dataRows(dataSet: List<PieChartData>): List<DataSetRow> {
        val previous = rows
        rows = HashMap(dataSet.size * 2)
        return dataSet.mapIndexed { index, data ->
            val cached = previous[data.rowId]
            val row = if (cached != null && cached.matches(data, index)) cached else DataSetRow(
                rowId = data.rowId,
                label = data.label,
                position = index,
                value = data.value,
                color = data.color,
            )
            rows[data.rowId] = row
            row
        }
    }

    private fun DataSetRow.matches(data: PieChartData, index: Int) =
        position == index && label == data.label && color == data.color && value == data.value
}
