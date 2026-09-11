import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AlertSeverity, DecisionState, ModelStatus } from "@/lib/types";

type IndicatorTone = "success" | "warning" | "info" | "error" | "neutral";

const TONE_DOT_CLASSES: Record<IndicatorTone, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  info: "bg-status-info",
  error: "bg-destructive",
  neutral: "bg-status-neutral",
};

const TONE_TEXT_CLASSES: Record<IndicatorTone, string> = {
  success: "text-status-success",
  warning: "text-status-warning",
  info: "text-status-info",
  error: "text-destructive",
  neutral: "text-muted-foreground",
};

/** AWS Cloudscape-style status indicator: a small filled dot + label, no pill background. */
function StatusDot({ tone, label }: { tone: IndicatorTone; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", TONE_TEXT_CLASSES[tone])}>
      <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT_CLASSES[tone])} />
      {label}
    </span>
  );
}

const DECISION_STATE_LABELS: Record<DecisionState, string> = {
  recommend: "Recommend",
  approve: "Needs approval",
  "auto-execute": "Auto-execute",
};

const DECISION_STATE_TONES: Record<DecisionState, IndicatorTone> = {
  recommend: "neutral",
  approve: "warning",
  "auto-execute": "success",
};

export function DecisionStateBadge({ state }: { state: DecisionState }) {
  return <StatusDot tone={DECISION_STATE_TONES[state]} label={DECISION_STATE_LABELS[state]} />;
}

const MODEL_STATUS_LABELS: Record<ModelStatus, string> = {
  nominal: "Nominal",
  degraded: "Degraded",
  fallback: "Fallback",
};

const MODEL_STATUS_TONES: Record<ModelStatus, IndicatorTone> = {
  nominal: "success",
  degraded: "warning",
  fallback: "error",
};

export function ModelStatusBadge({ status }: { status: ModelStatus }) {
  return <StatusDot tone={MODEL_STATUS_TONES[status]} label={MODEL_STATUS_LABELS[status]} />;
}

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

const SEVERITY_TONES: Record<AlertSeverity, IndicatorTone> = {
  info: "info",
  warning: "warning",
  critical: "error",
};

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <StatusDot tone={SEVERITY_TONES[severity]} label={SEVERITY_LABELS[severity]} />;
}

export function ModelTypeBadge({ type }: { type: "foundation" | "baseline" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        type === "foundation"
          ? "border-transparent bg-secondary text-secondary-foreground"
          : "border-border bg-transparent text-muted-foreground"
      )}
    >
      {type === "foundation" ? "Foundation" : "Baseline"}
    </Badge>
  );
}
