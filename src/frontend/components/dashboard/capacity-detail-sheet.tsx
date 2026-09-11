import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DecisionStateBadge } from "@/components/dashboard/status-badges";
import { GuardrailStatus } from "@/components/dashboard/guardrail-status";
import type { CapacityRecommendation } from "@/lib/types";
import { REGION_LABELS, RESOURCE_LABELS } from "@/lib/types";
import { formatNumber, formatPercent, formatUsd } from "@/lib/utils";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function CapacityDetailSheet({
  recommendation,
  open,
  onOpenChange,
}: {
  recommendation: CapacityRecommendation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {recommendation && (
          <>
            <SheetHeader>
              <SheetTitle>
                {REGION_LABELS[recommendation.region]} &middot; {RESOURCE_LABELS[recommendation.resourceType]}
              </SheetTitle>
              <SheetDescription>Capacity recommendation breakdown</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4 pb-4">
              <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                required = ceil(p90 / throughput) &times; (1 + margin)
                <br />
                required = ceil({formatNumber(recommendation.forecastP90, 1)} /{" "}
                {formatNumber(recommendation.throughputPerUnit, 1)}) &times; (1 +{" "}
                {formatPercent(recommendation.safetyMarginPct * 100, 1)})
                <br />
                required = <span className="font-semibold">{recommendation.requiredUnits} units</span>
              </div>

              <div>
                <Row label="Forecast P90 demand" value={`${formatNumber(recommendation.forecastP90, 1)}k`} />
                <Row label="Throughput per unit" value={`${formatNumber(recommendation.throughputPerUnit, 1)}k`} />
                <Row label="Safety margin" value={formatPercent(recommendation.safetyMarginPct * 100, 1)} />
                <Row label="Required units" value={recommendation.requiredUnits} />
                <Row label="Current units" value={recommendation.currentUnits} />
                <Row label="Min / max bounds" value={`${recommendation.minUnits} / ${recommendation.maxUnits}`} />
                <Row
                  label="Estimated daily cost"
                  value={formatUsd(recommendation.estimatedCostUsd)}
                />
                <Row label="Budget threshold" value={formatUsd(recommendation.budgetThresholdUsd)} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Scale decision</span>
                <DecisionStateBadge state={recommendation.decisionState} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Guardrails</span>
                <GuardrailStatus
                  hysteresisActive={recommendation.hysteresisActive}
                  cooldownRemainingSec={recommendation.cooldownRemainingSec}
                />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
