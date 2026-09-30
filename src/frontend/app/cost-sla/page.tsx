"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, DollarSign, RefreshCw, TrendingDown } from "lucide-react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CostTrendChart } from "@/components/dashboard/cost-trend-chart";
import { SlaViolationChart } from "@/components/dashboard/sla-violation-chart";
import { LiveIndicator } from "@/components/dashboard/live-indicator";
import { DayRangeSelector, type DayRange } from "@/components/dashboard/day-range-selector";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import {
  SortableTableHead,
  sortRows,
  toggleSort,
  type SortState,
} from "@/components/dashboard/sortable-table-head";
import { CostForecastCard } from "@/components/dashboard/cost-forecast-card";
import { PolicyComparisonCard } from "@/components/dashboard/policy-comparison-card";
import { useApiData } from "@/lib/api/hooks";
import { IS_LIVE } from "@/lib/config";
import { generateCostSlaTimeseries, REGIONS } from "@/lib/mock";
import { REGION_LABELS, type CostForecast, type CostSlaMetric, type PolicyComparison } from "@/lib/types";
import { computeTrend, formatDateTime, formatUsd } from "@/lib/utils";

type EventSortKey =
  | "timestamp"
  | "region"
  | "overloadEvents"
  | "underutilizationEvents"
  | "scalingOscillations"
  | "slaViolationMinutes";

export default function CostSlaPage() {
  const [dayRange, setDayRange] = useState<DayRange>(7);
  const metricsQuery = useApiData<CostSlaMetric[]>(`/cost-sla?days=${dayRange}`, (tick) =>
    generateCostSlaTimeseries(REGIONS, dayRange, tick)
  );
  const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data]);
  const forecastQuery = useApiData<CostForecast>(IS_LIVE ? "/cost/forecast?days=14" : null, () => undefined as never);
  const policiesQuery = useApiData<PolicyComparison>(IS_LIVE ? "/cost-sla/policies" : null, () => undefined as never);
  const [eventSort, setEventSort] = useState<SortState<EventSortKey>>({ key: null, direction: "asc" });

  const byDay = new Map<
    string,
    { day: string; infrastructureCostUsd: number; modelInferenceCostUsd: number; slaViolationMinutes: number }
  >();

  for (const metric of metrics) {
    const dayKey = metric.timestamp.slice(0, 10);
    const existing = byDay.get(dayKey) ?? {
      day: dayKey.slice(5),
      infrastructureCostUsd: 0,
      modelInferenceCostUsd: 0,
      slaViolationMinutes: 0,
    };
    existing.infrastructureCostUsd += metric.infrastructureCostUsd;
    existing.modelInferenceCostUsd += metric.modelInferenceCostUsd;
    existing.slaViolationMinutes += metric.slaViolationMinutes;
    byDay.set(dayKey, existing);
  }

  const dailyData = Array.from(byDay.values());
  const lastDay = dailyData[dailyData.length - 1];
  const previousDay = dailyData[dailyData.length - 2];
  const infraCostTrend =
    lastDay && previousDay
      ? computeTrend(lastDay.infrastructureCostUsd, previousDay.infrastructureCostUsd, {
          goodDirection: "down",
          suffix: "day over day",
        })
      : undefined;
  const slaMinutesTrend =
    lastDay && previousDay
      ? computeTrend(lastDay.slaViolationMinutes, previousDay.slaViolationMinutes, {
          goodDirection: "down",
          suffix: "day over day",
        })
      : undefined;

  const totalInfraCost = metrics.reduce((sum, m) => sum + m.infrastructureCostUsd, 0);
  const totalInferenceCost = metrics.reduce((sum, m) => sum + m.modelInferenceCostUsd, 0);
  const totalSlaMinutes = metrics.reduce((sum, m) => sum + m.slaViolationMinutes, 0);
  const totalOscillations = metrics.reduce((sum, m) => sum + m.scalingOscillations, 0);

  const allEventRows = metrics
    .filter((m) => m.overloadEvents > 0 || m.underutilizationEvents > 0 || m.scalingOscillations > 0)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const sortedEventRows = sortRows(allEventRows, eventSort, {
    timestamp: (row) => row.timestamp,
    region: (row) => REGION_LABELS[row.region],
    overloadEvents: (row) => row.overloadEvents,
    underutilizationEvents: (row) => row.underutilizationEvents,
    scalingOscillations: (row) => row.scalingOscillations,
    slaViolationMinutes: (row) => row.slaViolationMinutes,
  });
  const eventRows = sortedEventRows.slice(0, 15);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cost and SLA metrics, updating live
          {IS_LIVE && (
            <span className="block text-xs">
              Days before the live window come from the backtest replay of the active policy; today accrues tick by tick.
            </span>
          )}
        </p>
        <DayRangeSelector value={dayRange} onValueChange={setDayRange} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={`Infra cost (${dayRange}d)`}
          value={formatUsd(totalInfraCost)}
          icon={DollarSign}
          trend={infraCostTrend}
        />
        <KpiCard label={`Inference cost (${dayRange}d)`} value={formatUsd(totalInferenceCost)} icon={DollarSign} />
        <KpiCard
          label="SLA violation minutes"
          value={totalSlaMinutes}
          icon={AlertTriangle}
          trend={slaMinutesTrend}
        />
        <KpiCard label="Scaling oscillations" value={totalOscillations} icon={RefreshCw} />
      </div>

      {forecastQuery.data && <CostForecastCard forecast={forecastQuery.data} />}

      <Card>
        <CardHeader>
          <CardTitle>Cost trend</CardTitle>
          <CardDescription>
            Infrastructure vs. model inference spend, last {dayRange} days, all regions.
          </CardDescription>
          <CardAction>
            <LiveIndicator />
          </CardAction>
        </CardHeader>
        <CardContent>
          <CostTrendChart data={dailyData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SLA violations</CardTitle>
          <CardDescription className="flex items-center gap-1">
            <TrendingDown className="size-3.5" />
            Minutes per day where demand exceeded provisioned capacity (any fleet).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SlaViolationChart data={dailyData} />
        </CardContent>
      </Card>

      {policiesQuery.data && <PolicyComparisonCard comparison={policiesQuery.data} />}

      <Card>
        <CardHeader>
          <CardTitle>Event log</CardTitle>
          <CardDescription>
            {allEventRows.length > eventRows.length
              ? `Showing ${eventRows.length} of ${allEventRows.length} overload, underutilization, and oscillation events.`
              : "Recent overload, underutilization, and oscillation events."}
          </CardDescription>
          <CardAction>
            <ExportCsvButton
              filename="cost-sla-events.csv"
              rows={sortedEventRows.map((row) => ({
                Date: formatDateTime(row.timestamp),
                Region: REGION_LABELS[row.region],
                Overload: row.overloadEvents,
                Underutilized: row.underutilizationEvents,
                Oscillations: row.scalingOscillations,
                "SLA min.": row.slaViolationMinutes,
              }))}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {(
                  [
                    ["timestamp", "Date", "left"],
                    ["region", "Region", "left"],
                    ["overloadEvents", "Overload", "right"],
                    ["underutilizationEvents", "Underutilized", "right"],
                    ["scalingOscillations", "Oscillations", "right"],
                    ["slaViolationMinutes", "SLA min.", "right"],
                  ] as [EventSortKey, string, "left" | "right"][]
                ).map(([key, label, align]) => (
                  <SortableTableHead
                    key={key}
                    sortKey={key}
                    sort={eventSort}
                    onSort={(k) => setEventSort((prev) => toggleSort(prev, k))}
                    align={align}
                    className={align === "right" ? "text-right" : undefined}
                  >
                    {label}
                  </SortableTableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventRows.map((row) => (
                <TableRow key={`${row.timestamp}-${row.region}`}>
                  <TableCell className="font-mono text-xs">{formatDateTime(row.timestamp)}</TableCell>
                  <TableCell>{REGION_LABELS[row.region]}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.overloadEvents}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {row.underutilizationEvents}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.scalingOscillations}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{row.slaViolationMinutes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
