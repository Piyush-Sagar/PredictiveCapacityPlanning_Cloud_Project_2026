"use client";

import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { MODEL_LABELS, type CostForecast } from "@/lib/types";
import { formatUsd } from "@/lib/utils";

const chartConfig = {
  actual: { label: "Actual (simulated CE)", color: "var(--chart-1)" },
  mean: { label: "Forecast mean", color: "var(--chart-2)" },
  band: { label: "80% interval", color: "var(--chart-2)" },
} satisfies ChartConfig;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Cost prediction: next-hour cost from the live P50/P90 demand forecast, and a
 * Cost Explorer-shaped (ce:GetCostForecast) daily projection. */
export function CostForecastCard({ forecast }: { forecast: CostForecast }) {
  const data = [
    ...forecast.history.map((h) => ({ day: h.date.slice(5), actual: h.costUsd })),
    ...forecast.ForecastResultsByTime.map((f) => ({
      day: f.TimePeriod.Start.slice(5),
      mean: Number(f.MeanValue),
      band: [Number(f.PredictionIntervalLowerBound), Number(f.PredictionIntervalUpperBound)] as [number, number],
    })),
  ];
  const { nextHour, monthEnd } = forecast;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost forecast</CardTitle>
        <CardDescription>
          Next hour from {MODEL_LABELS[nextHour.model] ?? nextHour.model} P50/P90 demand → units → on-demand pricing;
          daily projection via the simulated Cost Explorer <code className="font-mono">GetCostForecast</code> API.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Next hour (P50 → P90)"
            value={`${formatUsd(nextHour.p50CostUsd)} – ${formatUsd(nextHour.p90CostUsd)}`}
            hint={`current run-rate ${formatUsd(nextHour.currentRunRateUsdPerHour)}/h`}
          />
          <Stat label="Today so far" value={formatUsd(forecast.todaySoFarUsd)} hint={`as of ${forecast.asOf.slice(11, 16)} UTC`} />
          <Stat
            label={`Next ${forecast.ForecastResultsByTime.length} days`}
            value={formatUsd(Number(forecast.Total.Amount))}
            hint={`${forecast.PredictionIntervalLevel ?? 80}% interval shown in chart`}
          />
          <Stat
            label={`Month-end ${monthEnd.month}`}
            value={formatUsd(monthEnd.meanUsd)}
            hint={`${formatUsd(monthEnd.lowerUsd)} – ${formatUsd(monthEnd.upperUsd)} · MTD ${formatUsd(monthEnd.monthToDateUsd)}`}
          />
        </div>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area dataKey="band" stroke="none" fill="var(--color-band)" fillOpacity={0.18} isAnimationActive={false} />
            <Line dataKey="actual" stroke="var(--color-actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="mean" stroke="var(--color-mean)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ChartContainer>
        <p className="text-[11px] text-muted-foreground">Method: {forecast.method}.</p>
      </CardContent>
    </Card>
  );
}
