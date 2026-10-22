"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart } from "echarts/charts";
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
  PieChart,
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
      textStyle: { fontFamily: "inherit", color: "#596D8D" },
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
  axisLabel: { color: "#596D8D", fontSize: 11 },
  splitLine: { lineStyle: { color: "#E3E8EF", type: "dashed" } },
};
export const chartTooltip = {
  trigger: "axis",
  backgroundColor: "#FFFFFF",
  borderColor: "#DCE2EB",
  textStyle: { color: "#0D172F", fontSize: 12 },
  confine: true,
};
