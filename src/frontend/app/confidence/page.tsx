"use client";

import { useMemo, useState } from "react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HorizonSelector } from "@/components/dashboard/horizon-selector";
import { ConfidenceGauge } from "@/components/dashboard/confidence-gauge";
import { CalibrationChart } from "@/components/dashboard/calibration-chart";
import { FallbackBanner } from "@/components/dashboard/fallback-banner";
import { LiveIndicator } from "@/components/dashboard/live-indicator";
import { ModelStatusBadge } from "@/components/dashboard/status-badges";
import { useApiData } from "@/lib/api/hooks";
import { IS_LIVE } from "@/lib/config";
import { generateConfidenceSnapshots } from "@/lib/mock";
import { MODEL_LABELS, REGION_LABELS, type Horizon, type ModelConfidenceSnapshot } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { formatPercent } from "@/lib/utils";

export default function ConfidencePage() {
  const [horizon, setHorizon] = useState<Horizon>(15);
  const query = useApiData<(ModelConfidenceSnapshot & { source?: string })[]>("/confidence", (tick) =>
    generateConfidenceSnapshots(tick)
  );
  const allSnapshots = useMemo(() => query.data ?? [], [query.data]);
  const source = allSnapshots[0]?.source;
  const snapshots = useMemo(
    () => allSnapshots.filter((snapshot) => snapshot.horizonMinutes === horizon),
    [allSnapshots, horizon]
  );

  return (
    <div className="flex flex-col gap-5">
      <FallbackBanner snapshots={allSnapshots} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Model confidence at the selected horizon
          {IS_LIVE && source && (
            <span className="block text-xs">
              {source === "live"
                ? `Rolling P90 coverage over the last 4 h of live forecasts · as of ${formatDateTime(allSnapshots[0].asOf)} UTC`
                : "Backtest snapshot (live rolling coverage appears after the first 30 simulated minutes)"}
            </span>
          )}
        </p>
        <div className="flex items-center gap-3">
          <LiveIndicator />
          <HorizonSelector value={horizon} onValueChange={setHorizon} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {snapshots.map((snapshot) => (
          <ConfidenceGauge key={snapshot.modelName} snapshot={snapshot} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>P90 calibration</CardTitle>
          <CardDescription>Actual coverage vs. the 90% target — lower bars mean under-coverage.</CardDescription>
        </CardHeader>
        <CardContent>
          <CalibrationChart snapshots={snapshots} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Snapshot detail</CardTitle>
          <CardAction className="text-xs text-muted-foreground">All horizons</CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Region</TableHead>
                <TableHead className="text-right">Horizon</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Calib. error</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allSnapshots.map((snapshot) => (
                <TableRow key={`${snapshot.modelName}-${snapshot.horizonMinutes}`}>
                  <TableCell>{MODEL_LABELS[snapshot.modelName]}</TableCell>
                  <TableCell className="text-xs">{REGION_LABELS[snapshot.region]}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {snapshot.horizonMinutes}m
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatPercent(snapshot.targetCoveragePct, 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatPercent(snapshot.actualCoveragePct, 1)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatPercent(snapshot.calibrationErrorPct, 1)}
                  </TableCell>
                  <TableCell>
                    <ModelStatusBadge status={snapshot.status} />
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
