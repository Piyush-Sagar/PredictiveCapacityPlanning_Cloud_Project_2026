"use client";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ModelBenchmarkResult } from "@/lib/types";

const chartConfig = {
  foundation: { label: "Foundation models", color: "var(--chart-1)" },
  baseline: { label: "Baselines", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function ModelMixDonut({ results }: { results: ModelBenchmarkResult[] }) {
  const uniqueModels = new Map(results.map((r) => [r.modelName, r.modelType]));
  const foundationCount = Array.from(uniqueModels.values()).filter((t) => t === "foundation").length;
  const baselineCount = Array.from(uniqueModels.values()).filter((t) => t === "baseline").length;

  const data = [
    { name: "foundation", value: foundationCount },
    { name: "baseline", value: baselineCount },
  ];

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square h-56">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={85}
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={`var(--color-${entry.name})`} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  );
}
