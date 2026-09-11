import { Card, CardContent } from "@/components/ui/card";
import { ModelStatusBadge, ModelTypeBadge } from "@/components/dashboard/status-badges";
import { modelType, type ModelConfidenceSnapshot } from "@/lib/types";
import { MODEL_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ConfidenceGauge({ snapshot }: { snapshot: ModelConfidenceSnapshot }) {
  const barColor =
    snapshot.status === "nominal"
      ? "bg-status-success"
      : snapshot.status === "degraded"
        ? "bg-status-warning"
        : "bg-destructive";

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{MODEL_LABELS[snapshot.modelName]}</p>
          <ModelTypeBadge type={modelType(snapshot.modelName)} />
        </div>
        <p className="font-mono text-2xl font-semibold tabular-nums">{snapshot.confidenceScore}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${snapshot.confidenceScore}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <ModelStatusBadge status={snapshot.status} />
          <span className="text-xs text-muted-foreground">{snapshot.horizonMinutes}m</span>
        </div>
      </CardContent>
    </Card>
  );
}
