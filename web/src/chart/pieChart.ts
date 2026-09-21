import { ChartModel, type ChartModelOptions, type Padding, type SelectedSlice } from "./model.ts";
import type { CenterRenderer, CenterVisibility } from "../center/renderer.ts";
import type { StyleInput } from "./style.ts";
import { patchChildren } from "../svg/dom.ts";
import { sceneToNodes } from "../svg/nodes.ts";
import type { Slice, SliceInput } from "../core/types.ts";

export interface PieChartOptions extends ChartModelOptions {
  /** The space around the ring, in px. */
  padding?: Padding | number;
  /** Draws the selected slice's details in the hole; see `createDefaultCenter`. Nothing is drawn by default. */
  center?: CenterRenderer | null;
  /** When the center is shown; by default only while it fits. */
  centerVisibility?: CenterVisibility;
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
  readonly element: SVGSVGElement;

  private readonly container: HTMLElement;
  private readonly padding: Padding | number;
  private readonly idPrefix = `pie${nextId++}`;
  private readonly resizeObserver: ResizeObserver;
  private frameRequest = 0;
  private measured = false;
  private pendingData: readonly SliceInput[] | null = null;
  private pendingSelection: number | null = null;
  private down: { id: number; x: number; y: number } | null = null;

  constructor(container: HTMLElement, options: PieChartOptions = {}) {
    this.container = container;
    this.padding = options.padding ?? 0;
    this.model = new ChartModel(options);
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
    container.appendChild(this.element);

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

  setData(data: readonly SliceInput[]): void {
    if (this.measured) this.model.setData(data);
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
    this.model.onInvalidate = null;
    this.element.remove();
  }

  // ------------------------------------------------------------------ Size, frames and pointers

  private measure(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.model.setSize(width, height, this.padding);
    if (!this.measured) {
      this.measured = true;
      if (this.pendingData) {
        const data = this.pendingData;
        this.pendingData = null;
        this.model.setData(data);
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
