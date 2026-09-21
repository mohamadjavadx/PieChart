import { ChartModel, type ChartModelOptions, type Padding, type SelectedSlice } from "./model.ts";
import { AccessibilityLayer } from "../a11y/layer.ts";
import type { AccessibleText } from "../a11y/items.ts";
import { DEFAULT_ANIMATION, type AnimationConfig } from "./style.ts";
import type { CenterRenderer, CenterVisibility } from "../center/renderer.ts";
import type { StyleInput } from "./style.ts";
import { patchChildren } from "../svg/dom.ts";
import { sceneToNodes } from "../svg/nodes.ts";
import type { Slice } from "../core/types.ts";
import { normalizeData, type LooseSliceInput } from "./input.ts";

export interface PieChartOptions extends ChartModelOptions {
  /** The space around the ring, in px. */
  padding?: Padding | number;
  /** Draws the selected slice's details in the hole; see `createDefaultCenter`. Nothing is drawn by default. */
  center?: CenterRenderer | null;
  /** When the center is shown; by default only while it fits. */
  centerVisibility?: CenterVisibility;
  /** What screen readers are told: the chart's name and the wording of its slices. Any part can be given. */
  accessibility?: Partial<AccessibleText>;
  /**
   * Whether the animations are skipped for people who ask their system for less motion (`prefers-reduced-motion`).
   * "auto" (the default) follows the system, "always" never animates, "never" always does.
   */
  reducedMotion?: "auto" | "always" | "never";
}

/** How far a pointer may move between going down and up for it to still be a tap, in px. */
const TAP_SLOP = 8;

let nextId = 1;

/**
 * A chart on a page: an SVG in [container] that follows the container's size, draws the animated chart,
 * and turns taps into selections. All of the chart's behavior is in [ChartModel]; this is the part that
 * needs a browser.
 *
 * Give it data once it is on the page: the entry animation plays when the first data arrives, and a chart
 * that has no size yet has nothing to grow into, so data given before the first measurement waits for it.
 */
export class PieChart {
  readonly model: ChartModel;
  /** The drawing. */
  readonly element: SVGSVGElement;

  private readonly container: HTMLElement;
  private readonly a11y: AccessibilityLayer;
  private motion: "auto" | "always" | "never";
  private readonly reduceQuery: MediaQueryList | null;
  private animation: Partial<AnimationConfig> = {};
  private padding: Padding | number;
  private width = 0;
  private height = 0;
  private readonly idPrefix = `pie${nextId++}`;
  private readonly resizeObserver: ResizeObserver;
  private frameRequest = 0;
  private measured = false;
  private pendingData: readonly LooseSliceInput[] | null = null;
  private pendingSelection: number | null = null;
  private down: { id: number; x: number; y: number } | null = null;

  constructor(container: HTMLElement, options: PieChartOptions = {}) {
    this.container = container;
    this.padding = options.padding ?? 0;
    this.model = new ChartModel(options);
    this.animation = { ...options.animation };
    this.model.onInvalidate = () => this.requestFrame();
    if (options.centerVisibility) this.model.setCenterVisibility(options.centerVisibility);
    if (options.center) this.model.setCenterRenderer(options.center);

    this.element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.element.style.display = "block";
    this.element.style.width = "100%";
    this.element.style.height = "100%";
    // A scroll or a pinch that starts on the chart is the page's; taps and clicks are ours.
    this.element.style.touchAction = "manipulation";
    this.element.style.userSelect = "none";
    // The drawing is for the eyes; screen readers and the keyboard get the listbox that it sits in.
    this.element.setAttribute("aria-hidden", "true");
    this.a11y = new AccessibilityLayer(this.model, this.idPrefix, options.accessibility);
    this.a11y.widget.appendChild(this.element);
    container.appendChild(this.a11y.root);

    this.motion = options.reducedMotion ?? "auto";
    this.reduceQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.reduceQuery?.addEventListener("change", this.onMotionChange);
    this.applyMotion();
    // The text in the hole is measured in its font: once a font has loaded, it has to be measured again.
    if (typeof document !== "undefined" && document.fonts) document.fonts.addEventListener("loadingdone", this.onFontsLoaded);

    this.element.addEventListener("pointerdown", (e) => {
      this.down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    this.element.addEventListener("pointerup", (e) => this.onPointerUp(e));
    this.element.addEventListener("pointercancel", () => (this.down = null));
    this.element.addEventListener("pointermove", (e) => this.onPointerMove(e));

    this.resizeObserver = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]!.contentRect;
      this.measure(box.width, box.height);
    });
    this.resizeObserver.observe(container);
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) this.measure(rect.width, rect.height);
  }

  // ------------------------------------------------------------------ The chart's own API, as the model has it

  /** The slices; an id and a color that are left out are made up (see [normalizeData]). */
  setData(data: readonly LooseSliceInput[]): void {
    if (this.measured) this.model.setData(normalizeData(data));
    else this.pendingData = data;
  }

  clearData(): void {
    this.pendingData = null;
    this.pendingSelection = null;
    this.model.clearData();
  }

  setStyle(style: StyleInput): void {
    this.model.setStyle(style);
  }

  /** Changes the words that screen readers are told; the parts that are not given stay as they are. */
  setAccessibleText(text: Partial<AccessibleText>): void {
    this.a11y.setText(text);
  }

  /** Changes how the animations run; the parts that are not given stay as they are. */
  setAnimation(config: Partial<AnimationConfig>): void {
    this.animation = { ...this.animation, ...config };
    this.applyMotion();
  }

  /** Changes the space around the ring, in px. */
  setPadding(padding: Padding | number): void {
    this.padding = padding;
    if (this.measured) this.measure(this.width, this.height);
  }

  /** Whether the animations are skipped for people who ask for less motion; see the `reducedMotion` option. */
  setReducedMotion(motion: "auto" | "always" | "never"): void {
    this.motion = motion;
    this.applyMotion();
  }

  /** Renames the slice that stands for the small slices, which is "Other" by default. */
  setOtherLabel(label: string): void {
    this.model.setOtherLabel(label);
    this.requestFrame();
  }

  /** Puts keyboard focus on the chart, where the arrow keys select slices. */
  focus(options?: FocusOptions): void {
    this.a11y.widget.focus(options);
  }

  expandGroup(): void {
    this.model.expandGroup();
  }

  collapseGroup(): void {
    this.model.collapseGroup();
  }

  setSelectedIndex(index: number): void {
    // Data that waits for the first measurement has nothing to select yet: the selection waits with it.
    if (this.pendingData) this.pendingSelection = index;
    else this.model.setSelectedIndex(index);
  }

  get selection(): SelectedSlice | null {
    return this.model.selection;
  }

  get slices(): readonly Slice[] {
    return this.model.slices;
  }

  /** Stops drawing, and takes the chart off the page. */
  destroy(): void {
    cancelAnimationFrame(this.frameRequest);
    this.resizeObserver.disconnect();
    this.reduceQuery?.removeEventListener("change", this.onMotionChange);
    if (typeof document !== "undefined" && document.fonts) document.fonts.removeEventListener("loadingdone", this.onFontsLoaded);
    this.model.onInvalidate = null;
    this.a11y.destroy();
  }

  private readonly onMotionChange = (): void => this.applyMotion();
  private readonly onFontsLoaded = (): void => this.model.relayoutCenter();

  /** Animations run as configured, but not for people who asked for less motion. */
  private applyMotion(): void {
    const reduce = this.motion === "always" || (this.motion === "auto" && (this.reduceQuery?.matches ?? false));
    this.model.setAnimationConfig(reduce ? { ...this.animation, revealDuration: 0, dataChangeDuration: 0 } : { ...DEFAULT_ANIMATION, ...this.animation });
  }

  // ------------------------------------------------------------------ Size, frames and pointers

  private measure(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.model.setSize(width, height, this.padding);
    if (!this.measured) {
      this.measured = true;
      if (this.pendingData) {
        const data = this.pendingData;
        this.pendingData = null;
        this.model.setData(normalizeData(data));
        if (this.pendingSelection !== null) this.model.setSelectedIndex(this.pendingSelection);
        this.pendingSelection = null;
      }
    }
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.frameRequest !== 0) return;
    this.frameRequest = requestAnimationFrame((now) => {
      this.frameRequest = 0;
      const running = this.model.advance(now);
      this.render();
      if (running) this.requestFrame();
    });
  }

  private render(): void {
    const scene = this.model.scene();
    const svg = sceneToNodes(scene, { idPrefix: this.idPrefix });
    this.element.setAttribute("viewBox", String(svg.attrs.viewBox));
    patchChildren(this.element, svg.children ?? []);
    this.a11y.sync();
  }

  private pointOf(e: PointerEvent): { x: number; y: number } {
    const rect = this.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerUp(e: PointerEvent): void {
    const down = this.down;
    this.down = null;
    if (!down || down.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) return;
    const { x, y } = this.pointOf(e);
    if (this.model.tap(x, y)) {
      this.requestFrame();
      e.preventDefault();
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const { x, y } = this.pointOf(e);
    this.element.style.cursor = !this.model.isAnimating && this.model.sliceIndexAt(x, y) >= 0 ? "pointer" : "";
  }
}
