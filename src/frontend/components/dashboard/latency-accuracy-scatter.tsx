"use client";

import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { MODEL_LABELS, type ModelBenchmarkResult } from "@/lib/types";

const chartConfig = {
  foundation: { label: "Foundation models", color: "var(--chart-1)" },
  baseline: { label: "Baselines", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function LatencyAccuracyScatter({ results }: { results: ModelBenchmarkResult[] }) {
  const foundation = results
    .filter((r) => r.modelType === "foundation")
    .map((r) => ({ name: MODEL_LABELS[r.modelName], latency: r.inferenceLatencyMs, mae: r.mae }));
  const baseline = results
    .filter((r) => r.modelType === "baseline")
    .map((r) => ({ name: MODEL_LABELS[r.modelName], latency: r.inferenceLatencyMs, mae: r.mae }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <ScatterChart margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="latency"
          type="number"
          name="Latency"
          unit="ms"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          dataKey="mae"
          type="number"
          name="MAE"
          tickLine={false}
          axisLine={false}
          width={30}
          tick={{ fontSize: 11 }}
        />
        <ZAxis range={[80, 80]} />
        <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent nameKey="name" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Scatter name="foundation" data={foundation} fill="var(--color-foundation)" isAnimationActive={false} />
        <Scatter name="baseline" data={baseline} fill="var(--color-baseline)" isAnimationActive={false} />
      </ScatterChart>
    </ChartContainer>
  );
}
