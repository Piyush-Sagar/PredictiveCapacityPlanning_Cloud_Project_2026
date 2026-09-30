"use client";

import { useEffect, useState } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ForecastChart } from "@/components/dashboard/forecast-chart";
import { RegionSelector } from "@/components/dashboard/region-selector";
import { HorizonSelector } from "@/components/dashboard/horizon-selector";
import { RegionSparklineCard } from "@/components/dashboard/region-sparkline-card";
import { LiveIndicator } from "@/components/dashboard/live-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiData } from "@/lib/api/hooks";
import { generateAllForecastSeries, generateForecastSeries, REGIONS } from "@/lib/mock";
import { useRegions } from "@/lib/session";
import { MODEL_LABELS, REGION_LABELS, type ForecastSeries, type Horizon, type Region } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/utils";

function isRegion(value: string | null): value is Region {
  return value != null && (REGIONS as string[]).includes(value);
}

export default function ForecastPage() {
  const [region, setRegion] = useState<Region>("us-east");
  const [horizon, setHorizon] = useState<Horizon>(15);
  const regions = useRegions();
  const activeRegion = regions.includes(region) ? region : regions[0];

  // Deep-link support for the command palette's "Regions" results (?region=us-east).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const regionParam = params.get("region");
    if (isRegion(regionParam)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link init from window.location, unavailable during render/SSR
      setRegion(regionParam);
    }
  }, []);

  const seriesQuery = useApiData<ForecastSeries>(
    `/forecasts?region=${activeRegion}&horizon=${horizon}`,
    (tick) => generateForecastSeries(activeRegion, horizon, tick)
  );
  const allQuery = useApiData<ForecastSeries[]>(`/forecasts/all?horizon=${horizon}`, (tick) =>
    generateAllForecastSeries(REGIONS, horizon, tick)
  );
  const series = seriesQuery.data;
  const allSeries = allQuery.data ?? [];

  if (!series) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
        {seriesQuery.error && <p className="text-sm text-destructive">{seriesQuery.error.message}</p>}
      </div>
    );
  }

  const recentPoints = series.points.slice(
    Math.max(0, series.nowIndex - 5),
    Math.min(series.points.length, series.nowIndex + 6)
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Regional demand, updating live</p>
        <LiveIndicator />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {allSeries.map((s) => (
          <RegionSparklineCard key={s.region} series={s} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demand forecast — {REGION_LABELS[activeRegion]}</CardTitle>
          <CardDescription>
            P50/P90 confidence band, {horizon}-minute horizon &middot; model:{" "}
            {MODEL_LABELS[series.points[0]?.modelUsed ?? "chronos"]}
          </CardDescription>
          <CardAction className="flex items-center gap-3">
            <LiveIndicator />
            <RegionSelector value={activeRegion} onValueChange={(value) => setRegion(value as Region)} />
            <HorizonSelector value={horizon} onValueChange={setHorizon} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ForecastChart series={series} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent points</CardTitle>
          <CardDescription>
            Showing {recentPoints.length} points &mdash; up to 25 minutes before and after the forecast
            boundary.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Region</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">P50</TableHead>
                <TableHead className="text-right">P90</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPoints.map((point) => (
                <TableRow key={point.timestamp}>
                  <TableCell className="font-mono text-xs">{formatDateTime(point.timestamp)}</TableCell>
                  <TableCell>{REGION_LABELS[point.region]}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {point.actual != null ? formatNumber(point.actual, 1) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(point.p50, 1)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(point.p90, 1)}
                  </TableCell>
                  <TableCell className="text-xs">{MODEL_LABELS[point.modelUsed]}</TableCell>
                  <TableCell>
                    <Badge variant={point.isForecast ? "outline" : "secondary"} className="text-[11px]">
                      {point.isForecast ? "Forecast" : "Observed"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
