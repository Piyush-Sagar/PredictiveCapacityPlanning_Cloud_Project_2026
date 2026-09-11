import Link from "next/link";
import { AlertTriangle, DollarSign, Gauge, Radar } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PipelineDiagram } from "@/components/dashboard/pipeline-diagram";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import {
  generateAllForecastSeries,
  generateConfidenceSnapshots,
  getDashboardSnapshot,
  PREVIOUS_PERIOD_SEED,
  REGIONS,
} from "@/lib/mock";
import { computeTrend, formatCompactNumber, formatPercent, formatUsd } from "@/lib/utils";

function averageConfidence(snapshots: { confidenceScore: number }[]): number {
  return snapshots.reduce((sum, s) => sum + s.confidenceScore, 0) / snapshots.length;
}

export default function OverviewPage() {
  const { confidenceSnapshots, alerts, costSlaMetrics } = getDashboardSnapshot();
  const forecastSeries = generateAllForecastSeries(REGIONS, 15);
  const previousForecastSeries = generateAllForecastSeries(REGIONS, 15, PREVIOUS_PERIOD_SEED);
  const previousConfidenceSnapshots = generateConfidenceSnapshots(PREVIOUS_PERIOD_SEED);

  const currentDemand = forecastSeries.reduce((sum, series) => {
    const nowPoint = series.points[series.nowIndex];
    return sum + (nowPoint.actual ?? nowPoint.p50);
  }, 0);
  const previousDemand = previousForecastSeries.reduce((sum, series) => {
    const nowPoint = series.points[series.nowIndex];
    return sum + (nowPoint.actual ?? nowPoint.p50);
  }, 0);

  const pendingAlerts = alerts.filter((alert) => alert.status === "pending").length;
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical").length;

  const avgConfidence = averageConfidence(confidenceSnapshots);
  const previousAvgConfidence = averageConfidence(previousConfidenceSnapshots);

  const weeklySpend = costSlaMetrics.reduce(
    (sum, metric) => sum + metric.infrastructureCostUsd + metric.modelInferenceCostUsd,
    0
  );
  const slaViolationMinutes = costSlaMetrics.reduce((sum, metric) => sum + metric.slaViolationMinutes, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Current demand"
          value={formatCompactNumber(currentDemand * 1000)}
          icon={Radar}
          hint="Concurrent viewers, all regions"
          trend={computeTrend(currentDemand, previousDemand)}
        />
        <KpiCard
          label="Pending alerts"
          value={pendingAlerts}
          icon={AlertTriangle}
          trend={
            criticalAlerts > 0
              ? { direction: "up", label: `${criticalAlerts} critical`, tone: "negative" }
              : undefined
          }
        />
        <KpiCard
          label="Avg. model confidence"
          value={formatPercent(avgConfidence, 0)}
          icon={Gauge}
          hint="Across all models & horizons"
          trend={computeTrend(avgConfidence, previousAvgConfidence, { goodDirection: "up" })}
        />
        <KpiCard
          label="7-day spend"
          value={formatUsd(weeklySpend)}
          icon={DollarSign}
          hint={`${slaViolationMinutes} min SLA violations`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Forecast-to-capacity pipeline</CardTitle>
          <CardDescription>
            Demand forecasts flow through a capacity decision loop with guardrails, and outcomes
            feed back into retraining.
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
