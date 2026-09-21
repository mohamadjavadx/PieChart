import { PieChart } from "../chart/pieChart.js";
import { centerStyleFromPage, createDefaultCenter } from "../center/index.js";
// The chart as an HTML element that works in any page or framework:
//
//   <pie-chart center group-small-slices label="Spending by category"
//              data='[{"label":"Rent","value":1200},{"label":"Food","value":450.5}]'></pie-chart>
//
// Everything a script can do to a PieChart it can do to the element, and the page hears about selection with events.
// It draws in a shadow root, so a page's styles can not reach into the chart, and the chart's can not leak out.
/** Importing this in a page that runs on a server (where there is no HTMLElement) is safe; the class is just never used. */
const Base = typeof HTMLElement === "undefined" ? class {
} : HTMLElement;
const STYLE_TEXT = `
:host { display: block; width: 100%; aspect-ratio: 1 / 1; }
:host([hidden]) { display: none; }
#chart { width: 100%; height: 100%; }
`;
/** Attributes that are numbers in the chart's style, and the style they set. */
const NUMBER_ATTRIBUTES = {
    "hole-ratio": "holeRadiusRatio",
    "corner-radius-dp": "cornerRadiusDp",
    "gap-dp": "visualGapDp",
    "shadow-offset-dp": "selectedShadowOffsetDp",
    "unselected-dim": "unselectedDim",
};
/** Style settings that measure the same thing in two units, of which only one may be given. */
const UNIT_PAIRS = [
    ["cornerRadiusRatio", "cornerRadiusDp"],
    ["visualGapDeg", "visualGapDp"],
    ["selectedShadowOffsetRatio", "selectedShadowOffsetDp"],
];
const BOOLEAN_ATTRIBUTES = ["group-small-slices"];
export class PieChartElement extends Base {
    static observedAttributes = [
        "data", "selected-index", "center", "label", "other-label", "padding", "reduced-motion",
        ...Object.keys(NUMBER_ATTRIBUTES), ...BOOLEAN_ATTRIBUTES,
    ];
    container;
    chartInstance = null;
    dataValue = null;
    styleValue = {};
    selectedValue = null;
    centerValue = undefined; // undefined: the attribute decides
    textValue = {};
    schemeQuery;
    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = STYLE_TEXT;
        this.container = document.createElement("div");
        this.container.id = "chart";
        this.container.setAttribute("part", "chart");
        root.append(style, this.container);
        this.schemeQuery = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    }
    // ------------------------------------------------------------------ Lifecycle
    connectedCallback() {
        if (this.chartInstance)
            return;
        const chart = new PieChart(this.container, {
            padding: this.numberAttribute("padding") ?? 16,
            style: this.effectiveStyle(),
            center: this.wantedCenter(),
            otherLabel: this.getAttribute("other-label") ?? undefined,
            accessibility: this.accessibleText(),
            reducedMotion: this.motionAttribute(),
        });
        chart.model.onSelectionChanged = (slice) => this.emit("selectionchange", slice);
        chart.model.onSliceClick = (slice) => this.emit("sliceclick", slice);
        chart.model.onGroupExpandedChanged = (expanded) => this.emit("groupchange", { expanded });
        this.chartInstance = chart;
        this.schemeQuery?.addEventListener("change", this.onSchemeChange);
        const data = this.dataValue ?? this.dataAttribute();
        if (data)
            chart.setData(data);
        const selected = this.selectedValue ?? this.numberAttribute("selected-index");
        if (selected !== null)
            chart.setSelectedIndex(selected);
    }
    disconnectedCallback() {
        this.schemeQuery?.removeEventListener("change", this.onSchemeChange);
        this.chartInstance?.destroy();
        this.chartInstance = null;
    }
    attributeChangedCallback(name, _old, value) {
        const chart = this.chartInstance;
        if (!chart)
            return; // Read from the attributes when it connects
        switch (name) {
            case "data":
                if (this.dataValue === null) {
                    const data = this.dataAttribute();
                    if (data)
                        chart.setData(data);
                    else
                        chart.clearData();
                }
                break;
            case "selected-index":
                if (this.selectedValue === null && value !== null)
                    chart.setSelectedIndex(Number(value));
                break;
            case "center":
                if (this.centerValue === undefined)
                    chart.model.setCenterRenderer(this.wantedCenter());
                break;
            case "label":
                chart.setAccessibleText({ label: value ?? this.textValue.label ?? "Pie chart" });
                break;
            case "other-label":
                chart.setOtherLabel(value ?? "Other");
                break;
            case "padding":
                chart.setPadding(Number(value ?? 16));
                break;
            case "reduced-motion":
                chart.setReducedMotion(this.motionAttribute());
                break;
            default:
                chart.setStyle(this.effectiveStyle());
        }
    }
    // ------------------------------------------------------------------ What a script can do
    /** The chart inside, or null while the element is not on a page. */
    get chart() {
        return this.chartInstance;
    }
    /** The slices. Setting it replaces the `data` attribute; ids and colors that are left out are made up. */
    get data() {
        return this.dataValue ?? this.dataAttribute() ?? [];
    }
    set data(data) {
        this.dataValue = data;
        if (data === null)
            this.chartInstance?.clearData();
        else
            this.chartInstance?.setData(data);
    }
    /** Style settings that have no attribute, or that need a value the attributes can not carry. They win over the attributes. */
    get chartStyle() {
        return this.styleValue;
    }
    set chartStyle(style) {
        this.styleValue = style;
        this.chartInstance?.setStyle(this.effectiveStyle());
    }
    get selectedIndex() {
        return this.chartInstance?.model.selectedIndex ?? this.selectedValue ?? -1;
    }
    set selectedIndex(index) {
        this.selectedValue = index;
        this.chartInstance?.setSelectedIndex(index);
    }
    get selection() {
        return this.chartInstance?.selection ?? null;
    }
    /** Draws something else in the hole, or nothing (null); undefined goes back to the `center` attribute. */
    get centerRenderer() {
        return this.centerValue;
    }
    set centerRenderer(renderer) {
        this.centerValue = renderer;
        this.chartInstance?.model.setCenterRenderer(this.wantedCenter());
    }
    /** What screen readers are told, apart from the `label` attribute. */
    get accessibility() {
        return this.textValue;
    }
    set accessibility(text) {
        this.textValue = text;
        this.chartInstance?.setAccessibleText(this.accessibleText());
    }
    expandGroup() {
        this.chartInstance?.expandGroup();
    }
    collapseGroup() {
        this.chartInstance?.collapseGroup();
    }
    focus(options) {
        if (this.chartInstance)
            this.chartInstance.focus(options);
        else
            super.focus(options);
    }
    /** Reads the colors and the font from the page again, for when its theme changes in a way that can not be heard. */
    refreshTheme() {
        if (this.chartInstance && this.centerValue === undefined && this.hasAttribute("center")) {
            this.chartInstance.model.setCenterRenderer(this.wantedCenter());
        }
    }
    // ------------------------------------------------------------------ From attributes and the page
    onSchemeChange = () => this.refreshTheme();
    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }
    numberAttribute(name) {
        const text = this.getAttribute(name);
        if (text === null || text.trim() === "")
            return null;
        const value = Number(text);
        return Number.isFinite(value) ? value : null;
    }
    dataAttribute() {
        const text = this.getAttribute("data");
        if (text === null || text.trim() === "")
            return null;
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed))
                return parsed;
            console.error("<pie-chart>: the data attribute has to be a JSON array");
        }
        catch (error) {
            console.error("<pie-chart>: the data attribute is not valid JSON", error);
        }
        return null;
    }
    motionAttribute() {
        const text = this.getAttribute("reduced-motion");
        return text === "always" || text === "never" ? text : "auto";
    }
    /** The style from the attributes, over which the `chartStyle` property is laid. A unit given there replaces the attribute's. */
    effectiveStyle() {
        const fromAttributes = {};
        for (const [attribute, key] of Object.entries(NUMBER_ATTRIBUTES)) {
            const value = this.numberAttribute(attribute);
            if (value !== null)
                fromAttributes[key] = value;
        }
        if (this.hasAttribute("group-small-slices"))
            fromAttributes.groupSmallSlices = this.getAttribute("group-small-slices") !== "false";
        const own = this.styleValue;
        for (const pair of UNIT_PAIRS) {
            if (pair.some((key) => own[key] !== undefined))
                for (const key of pair)
                    delete fromAttributes[key];
        }
        return { ...fromAttributes, ...own };
    }
    accessibleText() {
        const label = this.getAttribute("label");
        return label === null ? this.textValue : { ...this.textValue, label };
    }
    wantedCenter() {
        if (this.centerValue !== undefined)
            return this.centerValue;
        return this.hasAttribute("center") && this.getAttribute("center") !== "false" ? this.defaultCenter() : null;
    }
    /**
     * The details in the hole, in the page's own text color and font (see `centerStyleFromPage`). Set
     * `--pie-chart-label-color`, `--pie-chart-value-color` and `--pie-chart-font-family` to change them.
     */
    defaultCenter() {
        return createDefaultCenter(centerStyleFromPage(this));
    }
}
