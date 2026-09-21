package io.github.mohamadjavadx.piechart.sample

import android.graphics.Color
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
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
import io.github.mohamadjavadx.piechart.sample.components.GestureExclusionPlanner
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
import io.github.mohamadjavadx.piechart.sample.utils.dpf
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private val viewModel by lazy { ViewModelProvider(this)[MainViewModel::class.java] }

    private val listAdapter = ListItemsAdapter(
        onIntControlChanged = { control, newValue, repeated -> viewModel.updateIntControl(control, newValue, repeated) },
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
    private lateinit var backChip: Button

    /** Leaves the expanded group; it only takes the back gesture while there is one to leave. */
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            chartView.collapseGroup()
        }
    }

    private var shownTab: SampleTab? = null

    /** The chart's own dim for slices that are not selected, read before any setting changes it. */
    private var defaultUnselectedDim = 0f

    override fun onCreate(savedInstanceState: Bundle?) {
        // The app is light only: dark mode must not change anything, not even the system bar icons.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )

        onBackPressedDispatcher.addCallback(this, backCallback)
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
            LinearLayout(context).apply {
                gravity = Gravity.CENTER_VERTICAL
                addView(
                    TextView(context).apply {
                        text = getString(R.string.chart_title)
                        textSize = 18f
                        setTextColor(Colors.colorText)
                        setTypeface(typeface, Typeface.BOLD)
                    },
                    LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginStart = 16.dp }
                )
                backChip = buildBackChip()
                addView(backChip, LinearLayout.LayoutParams(WRAP_CONTENT, BACK_CHIP_HEIGHT_DP.dp).apply { marginEnd = 16.dp })
            },
            // Tall enough for the chip, so that it can come and go without moving the chart.
            LinearLayout.LayoutParams(MATCH_PARENT, TITLE_ROW_HEIGHT_DP.dp)
        )

        chartView = PieChartView(context).apply {
            setPadding(16.dp)
            defaultUnselectedDim = unselectedDim
            // With small slices grouped, a tap on the group expands it into a ring of its own, next to
            // the big slices squeezed into an arc, dimmed. That is the chart's own look; only the color
            // of the group is the app's.
            setStyle(otherSliceColor = Colors.colorTextVariant)
            setOnGroupExpandedChangedListener(::onGroupExpandedChanged)
            centerVisibility = CenterVisibility.MinHoleRatio(0.5f)
            // The selected slice's label and value in the hole, shown while the hole is big enough.
            centerRenderer = DefaultCenterRenderer(
                CenterInfoStyle(labelColor = Colors.colorTextVariant, valueColor = Colors.colorText)
            )
            // Only a tap is remembered: the chart also reports "nothing selected" when its data
            // changes, and that must not forget the choice. A tap on the group or on the arc of big
            // slices selects a slice, and comes here with it.
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

    private fun buildBackChip() = Button(this).apply {
        text = getString(R.string.chart_back)
        isAllCaps = false
        textSize = 13f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Colors.colorAccent)
        stateListAnimator = null
        minHeight = 0
        minimumHeight = 0
        setPadding(12.dp, 0, 12.dp, 0)
        val shape = GradientDrawable().apply {
            setColor(Colors.colorTrack)
            cornerRadius = BACK_CHIP_HEIGHT_DP.dpf / 2f
        }
        background = RippleDrawable(ColorStateList.valueOf(Colors.colorRipple), shape, null)
        visibility = View.INVISIBLE
        setOnClickListener { chartView.collapseGroup() }
    }

    /** All three ways out of the expanded group: this chip, the back gesture, a tap on the main slice. */
    private fun onGroupExpandedChanged(isExpanded: Boolean) {
        backChip.visibility = if (isExpanded) View.VISIBLE else View.INVISIBLE
        backCallback.isEnabled = isExpanded
        // The chart selects a slice when the group is opened or closed. When it goes away by itself
        // (the switch, new data) it does not: select the tapped row again if it is there.
        chartView.post { restoreSelection() }
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

        // A drag that starts at the end of a track must not be taken for the back gesture.
        GestureExclusionPlanner(this).attach()

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
        restoreSelection()
    }

    /**
     * The chart keeps a selected slice across data changes, but a row that had dropped out (its
     * value was 0, or it is inside the group) is gone from the chart; select it again when it comes
     * back. The chart's own slices are what to look in: it drops rows without a value and groups
     * small ones, and the slice it adds for that has an id that is not a row id. A row that is in
     * the expanded group's arc of big slices is found too, but the chart does not select it.
     */
    private fun restoreSelection() {
        val selectedRowId = viewModel.selectedRowId.value ?: return
        val index = chartView.currentDataset.indexOfFirst { it.id == selectedRowId }
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
            groupSmallSlices = style.groupSmallSlices,
            unselectedDim = if (style.dimsOtherSlices) defaultUnselectedDim else NOT_DIMMED,
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
        const val TITLE_ROW_HEIGHT_DP = 36
        const val BACK_CHIP_HEIGHT_DP = 30
        const val NOT_DIMMED = 0f
        const val MAX_RECYCLED_ROWS = 20
        const val WARMED_ROWS = 8
    }
}
