"use client";

import Link from "next/link";
import { AlertTriangle, DollarSign, Gauge, Radar } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PipelineDiagram } from "@/components/dashboard/pipeline-diagram";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { useApiData } from "@/lib/api/hooks";
import { IS_LIVE } from "@/lib/config";
import {
  generateAllForecastSeries,
  generateConfidenceSnapshots,
  getDashboardSnapshot,
  PREVIOUS_PERIOD_SEED,
  REGIONS,
} from "@/lib/mock";
import {
  MODEL_LABELS,
  type AlertItem,
  type CostSlaMetric,
  type ForecastSeries,
  type ModelConfidenceSnapshot,
  type PipelineStatus,
} from "@/lib/types";
import { cn, computeTrend, formatCompactNumber, formatPercent, formatUsd } from "@/lib/utils";

function averageConfidence(snapshots: { confidenceScore: number }[]): number {
  return snapshots.length ? snapshots.reduce((sum, s) => sum + s.confidenceScore, 0) / snapshots.length : 0;
}

const MOCK_PREVIOUS_FORECASTS = generateAllForecastSeries(REGIONS, 15, PREVIOUS_PERIOD_SEED);
const MOCK_PREVIOUS_CONFIDENCE = generateConfidenceSnapshots(PREVIOUS_PERIOD_SEED);

function demandAt(series: ForecastSeries[], offset: number): number {
  return series.reduce((sum, s) => {
    const point = s.points[Math.max(0, s.nowIndex - offset)];
    return sum + (point ? (point.actual ?? point.p50) : 0);
  }, 0);
}

export default function OverviewPage() {
  const forecasts = useApiData<ForecastSeries[]>("/forecasts/all?horizon=15", () => generateAllForecastSeries(REGIONS, 15));
  const alerts = useApiData<AlertItem[]>("/alerts?status=pending", () => getDashboardSnapshot().alerts);
  const confidence = useApiData<ModelConfidenceSnapshot[]>("/confidence", () => getDashboardSnapshot().confidenceSnapshots);
  const costs = useApiData<CostSlaMetric[]>("/cost-sla?days=7", () => getDashboardSnapshot().costSlaMetrics);
  const pipeline = useApiData<PipelineStatus>(IS_LIVE ? "/pipeline/status" : null, () => undefined as never);

  const series = forecasts.data ?? [];
  const currentDemand = demandAt(series, 0);
  // Live: compare with an hour ago on the same timeline; mock: seeded previous period.
  const previousDemand = IS_LIVE ? demandAt(series, 12) : demandAt(MOCK_PREVIOUS_FORECASTS, 0);

  const alertRows = (alerts.data ?? []).filter((alert) => alert.status === "pending");
  const pendingAlerts = alertRows.length;
  const criticalAlerts = alertRows.filter((alert) => alert.severity === "critical").length;

  const snapshots = confidence.data ?? [];
  const avgConfidence = averageConfidence(snapshots);
  const previousAvgConfidence = IS_LIVE ? 0 : averageConfidence(MOCK_PREVIOUS_CONFIDENCE);

  const costRows = costs.data ?? [];
  const weeklySpend = costRows.reduce((sum, metric) => sum + metric.infrastructureCostUsd + metric.modelInferenceCostUsd, 0);
  const slaViolationMinutes = costRows.reduce((sum, metric) => sum + metric.slaViolationMinutes, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Current demand"
          value={formatCompactNumber(currentDemand * 1000)}
          icon={Radar}
          hint="Concurrent viewers, all regions"
          trend={computeTrend(currentDemand, previousDemand, IS_LIVE ? { suffix: "vs. 1 h ago" } : {})}
        />
        <KpiCard
          label="Pending alerts"
          value={pendingAlerts}
          icon={AlertTriangle}
          trend={criticalAlerts > 0 ? { direction: "up", label: `${criticalAlerts} critical`, tone: "negative" } : undefined}
        />
        <KpiCard
          label="Avg. model confidence"
          value={formatPercent(avgConfidence, 0)}
          icon={Gauge}
          hint="Across all models & horizons"
          trend={computeTrend(avgConfidence, previousAvgConfidence, { goodDirection: "up" })}
        />
        <KpiCard label="7-day spend" value={formatUsd(weeklySpend)} icon={DollarSign} hint={`${slaViolationMinutes} min SLA violations`} />
      </div>

      {pipeline.data && (
        <Card>
          <CardHeader>
            <CardTitle>Live pipeline · simulated AWS</CardTitle>
            <CardDescription>
              Each stage of the reference architecture and its local stand-in. Planner model:{" "}
              {MODEL_LABELS[pipeline.data.planningModel]} (15 m) · {MODEL_LABELS[pipeline.data.selection["60"]]} (60 m) · data:{" "}
              {pipeline.data.dataset.source ?? "unknown"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {pipeline.data.stages.map((stage) => (
              <div key={stage.key} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{stage.label}</p>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      stage.status === "ok" ? "bg-status-success" : stage.status === "degraded" ? "bg-destructive" : "bg-status-neutral"
                    )}
                    aria-label={stage.status}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">{stage.awsService}</span> → {stage.localStandIn}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{stage.detail}</p>
              </div>
            ))}
            {pipeline.data.aws.lastError && pipeline.data.aws.ok === false && (
              <p className="text-xs text-destructive sm:col-span-2 xl:col-span-4">AWS endpoint error: {pipeline.data.aws.lastError}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Forecast-to-capacity pipeline</CardTitle>
          <CardDescription>
            Demand forecasts flow through a capacity decision loop with guardrails, and outcomes feed back into
            retraining.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PipelineDiagram />
        </CardContent>
      </Card>

      <div>
        <p className="mb-3 text-sm font-medium text-muted-foreground">Jump to a view</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_ITEMS.filter((item) => item.href !== "/").map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <Card className="h-full transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
