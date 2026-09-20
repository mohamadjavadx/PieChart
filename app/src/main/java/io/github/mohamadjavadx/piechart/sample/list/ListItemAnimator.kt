package io.github.mohamadjavadx.piechart.sample.list

import androidx.recyclerview.widget.DefaultItemAnimator
import androidx.recyclerview.widget.RecyclerView

/**
 * The list's item animations, with two rules about a row that changes.
 *
 * A control row that is bound again as a whole, a setting that changes unit, is replaced by a new
 * holder, whichever kind of slider it now has. The swap itself is not animated: the new row takes
 * the old one's place at once and carries on from it (see [IntControlVH.takeOver]), so the unit
 * toggle stays where it is and keeps sliding, and only the slider fades in. The rows below move
 * along as the height changes.
 *
 * Any other row is rebound in place, without a change animation. Rows are bound again on every
 * keystroke, and a change animation would swap the focused EditText for another view holder and
 * drop its focus and cursor.
 */
internal class ListItemAnimator : DefaultItemAnimator() {

    init {
        supportsChangeAnimations = false
    }

    override fun canReuseUpdatedViewHolder(
        viewHolder: RecyclerView.ViewHolder,
        payloads: MutableList<Any>
    ): Boolean {
        // A payload is a change of the value only: the slider moves, nothing swaps.
        val isWholeControlRow = viewHolder is IntControlVH && payloads.isEmpty()
        return !isWholeControlRow && super.canReuseUpdatedViewHolder(viewHolder, payloads)
    }

    override fun animateChange(
        oldHolder: RecyclerView.ViewHolder,
        newHolder: RecyclerView.ViewHolder,
        fromX: Int,
        fromY: Int,
        toX: Int,
        toY: Int
    ): Boolean {
        if (oldHolder !is IntControlVH || newHolder !is IntControlVH || oldHolder === newHolder) {
            return super.animateChange(oldHolder, newHolder, fromX, fromY, toX, toY)
        }
        newHolder.takeOver(oldHolder)
        dispatchChangeFinished(oldHolder, true)
        dispatchChangeFinished(newHolder, false)
        return false
    }
}
