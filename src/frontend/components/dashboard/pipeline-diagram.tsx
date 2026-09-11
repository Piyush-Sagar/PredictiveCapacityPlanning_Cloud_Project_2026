import { CornerDownLeft } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Stage {
  title: string;
  detail: string;
}

const FORECAST_STAGES: Stage[] = [
  { title: "Data Sources", detail: "CDN, viewers, bitrate, CPU/mem, events" },
  { title: "Data Preparation", detail: "Validation, resampling, outliers" },
  { title: "Feature Layer", detail: "Lags, seasonality, trend" },
  { title: "Forecasting", detail: "TSFMs + baselines" },
  { title: "Model Selection", detail: "Backtesting, MAE/RMSE/sMAPE" },
  { title: "Forecast Output", detail: "15/30/60m, P50/P90" },
];

const CAPACITY_STAGES: Stage[] = [
  { title: "Capacity Translation", detail: "ceil(P90/throughput) × (1+margin)" },
  { title: "Policy Guardrails", detail: "Min/max, hysteresis, cooldown" },
  { title: "Scale Decision", detail: "Recommend / approve / auto-execute" },
  { title: "Cloud Resources", detail: "ECS, ASG, origin, transcoding" },
];

const FEEDBACK_STAGES: Stage[] = [
  { title: "Observe Outcome", detail: "Utilization, latency, errors, cost" },
  { title: "Evaluate Forecast", detail: "Error, coverage, drift" },
  { title: "Update / Retrain", detail: "Window refresh, model fallback" },
];

function Timeline({ stages }: { stages: Stage[] }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-fit items-start">
        {stages.map((stage, index) => (
          <div key={stage.title} className="flex w-24 flex-col items-center sm:w-28">
            <div className="flex w-full items-center">
              <div className={cn("h-px flex-1 bg-border", index === 0 && "invisible")} />
              <Tooltip>
                <TooltipTrigger
                  className="flex size-7 shrink-0 cursor-default items-center justify-center rounded-full border-2 border-border bg-card text-xs font-semibold text-muted-foreground outline-none transition-colors hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:text-primary"
                  aria-label={`${stage.title}: ${stage.detail}`}
                >
                  {index + 1}
                </TooltipTrigger>
                <TooltipContent>{stage.detail}</TooltipContent>
              </Tooltip>
              <div className={cn("h-px flex-1 bg-border", index === stages.length - 1 && "invisible")} />
            </div>
            <p className="mt-2 text-center text-[11px] leading-snug font-medium text-foreground">
              {stage.title}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function PipelineDiagram() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <RowLabel>Forecasting pipeline</RowLabel>
        <Timeline stages={FORECAST_STAGES} />
      </div>
      <div>
        <RowLabel>Capacity decision loop</RowLabel>
        <Timeline stages={CAPACITY_STAGES} />
      </div>
      <div>
        <RowLabel>
          <CornerDownLeft className="size-3.5" />
          Feedback loop
        </RowLabel>
        <Timeline stages={FEEDBACK_STAGES} />
      </div>
    </div>
  );
}
