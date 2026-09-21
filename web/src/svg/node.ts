export type SvgAttributes = Readonly<Record<string, string | number>>;

/** One SVG element as plain data. A `text` element has its [text]; the others have [children]. */
export interface SvgNode {
  readonly tag: "svg" | "defs" | "mask" | "g" | "path" | "text";
  readonly attrs: SvgAttributes;
  readonly children?: readonly SvgNode[];
  /** The text of a `text` element. */
  readonly text?: string;
}
