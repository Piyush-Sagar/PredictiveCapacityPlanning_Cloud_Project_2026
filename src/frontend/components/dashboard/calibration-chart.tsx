"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { MODEL_LABELS, type ModelConfidenceSnapshot } from "@/lib/types";

const chartConfig = {
  actualCoveragePct: { label: "Actual P90 coverage", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function CalibrationChart({ snapshots }: { snapshots: ModelConfidenceSnapshot[] }) {
  const data = snapshots.map((snapshot) => ({
    model: MODEL_LABELS[snapshot.modelName],
    actualCoveragePct: snapshot.actualCoveragePct,
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="model" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          domain={[60, 100]}
          tick={{ fontSize: 11 }}
          tickFormatter={(value: number) => `${value}%`}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ReferenceLine
          y={90}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{ value: "90% target", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Bar dataKey="actualCoveragePct" fill="var(--color-actualCoveragePct)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
