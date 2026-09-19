package io.github.mohamadjavadx.piechart.sample.list

import io.github.mohamadjavadx.piechart.sample.model.ItemPayload
import io.github.mohamadjavadx.piechart.sample.model.ListItem

/**
 * Whether [new] differs from [old] only by control values that the views already show, so the
 * adapter can take the new list without notifying anything.
 *
 * This is what happens while a slider is dragged: the slider moves first and the new value
 * comes back through the list. The rule that keeps it safe: **every** changed item must be a
 * pure value change ([ItemPayload.ProgressChanged] / [ItemPayload.Toggled]) whose new value
 * equals what its bound view shows. Anything else, including a view that is not bound
 * ([displayedValueAt] returns null: it may sit in the recycler's cache with an older value),
 * takes the normal diff path. So a reset, e.g. Restore, is never swallowed.
 *
 * [displayedValueAt] returns what the view bound at a position shows, or null if none is bound.
 */
internal fun isValueEcho(
    old: List<ListItem>,
    new: List<ListItem>,
    displayedValueAt: (position: Int) -> Any?,
): Boolean {
    if (old.size != new.size) return false
    return new.indices.all { position ->
        val oldItem = old[position]
        val newItem = new[position]
        when (val payload = newItem.changePayloadFrom(oldItem)) {
            is ItemPayload.ProgressChanged -> displayedValueAt(position) == payload.value
            is ItemPayload.Toggled -> displayedValueAt(position) == payload.value
            // Not a value change: fine only when the item did not change at all.
            else -> oldItem == newItem
        }
    }
}
