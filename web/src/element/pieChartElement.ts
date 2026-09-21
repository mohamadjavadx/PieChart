import type { SelectedSlice } from "../chart/model.ts";
import { PieChart } from "../chart/pieChart.ts";
import type { LooseSliceInput } from "../chart/input.ts";
import type { StyleInput } from "../chart/style.ts";
import { centerStyleFromPage, createDefaultCenter } from "../center/index.ts";
import type { CenterRenderer } from "../center/renderer.ts";
import type { AccessibleText } from "../a11y/items.ts";

// The chart as an HTML element that works in any page or framework:
//
//   <pie-chart center group-small-slices label="Spending by category"
//              data='[{"label":"Rent","value":1200},{"label":"Food","value":450.5}]'></pie-chart>
//
// Everything a script can do to a PieChart it can do to the element, and the page hears about selection with events.
// It draws in a shadow root, so a page's styles can not reach into the chart, and the chart's can not leak out.

/** Importing this in a page that runs on a server (where there is no HTMLElement) is safe; the class is just never used. */
const Base: typeof HTMLElement = typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

const STYLE_TEXT = `
:host { display: block; width: 100%; aspect-ratio: 1 / 1; }
:host([hidden]) { display: none; }
#chart { width: 100%; height: 100%; }
`;

/** Attributes that are numbers in the chart's style, and the style they set. */
const NUMBER_ATTRIBUTES: Readonly<Record<string, keyof StyleInput>> = {
  "hole-ratio": "holeRadiusRatio",
  "corner-radius-dp": "cornerRadiusDp",
  "gap-dp": "visualGapDp",
  "shadow-offset-dp": "selectedShadowOffsetDp",
  "unselected-dim": "unselectedDim",
};

/** Style settings that measure the same thing in two units, of which only one may be given. */
const UNIT_PAIRS: readonly (readonly (keyof StyleInput)[])[] = [
  ["cornerRadiusRatio", "cornerRadiusDp"],
  ["visualGapDeg", "visualGapDp"],
  ["selectedShadowOffsetRatio", "selectedShadowOffsetDp"],
];

const BOOLEAN_ATTRIBUTES = ["group-small-slices"] as const;

export class PieChartElement extends Base {
  static readonly observedAttributes: readonly string[] = [
    "data", "selected-index", "center", "label", "other-label", "padding", "reduced-motion",
    ...Object.keys(NUMBER_ATTRIBUTES), ...BOOLEAN_ATTRIBUTES,
  ];

  private readonly container: HTMLDivElement;
  private chartInstance: PieChart | null = null;
  private dataValue: readonly LooseSliceInput[] | null = null;
  private styleValue: StyleInput = {};
  private selectedValue: number | null = null;
  private centerValue: CenterRenderer | null | undefined = undefined; // undefined: the attribute decides
  private textValue: Partial<AccessibleText> = {};
  private readonly schemeQuery: MediaQueryList | null;

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

  connectedCallback(): void {
    if (this.chartInstance) return;
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
    if (data) chart.setData(data);
    const selected = this.selectedValue ?? this.numberAttribute("selected-index");
    if (selected !== null) chart.setSelectedIndex(selected);
  }

  disconnectedCallback(): void {
    this.schemeQuery?.removeEventListener("change", this.onSchemeChange);
    this.chartInstance?.destroy();
    this.chartInstance = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    const chart = this.chartInstance;
    if (!chart) return; // Read from the attributes when it connects
    switch (name) {
      case "data":
        if (this.dataValue === null) {
          const data = this.dataAttribute();
          if (data) chart.setData(data);
          else chart.clearData();
        }
        break;
      case "selected-index":
        if (this.selectedValue === null && value !== null) chart.setSelectedIndex(Number(value));
        break;
      case "center":
        if (this.centerValue === undefined) chart.model.setCenterRenderer(this.wantedCenter());
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
  get chart(): PieChart | null {
    return this.chartInstance;
  }

  /** The slices. Setting it replaces the `data` attribute; ids and colors that are left out are made up. */
  get data(): readonly LooseSliceInput[] {
    return this.dataValue ?? this.dataAttribute() ?? [];
  }

  set data(data: readonly LooseSliceInput[] | null) {
    this.dataValue = data;
    if (data === null) this.chartInstance?.clearData();
    else this.chartInstance?.setData(data);
  }

  /** Style settings that have no attribute, or that need a value the attributes can not carry. They win over the attributes. */
  get chartStyle(): StyleInput {
    return this.styleValue;
  }

  set chartStyle(style: StyleInput) {
    this.styleValue = style;
    this.chartInstance?.setStyle(this.effectiveStyle());
  }

  get selectedIndex(): number {
    return this.chartInstance?.model.selectedIndex ?? this.selectedValue ?? -1;
  }

  set selectedIndex(index: number) {
    this.selectedValue = index;
    this.chartInstance?.setSelectedIndex(index);
  }

  get selection(): SelectedSlice | null {
    return this.chartInstance?.selection ?? null;
  }

  /** Draws something else in the hole, or nothing (null); undefined goes back to the `center` attribute. */
  get centerRenderer(): CenterRenderer | null | undefined {
    return this.centerValue;
  }

  set centerRenderer(renderer: CenterRenderer | null | undefined) {
    this.centerValue = renderer;
    this.chartInstance?.model.setCenterRenderer(this.wantedCenter());
  }

  /** What screen readers are told, apart from the `label` attribute. */
  get accessibility(): Partial<AccessibleText> {
    return this.textValue;
  }

  set accessibility(text: Partial<AccessibleText>) {
    this.textValue = text;
    this.chartInstance?.setAccessibleText(this.accessibleText());
  }

  expandGroup(): void {
    this.chartInstance?.expandGroup();
  }

  collapseGroup(): void {
    this.chartInstance?.collapseGroup();
  }

  override focus(options?: FocusOptions): void {
    if (this.chartInstance) this.chartInstance.focus(options);
    else super.focus(options);
  }

  /** Reads the colors and the font from the page again, for when its theme changes in a way that can not be heard. */
  refreshTheme(): void {
    if (this.chartInstance && this.centerValue === undefined && this.hasAttribute("center")) {
      this.chartInstance.model.setCenterRenderer(this.wantedCenter());
    }
  }

  // ------------------------------------------------------------------ From attributes and the page

  private readonly onSchemeChange = (): void => this.refreshTheme();

  private emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private numberAttribute(name: string): number | null {
    const text = this.getAttribute(name);
    if (text === null || text.trim() === "") return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }

  private dataAttribute(): LooseSliceInput[] | null {
    const text = this.getAttribute("data");
    if (text === null || text.trim() === "") return null;
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed as LooseSliceInput[];
      console.error("<pie-chart>: the data attribute has to be a JSON array");
    } catch (error) {
      console.error("<pie-chart>: the data attribute is not valid JSON", error);
    }
    return null;
  }

  private motionAttribute(): "auto" | "always" | "never" {
    const text = this.getAttribute("reduced-motion");
    return text === "always" || text === "never" ? text : "auto";
  }

  /** The style from the attributes, over which the `chartStyle` property is laid. A unit given there replaces the attribute's. */
  private effectiveStyle(): StyleInput {
    const fromAttributes: Record<string, unknown> = {};
    for (const [attribute, key] of Object.entries(NUMBER_ATTRIBUTES)) {
      const value = this.numberAttribute(attribute);
      if (value !== null) fromAttributes[key] = value;
    }
    if (this.hasAttribute("group-small-slices")) fromAttributes.groupSmallSlices = this.getAttribute("group-small-slices") !== "false";
    const own = this.styleValue as Record<string, unknown>;
    for (const pair of UNIT_PAIRS) {
      if (pair.some((key) => own[key] !== undefined)) for (const key of pair) delete fromAttributes[key];
    }
    return { ...fromAttributes, ...own } as StyleInput;
  }

  private accessibleText(): Partial<AccessibleText> {
    const label = this.getAttribute("label");
    return label === null ? this.textValue : { ...this.textValue, label };
  }

  private wantedCenter(): CenterRenderer | null {
    if (this.centerValue !== undefined) return this.centerValue;
    return this.hasAttribute("center") && this.getAttribute("center") !== "false" ? this.defaultCenter() : null;
  }

  /**
   * The details in the hole, in the page's own text color and font (see `centerStyleFromPage`). Set
   * `--pie-chart-label-color`, `--pie-chart-value-color` and `--pie-chart-font-family` to change them.
   */
  private defaultCenter(): CenterRenderer {
    return createDefaultCenter(centerStyleFromPage(this));
  }
}
