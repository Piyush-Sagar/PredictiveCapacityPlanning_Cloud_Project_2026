"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  slaViolationMinutes: { label: "SLA violation minutes", color: "var(--destructive)" },
} satisfies ChartConfig;

export function SlaViolationChart({ data }: { data: { day: string; slaViolationMinutes: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} width={30} tick={{ fontSize: 11 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="slaViolationMinutes"
          fill="var(--color-slaViolationMinutes)"
          radius={4}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}
