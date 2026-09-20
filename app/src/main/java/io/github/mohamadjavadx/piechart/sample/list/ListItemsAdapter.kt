package io.github.mohamadjavadx.piechart.sample.list

import android.annotation.SuppressLint
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import androidx.core.view.doOnNextLayout
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import io.github.mohamadjavadx.piechart.sample.components.DataSetRowView
import io.github.mohamadjavadx.piechart.sample.components.IntControlView
import io.github.mohamadjavadx.piechart.sample.components.OutlineButtonView
import io.github.mohamadjavadx.piechart.sample.components.SliderView
import io.github.mohamadjavadx.piechart.sample.components.SteppedSliderView
import io.github.mohamadjavadx.piechart.sample.components.UnitSliderRow
import io.github.mohamadjavadx.piechart.sample.components.StepperView
import io.github.mohamadjavadx.piechart.sample.components.SwitchView
import io.github.mohamadjavadx.piechart.sample.model.BooleanControl
import io.github.mohamadjavadx.piechart.sample.model.Button
import io.github.mohamadjavadx.piechart.sample.model.DataSetRow
import io.github.mohamadjavadx.piechart.sample.model.IntControl
import io.github.mohamadjavadx.piechart.sample.model.SizeUnit
import io.github.mohamadjavadx.piechart.sample.model.ItemPayload
import io.github.mohamadjavadx.piechart.sample.model.ItemViewType
import io.github.mohamadjavadx.piechart.sample.model.ListItem
import io.github.mohamadjavadx.piechart.sample.model.Spacer
import io.github.mohamadjavadx.piechart.sample.model.Switch
import io.github.mohamadjavadx.piechart.sample.model.viewType
import io.github.mohamadjavadx.piechart.sample.utils.dp
import io.github.mohamadjavadx.piechart.sample.utils.setHorizontalMargins
import java.math.BigDecimal

/**
 * Shows the controls and the data set rows.
 *
 * Not a `ListAdapter`: [submitList] diffs on the calling thread (the list has a few dozen
 * items) so that it can also take a new list *without* notifying when every visible control
 * already shows the new value, which is the case while a slider is being dragged
 * (see [isValueEcho]).
 */
internal class ListItemsAdapter(
    private val onIntControlChanged: (control: IntControl, newValue: Int) -> Unit,
    private val onUnitSelected: (control: IntControl, unit: SizeUnit) -> Unit,
    private val onBooleanControlChanged: (control: BooleanControl, newValue: Boolean) -> Unit,
    private val onButtonClicked: (button: Button) -> Unit,
    private val onRowLabelChanged: (rowId: Int, label: String) -> Unit,
    private val onRowValueChanged: (rowId: Int, value: BigDecimal) -> Unit,
    private val onNextFromLastRow: () -> Unit,
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private var items: List<ListItem> = emptyList()
    private var recyclerView: RecyclerView? = null
    private var pendingFocusRowId: Int? = null

    /**
     * Replaces the list, then calls [onCommitted]. With [animate] false the whole list is
     * swapped without item animations, for a different list such as another tab.
     */
    // A different tab is a different list, so telling the list about each change would only be slower.
    @SuppressLint("NotifyDataSetChanged")
    fun submitList(
        newItems: List<ListItem>,
        animate: Boolean = true,
        onCommitted: () -> Unit = {}
    ) {
        val recyclerView = recyclerView
        if (recyclerView != null && recyclerView.isComputingLayout) {
            // Notifying now would throw; the list is applied right after this layout pass.
            recyclerView.post { submitList(newItems, animate, onCommitted) }
            return
        }

        val oldItems = items
        items = newItems
        // A focus request for a row that is not in the list any more is stale.
        if (pendingFocusRowId != null && newItems.none { it is DataSetRow && it.rowId == pendingFocusRowId }) {
            pendingFocusRowId = null
        }

        when {
            !animate -> notifyDataSetChanged()
            !isValueEcho(oldItems, newItems, ::displayedValueAt) ->
                DiffUtil.calculateDiff(ItemsDiff(oldItems, newItems)).dispatchUpdatesTo(this)
        }
        onCommitted()
    }

    private fun displayedValueAt(position: Int): Any? =
        when (val holder = recyclerView?.findViewHolderForAdapterPosition(position)) {
            is IntControlVH -> holder.displayedValue
            is SwitchVH -> holder.displayedValue
            else -> null
        }

    /**
     * Scrolls the row into view, always, so that all of it is visible, then focuses its value
     * field and opens the keyboard. Returns false while the row is not in the list yet.
     */
    fun focusRowValue(recyclerView: RecyclerView, rowId: Int): Boolean {
        val index = items.indexOfFirst { it is DataSetRow && it.rowId == rowId }
        if (index < 0) return false

        recyclerView.scrollToPosition(index)
        val boundHolder = recyclerView.findViewHolderForAdapterPosition(index) as? DataSetRowVH
        if (boundHolder != null) {
            // Already on screen: focus once the scroll has been laid out.
            recyclerView.doOnNextLayout { boundHolder.focusValue() }
        } else {
            // Not created yet: the request is picked up when the row is bound.
            pendingFocusRowId = rowId
        }
        return true
    }

    private fun consumeFocusRequest(rowId: Int): Boolean {
        if (pendingFocusRowId != rowId) return false
        pendingFocusRowId = null
        return true
    }

    /** "Next" on a value moves to the value of the following row, or adds a row after the last. */
    private fun handleNextFromRow(position: Int) {
        if (position == RecyclerView.NO_POSITION) return // the row was just removed
        val nextRow = items.getOrNull(position + 1) as? DataSetRow
        val recyclerView = recyclerView
        when {
            nextRow == null -> onNextFromLastRow()
            recyclerView != null -> focusRowValue(recyclerView, nextRow.rowId)
        }
    }

    override fun onAttachedToRecyclerView(recyclerView: RecyclerView) {
        this.recyclerView = recyclerView
    }

    override fun onDetachedFromRecyclerView(recyclerView: RecyclerView) {
        this.recyclerView = null
    }

    override fun getItemCount(): Int = items.size

    override fun getItemViewType(position: Int): Int = items[position].viewType.ordinal

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val context = parent.context
        val fullWidth = { ViewGroup.MarginLayoutParams(MATCH_PARENT, WRAP_CONTENT) }

        return when (ItemViewType.entries[viewType]) {
            ItemViewType.Button -> ButtonVH(
                OutlineButtonView(context).apply {
                    layoutParams = fullWidth().apply { setHorizontalMargins(16.dp) }
                },
                onClick = { position -> withItemAt<Button>(position, onButtonClicked) },
            )

            // A slider row has room for a unit toggle; it only shows one for a control with two units.
            ItemViewType.Slider -> intControlVH(UnitSliderRow(context, SliderView(context)).apply {
                layoutParams = fullWidth()
            })

            ItemViewType.SteppedSlider -> intControlVH(UnitSliderRow(context, SteppedSliderView(context)).apply {
                layoutParams = fullWidth()
            })

            ItemViewType.Stepper -> intControlVH(StepperView(context).apply {
                layoutParams = fullWidth()
            })

            ItemViewType.Switch -> SwitchVH(
                SwitchView(context).apply { layoutParams = fullWidth() },
                onChanged = { position, checked ->
                    withItemAt<BooleanControl>(position) { onBooleanControlChanged(it, checked) }
                },
            )

            ItemViewType.Spacer -> SpacerVH(
                View(context).apply { layoutParams = ViewGroup.LayoutParams(MATCH_PARENT, 0) }
            )

            ItemViewType.DataSetRow -> DataSetRowVH(
                DataSetRowView(context).apply {
                    layoutParams =
                        ViewGroup.MarginLayoutParams(MATCH_PARENT, DataSetRowView.ROW_HEIGHT)
                },
                onLabelEdited = onRowLabelChanged,
                onValueEdited = onRowValueChanged,
                consumeFocusRequest = ::consumeFocusRequest,
                onNextFromRow = ::handleNextFromRow,
            )
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val item = items[position]
        when (holder) {
            is ButtonVH -> holder.bind(item as Button)
            is IntControlVH -> holder.bind(item as IntControl)
            is SwitchVH -> holder.bind(item as Switch)
            is SpacerVH -> holder.bind(item as Spacer)
            is DataSetRowVH -> holder.bind(item as DataSetRow)
        }
    }

    override fun onBindViewHolder(
        holder: RecyclerView.ViewHolder,
        position: Int,
        payloads: List<Any>
    ) {
        when (val payload = payloads.lastOrNull() as? ItemPayload) {
            is ItemPayload.ProgressChanged if holder is IntControlVH ->
                holder.setValue(payload.value)

            is ItemPayload.Toggled if holder is SwitchVH ->
                holder.setValue(payload.value)

            is ItemPayload.RowEdited if holder is DataSetRowVH ->
                holder.bindEditable(items[position] as DataSetRow)

            else -> onBindViewHolder(holder, position)
        }
    }

    private fun intControlVH(row: UnitSliderRow) = IntControlVH(
        view = row.slider,
        unitToggle = row.toggle,
        root = row,
        onChanged = { position, newValue -> withItemAt<IntControl>(position) { onIntControlChanged(it, newValue) } },
        onUnitSelected = { position, unit -> withItemAt<IntControl>(position) { onUnitSelected(it, unit) } },
    )

    private fun intControlVH(view: IntControlView) = IntControlVH(
        view = view,
        unitToggle = null,
        root = view,
        onChanged = { position, newValue -> withItemAt<IntControl>(position) { onIntControlChanged(it, newValue) } },
        onUnitSelected = { _, _ -> },
    )

    // Looked up at event time: the holder's own copy of the item may be a payload update behind.
    private inline fun <reified T : ListItem> withItemAt(position: Int, action: (T) -> Unit) {
        (items.getOrNull(position) as? T)?.let(action)
    }

    private class ItemsDiff(
        private val old: List<ListItem>,
        private val new: List<ListItem>,
    ) : DiffUtil.Callback() {
        override fun getOldListSize() = old.size
        override fun getNewListSize() = new.size

        override fun areItemsTheSame(oldPosition: Int, newPosition: Int) =
            old[oldPosition].diffId == new[newPosition].diffId

        override fun areContentsTheSame(oldPosition: Int, newPosition: Int) =
            old[oldPosition] == new[newPosition]

        override fun getChangePayload(oldPosition: Int, newPosition: Int): Any? =
            new[newPosition].changePayloadFrom(old[oldPosition])
    }
}
