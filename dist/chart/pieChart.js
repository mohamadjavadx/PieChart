import { ChartModel } from "./model.js";
import { AccessibilityLayer } from "../a11y/layer.js";
import { DEFAULT_ANIMATION } from "./style.js";
import { patchChildren } from "../svg/dom.js";
import { sceneToNodes } from "../svg/nodes.js";
import { normalizeData } from "./input.js";
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
    model;
    /** The drawing. */
    element;
    container;
    a11y;
    motion;
    reduceQuery;
    animation = {};
    padding;
    width = 0;
    height = 0;
    idPrefix = `pie${nextId++}`;
    resizeObserver;
    frameRequest = 0;
    measured = false;
    pendingData = null;
    pendingSelection = null;
    down = null;
    constructor(container, options = {}) {
        this.container = container;
        this.padding = options.padding ?? 0;
        this.model = new ChartModel(options);
        this.animation = { ...options.animation };
        this.model.onInvalidate = () => this.requestFrame();
        if (options.centerVisibility)
            this.model.setCenterVisibility(options.centerVisibility);
        if (options.center)
            this.model.setCenterRenderer(options.center);
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
        if (typeof document !== "undefined" && document.fonts)
            document.fonts.addEventListener("loadingdone", this.onFontsLoaded);
        this.element.addEventListener("pointerdown", (e) => {
            this.down = { id: e.pointerId, x: e.clientX, y: e.clientY };
        });
        this.element.addEventListener("pointerup", (e) => this.onPointerUp(e));
        this.element.addEventListener("pointercancel", () => (this.down = null));
        this.element.addEventListener("pointermove", (e) => this.onPointerMove(e));
        this.resizeObserver = new ResizeObserver((entries) => {
            const box = entries[entries.length - 1].contentRect;
            this.measure(box.width, box.height);
        });
        this.resizeObserver.observe(container);
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0)
            this.measure(rect.width, rect.height);
    }
    // ------------------------------------------------------------------ The chart's own API, as the model has it
    /** The slices; an id and a color that are left out are made up (see [normalizeData]). */
    setData(data) {
        if (this.measured)
            this.model.setData(normalizeData(data));
        else
            this.pendingData = data;
    }
    clearData() {
        this.pendingData = null;
        this.pendingSelection = null;
        this.model.clearData();
    }
    setStyle(style) {
        this.model.setStyle(style);
    }
    /** Changes the words that screen readers are told; the parts that are not given stay as they are. */
    setAccessibleText(text) {
        this.a11y.setText(text);
    }
    /** Changes how the animations run; the parts that are not given stay as they are. */
    setAnimation(config) {
        this.animation = { ...this.animation, ...config };
        this.applyMotion();
    }
    /** Changes the space around the ring, in px. */
    setPadding(padding) {
        this.padding = padding;
        if (this.measured)
            this.measure(this.width, this.height);
    }
    /** Whether the animations are skipped for people who ask for less motion; see the `reducedMotion` option. */
    setReducedMotion(motion) {
        this.motion = motion;
        this.applyMotion();
    }
    /** Renames the slice that stands for the small slices, which is "Other" by default. */
    setOtherLabel(label) {
        this.model.setOtherLabel(label);
        this.requestFrame();
    }
    /** Puts keyboard focus on the chart, where the arrow keys select slices. */
    focus(options) {
        this.a11y.widget.focus(options);
    }
    expandGroup() {
        this.model.expandGroup();
    }
    collapseGroup() {
        this.model.collapseGroup();
    }
    setSelectedIndex(index) {
        // Data that waits for the first measurement has nothing to select yet: the selection waits with it.
        if (this.pendingData)
            this.pendingSelection = index;
        else
            this.model.setSelectedIndex(index);
    }
    get selection() {
        return this.model.selection;
    }
    get slices() {
        return this.model.slices;
    }
    /** Stops drawing, and takes the chart off the page. */
    destroy() {
        cancelAnimationFrame(this.frameRequest);
        this.resizeObserver.disconnect();
        this.reduceQuery?.removeEventListener("change", this.onMotionChange);
        if (typeof document !== "undefined" && document.fonts)
            document.fonts.removeEventListener("loadingdone", this.onFontsLoaded);
        this.model.onInvalidate = null;
        this.a11y.destroy();
    }
    onMotionChange = () => this.applyMotion();
    onFontsLoaded = () => this.model.relayoutCenter();
    /** Animations run as configured, but not for people who asked for less motion. */
    applyMotion() {
        const reduce = this.motion === "always" || (this.motion === "auto" && (this.reduceQuery?.matches ?? false));
        this.model.setAnimationConfig(reduce ? { ...this.animation, revealDuration: 0, dataChangeDuration: 0 } : { ...DEFAULT_ANIMATION, ...this.animation });
    }
    // ------------------------------------------------------------------ Size, frames and pointers
    measure(width, height) {
        if (width <= 0 || height <= 0)
            return;
        this.width = width;
        this.height = height;
        this.model.setSize(width, height, this.padding);
        if (!this.measured) {
            this.measured = true;
            if (this.pendingData) {
                const data = this.pendingData;
                this.pendingData = null;
                this.model.setData(normalizeData(data));
                if (this.pendingSelection !== null)
                    this.model.setSelectedIndex(this.pendingSelection);
                this.pendingSelection = null;
            }
        }
        this.requestFrame();
    }
    requestFrame() {
        if (this.frameRequest !== 0)
            return;
        this.frameRequest = requestAnimationFrame((now) => {
            this.frameRequest = 0;
            const running = this.model.advance(now);
            this.render();
            if (running)
                this.requestFrame();
        });
    }
    render() {
        const scene = this.model.scene();
        const svg = sceneToNodes(scene, { idPrefix: this.idPrefix });
        this.element.setAttribute("viewBox", String(svg.attrs.viewBox));
        patchChildren(this.element, svg.children ?? []);
        this.a11y.sync();
    }
    pointOf(e) {
        const rect = this.element.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    onPointerUp(e) {
        const down = this.down;
        this.down = null;
        if (!down || down.id !== e.pointerId)
            return;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP)
            return;
        const { x, y } = this.pointOf(e);
        if (this.model.tap(x, y)) {
            this.requestFrame();
            e.preventDefault();
        }
    }
    onPointerMove(e) {
        const { x, y } = this.pointOf(e);
        this.element.style.cursor = !this.model.isAnimating && this.model.sliceIndexAt(x, y) >= 0 ? "pointer" : "";
    }
}
