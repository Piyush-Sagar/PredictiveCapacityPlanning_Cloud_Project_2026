"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { CapacityRecommendation } from "@/lib/types";
import { REGION_LABELS } from "@/lib/types";

const chartConfig = {
  currentUnits: { label: "Current units", color: "var(--chart-4)" },
  requiredUnits: { label: "Required units", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function CapacityByRegionChart({
  recommendations,
}: {
  recommendations: CapacityRecommendation[];
}) {
  const byRegion = new Map<string, { region: string; currentUnits: number; requiredUnits: number }>();

  for (const rec of recommendations) {
    const label = REGION_LABELS[rec.region];
    const existing = byRegion.get(label) ?? { region: label, currentUnits: 0, requiredUnits: 0 };
    existing.currentUnits += rec.currentUnits;
    existing.requiredUnits += rec.requiredUnits;
    byRegion.set(label, existing);
  }

  const data = Array.from(byRegion.values());

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="region" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} width={30} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="currentUnits" fill="var(--color-currentUnits)" radius={4} isAnimationActive={false} />
        <Bar dataKey="requiredUnits" fill="var(--color-requiredUnits)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
