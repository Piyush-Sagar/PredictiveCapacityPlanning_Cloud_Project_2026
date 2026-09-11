"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { MODEL_LABELS, type ModelBenchmarkResult } from "@/lib/types";

const chartConfig = {
  mae: { label: "MAE", color: "var(--chart-1)" },
  rmse: { label: "RMSE", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function BenchmarkBarChart({ results }: { results: ModelBenchmarkResult[] }) {
  const data = results.map((result) => ({
    model: MODEL_LABELS[result.modelName],
    mae: result.mae,
    rmse: result.rmse,
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="model" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} width={30} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="mae" fill="var(--color-mae)" radius={4} isAnimationActive={false} />
        <Bar dataKey="rmse" fill="var(--color-rmse)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
