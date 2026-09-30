"use client";

import { useState } from "react";
import { Boxes, DollarSign, Layers, ShieldAlert } from "lucide-react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DecisionStateBadge } from "@/components/dashboard/status-badges";
import { GuardrailStatus } from "@/components/dashboard/guardrail-status";
import { CapacityDetailSheet } from "@/components/dashboard/capacity-detail-sheet";
import { CapacityByRegionChart } from "@/components/dashboard/capacity-by-region-chart";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import {
  SortableTableHead,
  sortRows,
  toggleSort,
  type SortState,
} from "@/components/dashboard/sortable-table-head";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiData } from "@/lib/api/hooks";
import { IS_LIVE } from "@/lib/config";
import { generateCapacityRecommendations, PREVIOUS_PERIOD_SEED, REGIONS } from "@/lib/mock";
import {
  MODEL_LABELS,
  REGION_LABELS,
  RESOURCE_LABELS,
  type CapacityRecommendation,
  type ScalingDecisionRow,
} from "@/lib/types";
import { computeTrend, formatDateTime, formatUsd } from "@/lib/utils";

const MOCK_PREVIOUS = generateCapacityRecommendations(REGIONS, PREVIOUS_PERIOD_SEED);

type SortKey = "region" | "currentUnits" | "requiredUnits" | "estimatedCostUsd";

export default function CapacityPage() {
  const recsQuery = useApiData<CapacityRecommendation[]>("/capacity", () => generateCapacityRecommendations(REGIONS));
  const decisionsQuery = useApiData<ScalingDecisionRow[]>(IS_LIVE ? "/capacity/decisions?limit=25" : null, () => []);
  const recommendations = recsQuery.data ?? [];
  // Live mode compares against the units currently provisioned; mock mode against a seeded prior period.
  const previousRecommendations = IS_LIVE ? recommendations.map((rec) => ({ ...rec, requiredUnits: rec.currentUnits })) : MOCK_PREVIOUS;
  const [selected, setSelected] = useState<CapacityRecommendation | null>(null);
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<SortState<SortKey>>({ key: null, direction: "asc" });

  const sortedRecommendations = sortRows(recommendations, sort, {
    region: (rec) => REGION_LABELS[rec.region],
    currentUnits: (rec) => rec.currentUnits,
    requiredUnits: (rec) => rec.requiredUnits,
    estimatedCostUsd: (rec) => rec.estimatedCostUsd,
  });

  const totalRequired = recommendations.reduce((sum, rec) => sum + rec.requiredUnits, 0);
  const totalCurrent = recommendations.reduce((sum, rec) => sum + rec.currentUnits, 0);
  const totalCost = recommendations.reduce((sum, rec) => sum + rec.estimatedCostUsd, 0);
  const needsApproval = recommendations.filter((rec) => rec.decisionState === "approve").length;

  const previousTotalRequired = previousRecommendations.reduce((sum, rec) => sum + rec.requiredUnits, 0);
  const previousTotalCost = IS_LIVE
    ? recommendations.reduce((sum, rec) => sum + (rec.estimatedCostUsd / Math.max(rec.requiredUnits, 1)) * rec.currentUnits, 0)
    : previousRecommendations.reduce((sum, rec) => sum + rec.estimatedCostUsd, 0);
  const trendSuffix = IS_LIVE ? "vs. provisioned" : undefined;

  if (!recsQuery.data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
        {recsQuery.error && <p className="text-sm text-destructive">{recsQuery.error.message}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div data-tour="capacity-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Required units"
          value={totalRequired}
          icon={Layers}
          hint={`Current: ${totalCurrent}`}
          trend={computeTrend(totalRequired, previousTotalRequired, { suffix: trendSuffix })}
        />
        <KpiCard
          label="Needs approval"
          value={needsApproval}
          icon={ShieldAlert}
          trend={needsApproval > 0 ? { direction: "up", label: "action needed", tone: "negative" } : undefined}
        />
        <KpiCard label="Resource pools" value={recommendations.length} icon={Boxes} />
        <KpiCard
          label="Est. daily cost"
          value={formatUsd(totalCost)}
          icon={DollarSign}
          trend={computeTrend(totalCost, previousTotalCost, { goodDirection: "down", suffix: trendSuffix })}
        />
      </div>

      <Card data-tour="capacity-chart">
        <CardHeader>
          <CardTitle>Current vs. required units by region</CardTitle>
          <CardDescription>Aggregated across all resource types per region.</CardDescription>
        </CardHeader>
        <CardContent>
          <CapacityByRegionChart recommendations={recommendations} />
        </CardContent>
      </Card>

      <Card data-tour="capacity-table">
        <CardHeader>
          <CardTitle>Capacity recommendations</CardTitle>
          <CardDescription>
            Derived from forecast P90 demand with policy guardrails applied. Click a row for the
            formula breakdown.
          </CardDescription>
          <CardAction>
            <ExportCsvButton
              filename="capacity-recommendations.csv"
              rows={sortedRecommendations.map((rec) => ({
                Region: REGION_LABELS[rec.region],
                Resource: RESOURCE_LABELS[rec.resourceType],
                "Current units": rec.currentUnits,
                "Required units": rec.requiredUnits,
                "Hysteresis active": rec.hysteresisActive ? "yes" : "no",
                "Cooldown remaining (s)": rec.cooldownRemainingSec,
                "Est. cost (USD)": rec.estimatedCostUsd,
                Decision: rec.decisionState,
              }))}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="region" sort={sort} onSort={(key) => setSort((prev) => toggleSort(prev, key))}>
                  Region
                </SortableTableHead>
                <TableHead>Resource</TableHead>
                <SortableTableHead
                  sortKey="currentUnits"
                  sort={sort}
                  onSort={(key) => setSort((prev) => toggleSort(prev, key))}
                  align="right"
                  className="text-right"
                >
                  Current
                </SortableTableHead>
                <SortableTableHead
                  sortKey="requiredUnits"
                  sort={sort}
                  onSort={(key) => setSort((prev) => toggleSort(prev, key))}
                  align="right"
                  className="text-right"
                >
                  Required
                </SortableTableHead>
                <TableHead>Guardrails</TableHead>
                <SortableTableHead
                  sortKey="estimatedCostUsd"
                  sort={sort}
                  onSort={(key) => setSort((prev) => toggleSort(prev, key))}
                  align="right"
                  className="text-right"
                >
                  Est. cost
                </SortableTableHead>
                <TableHead>Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRecommendations.map((rec) => (
                <TableRow
                  key={rec.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View capacity breakdown for ${REGION_LABELS[rec.region]} ${RESOURCE_LABELS[rec.resourceType]}`}
                  className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
                  onClick={() => {
                    setSelected(rec);
                    setOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(rec);
                      setOpen(true);
                    }
                  }}
                >
                  <TableCell>{REGION_LABELS[rec.region]}</TableCell>
                  <TableCell className="text-xs">{RESOURCE_LABELS[rec.resourceType]}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{rec.currentUnits}</TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">
                    {rec.requiredUnits}
                  </TableCell>
                  <TableCell>
                    <GuardrailStatus
                      hysteresisActive={rec.hysteresisActive}
                      cooldownRemainingSec={rec.cooldownRemainingSec}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatUsd(rec.estimatedCostUsd)}
                  </TableCell>
                  <TableCell>
                    <DecisionStateBadge state={rec.decisionState} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {IS_LIVE && (
        <Card data-tour="capacity-audit">
          <CardHeader>
            <CardTitle>Scaling decision audit</CardTitle>
            <CardDescription>
              Every executed change, with the ECS UpdateService call sent to the account&apos;s (simulated) AWS API.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(decisionsQuery.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No scaling actions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">AWS desired</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(decisionsQuery.data ?? []).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{formatDateTime(d.timestamp)}</TableCell>
                      <TableCell>{REGION_LABELS[d.region]}</TableCell>
                      <TableCell className="text-xs">{RESOURCE_LABELS[d.resourceType]}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {d.fromUnits} → <span className="font-semibold">{d.toUnits}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.trigger === "approval" ? `approved by ${d.actor}` : "auto (guardrails)"}
                      </TableCell>
                      <TableCell className="text-xs">{MODEL_LABELS[d.modelUsed] ?? d.modelUsed}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums" title={d.awsRequest ?? undefined}>
                        {d.awsDesiredCount ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <CapacityDetailSheet recommendation={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
