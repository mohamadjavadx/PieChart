import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { centerStyleFromPage, createDefaultCenter } from "../center/index.js";
import { sameData } from "../chart/input.js";
import { PieChart as PieChartInstance } from "../chart/pieChart.js";
const BOX = { width: "100%", aspectRatio: "1 / 1" };
export const PieChart = forwardRef(function PieChart(props, ref) {
    const host = useRef(null);
    const chartRef = useRef(null);
    const applied = useRef({ data: null });
    const latest = useRef(props);
    latest.current = props;
    useImperativeHandle(ref, () => ({
        get chart() { return chartRef.current; },
        expandGroup: () => chartRef.current?.expandGroup(),
        collapseGroup: () => chartRef.current?.collapseGroup(),
        focus: (options) => chartRef.current?.focus(options),
    }), []);
    // The chart itself: made when the box is there, and taken down with it.
    useEffect(() => {
        const element = host.current;
        if (!element)
            return;
        const p = latest.current;
        const chart = new PieChartInstance(element, {
            padding: p.padding ?? 16,
            style: p.chartStyle,
            animation: p.animation,
            reducedMotion: p.reducedMotion,
            otherLabel: p.otherLabel,
            accessibility: { ...p.accessibleText, ...(p.label === undefined ? {} : { label: p.label }) },
        });
        chart.model.onSelectionChanged = (slice) => latest.current.onSelectionChange?.(slice);
        chart.model.onSliceClick = (slice) => latest.current.onSliceClick?.(slice);
        chart.model.onGroupExpandedChanged = (expanded) => latest.current.onGroupExpandedChange?.(expanded);
        chartRef.current = chart;
        applied.current = { data: null };
        return () => {
            chart.destroy();
            chartRef.current = null;
        };
    }, []);
    // The effects below run after the one above, in this order: the chart exists, then it gets its data, then its selection.
    const { data, chartStyle, selectedIndex, padding, label, accessibleText, otherLabel, animation, reducedMotion } = props;
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart)
            return;
        const previous = applied.current.data;
        if (previous && sameData(previous, data))
            return;
        applied.current.data = data;
        chart.setData(data);
        // New data keeps the selection when its slice is still there; a selection that is asked for comes with the data
        if (latest.current.selectedIndex !== undefined)
            chart.setSelectedIndex(latest.current.selectedIndex);
    }, [data]);
    const styleKey = JSON.stringify(chartStyle ?? {});
    useEffect(() => {
        if (chartStyle)
            chartRef.current?.setStyle(chartStyle);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- by value, so that an object made on every render is not a change
    }, [styleKey]);
    useEffect(() => {
        if (selectedIndex !== undefined)
            chartRef.current?.setSelectedIndex(selectedIndex);
    }, [selectedIndex]);
    const paddingKey = JSON.stringify(padding ?? 16);
    useEffect(() => {
        chartRef.current?.setPadding(padding ?? 16);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paddingKey]);
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart)
            return;
        chart.setAccessibleText({ ...accessibleText, ...(label === undefined ? {} : { label }) });
        if (otherLabel !== undefined)
            chart.setOtherLabel(otherLabel);
        // The words can be functions, which are compared as they are: made new on every render, they are set on every render
    }, [label, otherLabel, accessibleText]);
    useEffect(() => {
        chartRef.current?.setReducedMotion(reducedMotion ?? "auto");
    }, [reducedMotion]);
    const animationKey = JSON.stringify(animation ?? {});
    useEffect(() => {
        if (animation)
            chartRef.current?.setAnimation(animation);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [animationKey]);
    // The hole: a renderer that is given, or the default one in the page's own colors, which are read again when the
    // system switches between light and dark.
    const center = props.center;
    const centerStyleKey = JSON.stringify(props.centerStyle ?? {});
    useEffect(() => {
        const chart = chartRef.current;
        const element = host.current;
        if (!chart || !element)
            return;
        if (center === undefined || center === null || center === false) {
            chart.model.setCenterRenderer(null);
            return;
        }
        if (typeof center === "object") {
            chart.model.setCenterRenderer(center);
            return;
        }
        const apply = () => chart.model.setCenterRenderer(createDefaultCenter({ ...centerStyleFromPage(element), ...latest.current.centerStyle }));
        apply();
        const query = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
        query?.addEventListener("change", apply);
        return () => query?.removeEventListener("change", apply);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [center, centerStyleKey]);
    return createElement("div", { ref: host, id: props.id, className: props.className, style: { ...BOX, ...props.style } });
});
