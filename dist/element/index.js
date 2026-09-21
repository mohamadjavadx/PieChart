import { PieChartElement } from "./pieChartElement.js";
export { PieChartElement } from "./pieChartElement.js";
/**
 * Registers the element under [tag] (`pie-chart` by default), unless the tag is taken already. Does nothing where there
 * are no custom elements, such as on a server. To register it as a side effect of importing, import
 * `@mohamadjavadx/piechart/element/register` instead.
 */
export function definePieChart(tag = "pie-chart") {
    if (typeof customElements === "undefined" || customElements.get(tag))
        return;
    customElements.define(tag, PieChartElement);
}
