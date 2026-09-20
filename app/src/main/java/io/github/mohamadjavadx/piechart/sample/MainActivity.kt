package io.github.mohamadjavadx.piechart.sample

import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isGone
import androidx.core.view.setPadding
import androidx.core.view.updatePadding
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import io.github.mohamadjavadx.piechart.PieChartData
import io.github.mohamadjavadx.piechart.PieChartView
import io.github.mohamadjavadx.piechart.center.CenterInfoStyle
import io.github.mohamadjavadx.piechart.center.CenterVisibility
import io.github.mohamadjavadx.piechart.center.DefaultCenterRenderer
import io.github.mohamadjavadx.piechart.sample.components.SegmentedSelectorView
import io.github.mohamadjavadx.piechart.sample.list.ListItemAnimator
import io.github.mohamadjavadx.piechart.sample.list.ListItemsAdapter
import io.github.mohamadjavadx.piechart.sample.model.ChartStyle
import io.github.mohamadjavadx.piechart.sample.model.dpValue
import io.github.mohamadjavadx.piechart.sample.model.relativeValue
import io.github.mohamadjavadx.piechart.sample.model.ItemViewType
import io.github.mohamadjavadx.piechart.sample.model.ListState
import io.github.mohamadjavadx.piechart.sample.model.SampleTab
import io.github.mohamadjavadx.piechart.sample.model.rowId
import io.github.mohamadjavadx.piechart.sample.theme.Colors
import io.github.mohamadjavadx.piechart.sample.utils.closeKeyboard
import io.github.mohamadjavadx.piechart.sample.utils.dp
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private val viewModel by lazy { ViewModelProvider(this)[MainViewModel::class.java] }

    private val listAdapter = ListItemsAdapter(
        onIntControlChanged = { control, newValue -> viewModel.updateIntControl(control, newValue) },
        onUnitSelected = { control, unit -> viewModel.selectUnit(control, unit) },
        onBooleanControlChanged = { control, newValue -> viewModel.updateBooleanControl(control, newValue) },
        onButtonClicked = { viewModel.onButtonClicked(it) },
        onRowLabelChanged = { rowId, label -> viewModel.updateRowLabel(rowId, label) },
        onRowValueChanged = { rowId, value -> viewModel.updateRowValue(rowId, value) },
        // Nothing to move on to: add a row like the stepper's +, or close the keyboard at the maximum.
        onNextFromLastRow = { if (!viewModel.appendRow()) dismissEditor() },
    )

    private lateinit var rootView: FrameLayout
    private lateinit var chartView: PieChartView
    private lateinit var rvItems: RecyclerView
    private lateinit var selectorView: SegmentedSelectorView

    private var shownTab: SampleTab? = null

    /** The chart's own alpha for slices that are not selected, read before any setting changes it. */
    private var defaultUnselectedAlpha = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        // The app is light only: dark mode must not change anything, not even the system bar icons.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )

        selectorView = buildSelector()
        rvItems = buildItemsList()
        rootView = FrameLayout(this).apply {
            setBackgroundColor(Colors.colorBackground)
            // The place where focus goes when an editor is dismissed. Without a focusable root,
            // clearing focus can hand it to the first EditText again (outside touch mode).
            isFocusable = true
            isFocusableInTouchMode = true
            descendantFocusability = ViewGroup.FOCUS_BEFORE_DESCENDANTS
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) defaultFocusHighlightEnabled = false

            addView(
                LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(buildChartSection(), LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
                    addView(rvItems, LinearLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
                },
                FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
            )
            addView(
                selectorView,
                FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.BOTTOM or Gravity.CENTER)
            )
        }
        setContentView(rootView)

        applyWindowInsets()
        observeViewModel()
        warmRowPool()
    }

    private fun buildChartSection() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL

        addView(
            TextView(context).apply {
                text = getString(R.string.chart_title)
                textSize = 18f
                setTextColor(Colors.colorText)
                setTypeface(typeface, Typeface.BOLD)
            },
            LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginStart = 16.dp }
        )

        chartView = PieChartView(context).apply {
            setPadding(16.dp)
            defaultUnselectedAlpha = unselectedAlpha
            centerVisibility = CenterVisibility.WhenFits
            // The selected slice's label and value in the hole, shown while the hole is big enough.
            centerRenderer = DefaultCenterRenderer(
                CenterInfoStyle(labelColor = Colors.colorTextVariant, valueColor = Colors.colorText)
            )
            // Only a tap on a slice is remembered: the chart also reports "nothing selected" when
            // its data changes, and that must not forget the choice.
            setOnChunkClickListener { slice -> viewModel.selectRow(slice.rowId) }
        }
        // Measured once: the screen is portrait only, and a size change recreates the activity.
        val chartHeight = (resources.displayMetrics.widthPixels * CHART_HEIGHT_TO_WIDTH).toInt()
        // The chart is square, so it is as wide as it is tall; center it.
        addView(
            chartView,
            LinearLayout.LayoutParams(MATCH_PARENT, chartHeight).apply { gravity = Gravity.CENTER_HORIZONTAL }
        )

        addView(
            View(context).apply { setBackgroundColor(Colors.colorStroke) },
            LinearLayout.LayoutParams(MATCH_PARENT, 1.dp)
        )
    }

    private fun buildSelector() = SegmentedSelectorView(this).apply {
        items = listOf(getString(R.string.tab_chart_settings), getString(R.string.tab_data))
        selectedIndex = viewModel.tab.value.ordinal

        setOnSelectionChangeListener { index ->
            // Drop focus and the keyboard before the rows are swapped out.
            dismissEditor()
            viewModel.selectTab(SampleTab.entries[index])
        }
    }

    private fun buildItemsList() = RecyclerView(this).apply {
        // Room for the selector floating over the bottom of the list.
        setPadding(0, 0, 0, selectorView.desiredViewHeight)
        clipToPadding = false
        layoutManager = LinearLayoutManager(context)
        adapter = listAdapter
        setHasFixedSize(true)
        // Switching tabs recycles every row; keep them all instead of destroying the extras.
        recycledViewPool.setMaxRecycledViews(ItemViewType.DataSetRow.ordinal, MAX_RECYCLED_ROWS)

        itemAnimator = ListItemAnimator()

        addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                if (dy != 0) dismissEditorIfScrolledOut()
            }
        })
        // A focused row that gets recycled has already left the screen.
        addOnChildAttachStateChangeListener(object : RecyclerView.OnChildAttachStateChangeListener {
            override fun onChildViewAttachedToWindow(view: View) = Unit
            override fun onChildViewDetachedFromWindow(view: View) {
                if (view.hasFocus()) dismissEditor()
            }
        })
    }

    private fun applyWindowInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            view.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                maxOf(systemBars.bottom, imeBottom),
            )

            val isKeyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
            if (!isKeyboardVisible) rootView.requestFocus()
            // The selector would sit on top of the rows being edited, so it steps aside.
            selectorView.isGone = isKeyboardVisible
            rvItems.updatePadding(
                bottom = if (isKeyboardVisible) 0 else selectorView.desiredViewHeight
            )

            insets
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { viewModel.listItems.collect(::showList) }
                launch { viewModel.tab.collect { selectorView.selectedIndex = it.ordinal } }
                launch { viewModel.chartStyle.collect(::applyChartStyle) }
                // Posted so the first data set is applied after the chart is measured.
                launch { viewModel.dataSet.collect { data -> chartView.post { showChartData(data) } } }
            }
        }
    }

    /**
     * Creates a few data set rows while the main thread is idle and puts them in the pool, so
     * that the first switch to the Data tab does not build them all inside one frame.
     */
    private fun warmRowPool() {
        var remaining = WARMED_ROWS
        Looper.myQueue().addIdleHandler {
            rvItems.recycledViewPool.putRecycledView(
                listAdapter.createViewHolder(rvItems, ItemViewType.DataSetRow.ordinal)
            )
            remaining--
            remaining > 0 && !isDestroyed // true keeps the handler for the next idle moment
        }
    }

    private fun showList(state: ListState) {
        val tabChanged = state.tab != shownTab
        // A different tab is a different list: swap it without item animations.
        listAdapter.submitList(state.items, animate = !tabChanged) {
            if (tabChanged) {
                shownTab = state.tab
                rvItems.scrollToPosition(0)
            }
            viewModel.pendingFocusRowId?.let { rowId ->
                if (listAdapter.focusRowValue(rvItems, rowId)) {
                    viewModel.clearPendingFocus()
                }
            }
        }
    }

    private fun showChartData(data: List<PieChartData>) {
        chartView.setData(data)
        // The chart keeps a selected slice across data changes, but a row that had dropped out
        // (its value was 0) is gone from the chart; select it again when it comes back. The chart
        // drops rows without a value, so look the row up in its own list of slices.
        val selectedRowId = viewModel.selectedRowId.value ?: return
        val index = chartView.currentDataset.indexOfFirst { it.rowId == selectedRowId }
        if (index >= 0 && index != chartView.currentSelectedIndex) chartView.setSelectedIndex(index)
    }

    private fun applyChartStyle(style: ChartStyle) {
        // Each size goes to the chart in its own unit; the chart takes either one of a pair.
        chartView.setStyle(
            holeRadiusRatio = style.holeRadiusRatio,
            cornerRadiusRatio = style.cornerRadius.relativeValue,
            cornerRadiusDp = style.cornerRadius.dpValue,
            selectedShadowOffsetRatio = style.shadowOffset.relativeValue,
            selectedShadowOffsetDp = style.shadowOffset.dpValue,
            visualGapDeg = style.gap.relativeValue,
            visualGapDp = style.gap.dpValue,
            ensureRenderableSlices = style.ensureRenderableSlices,
            unselectedAlpha = if (style.dimsOtherSlices) defaultUnselectedAlpha else OPAQUE_ALPHA,
        )
    }

    private fun dismissEditorIfScrolledOut() {
        val focused = rvItems.findFocus() ?: return
        val row = rvItems.findContainingItemView(focused) ?: return
        val visibleTop = rvItems.paddingTop
        val visibleBottom = rvItems.height - rvItems.paddingBottom
        if (row.bottom <= visibleTop || row.top >= visibleBottom) dismissEditor()
    }

    private fun dismissEditor() {
        rootView.requestFocus()
        rootView.closeKeyboard()
    }

    private companion object {
        const val CHART_HEIGHT_TO_WIDTH = 0.7f
        const val OPAQUE_ALPHA = 255
        const val MAX_RECYCLED_ROWS = 20
        const val WARMED_ROWS = 8
    }
}
