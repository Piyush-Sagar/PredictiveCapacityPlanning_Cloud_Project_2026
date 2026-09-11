"use client";

import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SeverityBadge } from "@/components/dashboard/status-badges";
import type { AlertItem as AlertItemType } from "@/lib/types";
import { REGION_LABELS } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

export function AlertItem({
  alert,
  nowIso,
  onApprove,
  onReject,
}: {
  alert: AlertItemType;
  nowIso: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const isPending = alert.status === "pending";

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            <span className="text-xs text-muted-foreground">{REGION_LABELS[alert.region]}</span>
            <span className="text-xs text-muted-foreground">&middot;</span>
            <span className="text-xs text-muted-foreground">{formatRelativeTime(alert.createdAt, nowIso)}</span>
          </div>
          <p className="text-sm font-medium">{alert.title}</p>
          <p className="text-xs text-muted-foreground">{alert.description}</p>
        </div>

        {isPending ? (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => onReject(alert.id)} className="gap-1">
              <X className="size-3.5" />
              Reject
            </Button>
            <Button size="sm" onClick={() => onApprove(alert.id)} className="gap-1">
              <Check className="size-3.5" />
              Approve
            </Button>
          </div>
        ) : (
          <span className="shrink-0 text-xs font-medium capitalize text-muted-foreground">
            {alert.status.replace("-", " ")}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
