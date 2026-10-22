"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  MarkAreaComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  MarkAreaComponent,
  SVGRenderer,
]);
export function Chart({
  option,
  label,
  height = 300,
}: {
  option: EChartsCoreOption;
  label: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "svg" });
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    chart.setOption({
      animation: !reduced,
      animationDuration: 250,
      textStyle: { fontFamily: "inherit", color: "#A7B5C6" },
      aria: { enabled: true },
      ...option,
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);
  return (
    <div role="img" aria-label={label}>
      <div ref={ref} className="chart" style={{ height }} aria-hidden="true" />
    </div>
  );
}
export const chartAxis = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: "#A7B5C6", fontSize: 11 },
  splitLine: { lineStyle: { color: "#253247", type: "dashed" } },
};
export const chartTooltip = {
  trigger: "axis",
  backgroundColor: "#172535",
  borderColor: "#435269",
  textStyle: { color: "#F1F5F9", fontSize: 12 },
  confine: true,
};
