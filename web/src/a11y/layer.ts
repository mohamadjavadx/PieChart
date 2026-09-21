import type { ChartModel } from "../chart/model.ts";
import {
  accessibleItems, actionForKey, DEFAULT_ACCESSIBLE_TEXT, initialActive, type AccessibleItem, type AccessibleText,
} from "./items.ts";

const HIDDEN: Partial<CSSStyleDeclaration> = {
  position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: "0", border: "0",
  overflow: "hidden", clip: "rect(0 0 0 0)", clipPath: "inset(50%)", whiteSpace: "nowrap",
};

/**
 * The chart for screen readers and the keyboard. The drawing is hidden from them; in its place there is a listbox,
 * whose options are the slices in the order of the ring, and that has focus and answers the arrow keys, Home, End,
 * Enter, Space and Escape. Nothing about it is visible, but the focus ring: it is the same state as the drawing,
 * so what a screen reader user selects is what a sighted one sees selected, and the other way round.
 *
 * `root` goes in the page; the drawing goes in `widget`.
 */
export class AccessibilityLayer {
  readonly root: HTMLElement;
  readonly widget: HTMLElement;

  private readonly model: ChartModel;
  private readonly idPrefix: string;
  private readonly status: HTMLElement;
  private text: AccessibleText;
  private items: AccessibleItem[] = [];
  private options: HTMLElement[] = [];
  private active = -1;
  private seenExpanded: boolean | null = null;
  // What the options were made from
  private seen: { displayed: unknown; band: number; selected: number; size: number; expanded: boolean } | null = null;

  constructor(model: ChartModel, idPrefix: string, text: Partial<AccessibleText> = {}) {
    this.model = model;
    this.idPrefix = idPrefix;
    this.text = { ...DEFAULT_ACCESSIBLE_TEXT, ...text };

    this.root = document.createElement("div");
    Object.assign(this.root.style, { position: "relative", width: "100%", height: "100%" });

    this.widget = document.createElement("div");
    this.widget.setAttribute("role", "listbox");
    this.widget.setAttribute("aria-label", this.text.label);
    this.widget.tabIndex = 0;
    Object.assign(this.widget.style, { display: "block", width: "100%", height: "100%", outlineOffset: "-2px" });
    this.widget.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.widget.addEventListener("click", (e) => this.onClick(e));
    this.widget.addEventListener("focus", () => this.showActive());

    this.status = document.createElement("div");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.status.setAttribute("aria-atomic", "true");
    Object.assign(this.status.style, HIDDEN);

    this.root.append(this.widget, this.status);
  }

  /** Changes what is said; the parts that are not given stay as they are. */
  setText(text: Partial<AccessibleText>): void {
    this.text = { ...this.text, ...text };
    this.widget.setAttribute("aria-label", this.text.label);
    this.seen = null; // The options are worded again
    this.sync();
  }

  focus(): void {
    this.widget.focus();
  }

  /** Makes the options say what the chart shows now. Cheap when nothing changed, so a frame can call it. */
  sync(): void {
    const model = this.model;
    const seen = this.seen;
    if (
      seen && seen.displayed === model.displayed && seen.band === model.band && seen.selected === model.selectedIndex &&
      seen.size === model.groupSize && seen.expanded === model.isGroupExpanded
    ) return;
    this.seen = {
      displayed: model.displayed, band: model.band, selected: model.selectedIndex, size: model.groupSize, expanded: model.isGroupExpanded,
    };

    const before = this.items[this.active];
    this.items = accessibleItems(model, this.text);
    this.renderOptions();
    // The option with focus follows the selection, unless it is on the group or the way back, which nothing selects.
    const kept = before && before.kind !== "slice" ? this.items.findIndex((item) => item.kind === before.kind && item.index === before.index) : -1;
    this.active = kept >= 0 ? kept : initialActive(this.items);
    this.showActive();

    if (this.seenExpanded !== null && this.seenExpanded !== model.isGroupExpanded) {
      this.status.textContent = model.isGroupExpanded ? this.text.groupOpened(model.groupSize) : this.text.groupClosed();
    }
    this.seenExpanded = model.isGroupExpanded;
  }

  destroy(): void {
    this.root.remove();
  }

  private renderOptions(): void {
    const { widget, items, options } = this;
    while (options.length < items.length) {
      const option = document.createElement("div");
      option.setAttribute("role", "option");
      option.id = `${this.idPrefix}-o${options.length}`;
      Object.assign(option.style, HIDDEN);
      options.push(option);
      widget.appendChild(option);
    }
    while (options.length > items.length) options.pop()!.remove();
    items.forEach((item, i) => {
      const option = options[i]!;
      if (option.textContent !== item.text) option.textContent = item.text;
      option.setAttribute("aria-selected", String(item.selected));
    });
  }

  private showActive(): void {
    const option = this.options[this.active];
    if (option) this.widget.setAttribute("aria-activedescendant", option.id);
    else this.widget.removeAttribute("aria-activedescendant");
  }

  private activateItem(item: AccessibleItem): void {
    if (item.kind === "group") this.model.expandGroup();
    else if (item.kind === "back") this.model.collapseGroup();
    else this.model.activate(item.index);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // Browser and system shortcuts are theirs
    const action = actionForKey(e.key, this.items, this.active, this.model.isGroupExpanded);
    if (!action) return;
    e.preventDefault();
    switch (action.type) {
      case "move": {
        this.active = action.to;
        const item = this.items[action.to]!;
        // Landing on a slice selects it; the group and the way back only get focus
        if (item.kind === "slice" && !item.selected) this.model.activate(item.index);
        this.showActive();
        break;
      }
      case "activate":
        this.activateItem(this.items[action.at]!);
        break;
      case "collapse":
        this.model.collapseGroup();
        break;
    }
    this.sync();
    this.showActive();
  }

  private onClick(e: MouseEvent): void {
    // A screen reader's "activate" on an option, or a click on one from an assistive pointer
    const option = (e.target as Element | null)?.closest?.('[role="option"]');
    const index = option ? this.options.indexOf(option as HTMLElement) : -1;
    const item = this.items[index];
    if (!item) return;
    this.active = index;
    this.activateItem(item);
    this.sync();
    this.showActive();
  }
}
