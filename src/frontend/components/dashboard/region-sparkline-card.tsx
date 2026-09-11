"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import type { ForecastSeries } from "@/lib/types";
import { REGION_LABELS } from "@/lib/types";
import { formatCompactNumber } from "@/lib/utils";

export function RegionSparklineCard({ series }: { series: ForecastSeries }) {
  const nowPoint = series.points[series.nowIndex];
  const currentValue = nowPoint.actual ?? nowPoint.p50;
  const data = series.points.map((point) => ({ value: point.actual ?? point.p50 }));

  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted-foreground">
            {REGION_LABELS[series.region]}
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums">
            {formatCompactNumber(currentValue * 1000)}
          </p>
        </div>
        <div className="h-10 w-20 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
              <Area
                dataKey="value"
                type="monotone"
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
                fillOpacity={0.15}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
