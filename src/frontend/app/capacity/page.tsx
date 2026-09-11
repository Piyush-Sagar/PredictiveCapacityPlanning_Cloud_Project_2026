"use client";

import { useMemo, useState } from "react";
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
import { generateCapacityRecommendations, PREVIOUS_PERIOD_SEED, REGIONS } from "@/lib/mock";
import { REGION_LABELS, RESOURCE_LABELS, type CapacityRecommendation } from "@/lib/types";
import { computeTrend, formatUsd } from "@/lib/utils";

type SortKey = "region" | "currentUnits" | "requiredUnits" | "estimatedCostUsd";

export default function CapacityPage() {
  const recommendations = useMemo(() => generateCapacityRecommendations(REGIONS), []);
  const previousRecommendations = useMemo(
    () => generateCapacityRecommendations(REGIONS, PREVIOUS_PERIOD_SEED),
    []
  );
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
  const previousTotalCost = previousRecommendations.reduce((sum, rec) => sum + rec.estimatedCostUsd, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Required units"
          value={totalRequired}
          icon={Layers}
          hint={`Current: ${totalCurrent}`}
          trend={computeTrend(totalRequired, previousTotalRequired)}
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
          trend={computeTrend(totalCost, previousTotalCost, { goodDirection: "down" })}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current vs. required units by region</CardTitle>
          <CardDescription>Aggregated across all resource types per region.</CardDescription>
        </CardHeader>
        <CardContent>
          <CapacityByRegionChart recommendations={recommendations} />
        </CardContent>
      </Card>

      <Card>
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

      <CapacityDetailSheet recommendation={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
