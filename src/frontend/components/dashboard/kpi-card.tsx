import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  trend?: { direction: "up" | "down"; label: string; tone?: "positive" | "negative" | "neutral" };
  hint?: string;
}

export function KpiCard({ label, value, icon: Icon, trend, hint }: KpiCardProps) {
  const trendTone =
    trend?.tone ?? (trend?.direction === "up" ? "positive" : trend?.direction === "down" ? "negative" : "neutral");

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {Icon && <Icon className="size-4 text-muted-foreground" />}
        </div>
        <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
        {trend && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              trendTone === "positive" && "text-status-success",
              trendTone === "negative" && "text-destructive",
              trendTone === "neutral" && "text-muted-foreground"
            )}
          >
            {trend.direction === "up" ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {trend.label}
          </div>
        )}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
