import { ShieldAlert } from "lucide-react";

import { MODEL_LABELS, REGION_LABELS, type ModelConfidenceSnapshot } from "@/lib/types";

export function FallbackBanner({ snapshots }: { snapshots: ModelConfidenceSnapshot[] }) {
  const fallbacks = snapshots.filter((snapshot) => snapshot.status === "fallback");
  if (fallbacks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <ShieldAlert className="size-4" />
        {fallbacks.length} model{fallbacks.length > 1 ? "s" : ""} operating in fallback mode
      </div>
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {fallbacks.map((snapshot) => (
          <li key={`${snapshot.modelName}-${snapshot.horizonMinutes}`}>
            {MODEL_LABELS[snapshot.modelName]} ({snapshot.horizonMinutes}m,{" "}
            {REGION_LABELS[snapshot.region]}) — calibration error {snapshot.calibrationErrorPct}%,
            reverted to {MODEL_LABELS[snapshot.fallbackModel ?? "seasonal-naive"]}.
          </li>
        ))}
      </ul>
    </div>
  );
}
