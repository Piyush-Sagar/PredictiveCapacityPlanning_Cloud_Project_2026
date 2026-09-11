"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AlertSeverity } from "@/lib/types";

const SEVERITIES: AlertSeverity[] = ["info", "warning", "critical"];

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

export function SeveritySelector({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(String(next))}>
      <SelectTrigger className="w-36">
        <SelectValue placeholder="Severity" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All severities</SelectItem>
        {SEVERITIES.map((severity) => (
          <SelectItem key={severity} value={severity}>
            {SEVERITY_LABELS[severity]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
