"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AlertItem } from "@/components/dashboard/alert-item";
import { RegionSelector } from "@/components/dashboard/region-selector";
import { SeveritySelector } from "@/components/dashboard/severity-selector";
import { AlertTriangle, Bell, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { useApiData } from "@/lib/api/hooks";
import { IS_LIVE } from "@/lib/config";
import {
  generateAlerts,
  generateCapacityRecommendations,
  generateConfidenceSnapshots,
  PREVIOUS_PERIOD_SEED,
  REGIONS,
} from "@/lib/mock";
import { useNowIso, useSession } from "@/lib/session";
import type { AlertItem as AlertItemType, AlertStatus, ScalingDecisionRow } from "@/lib/types";
import { computeTrend } from "@/lib/utils";

type StatusFilter = "all" | AlertStatus;

export default function AlertsPage() {
  const initialAlerts = useMemo(() => {
    const recommendations = generateCapacityRecommendations(REGIONS);
    const confidenceSnapshots = generateConfidenceSnapshots();
    return generateAlerts(recommendations, confidenceSnapshots);
  }, []);
  const previousPendingCount = useMemo(() => {
    const recommendations = generateCapacityRecommendations(REGIONS, PREVIOUS_PERIOD_SEED);
    const confidenceSnapshots = generateConfidenceSnapshots(PREVIOUS_PERIOD_SEED);
    return generateAlerts(recommendations, confidenceSnapshots).filter((a) => a.status === "pending")
      .length;
  }, []);

  const [localAlerts, setLocalAlerts] = useState<AlertItemType[]>(initialAlerts);
  const liveQuery = useApiData<AlertItemType[]>(IS_LIVE ? "/alerts?limit=300" : null, () => []);
  const { invalidate } = useSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const alerts = IS_LIVE ? (liveQuery.data ?? []) : localAlerts;
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [regionFilter, setRegionFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const nowIso = useNowIso();

  const pendingCount = alerts.filter((a) => a.status === "pending").length;
  const criticalCount = alerts.filter((a) => a.severity === "critical" && a.status === "pending").length;
  const approvedCount = alerts.filter((a) => a.status === "approved" || a.status === "auto-executed").length;

  const filtered = alerts.filter(
    (alert) =>
      (filter === "all" || alert.status === filter) &&
      (regionFilter === "all" || alert.region === regionFilter) &&
      (severityFilter === "all" || alert.severity === severityFilter)
  );

  async function updateStatus(id: string, status: AlertStatus) {
    const alert = alerts.find((a) => a.id === id);
    if (IS_LIVE) {
      if (busyId) return;
      setBusyId(id);
      try {
        const res = await api.post<{ decision?: ScalingDecisionRow | null }>(
          `/alerts/${id}/${status === "approved" ? "approve" : "reject"}`
        );
        if (status === "approved") {
          toast.success(
            res.decision
              ? `Approved — ${res.decision.resourceType} in ${res.decision.region} scaled ${res.decision.fromUnits} → ${res.decision.toUnits} (ECS desired count ${res.decision.awsDesiredCount ?? "n/a"})`
              : `Acknowledged: ${alert?.title}`
          );
        } else {
          toast.error(`Rejected: ${alert?.title} — re-proposal snoozed for 30 simulated minutes`);
        }
        invalidate();
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : String(error));
        liveQuery.refresh();
      } finally {
        setBusyId(null);
      }
      return;
    }
    setLocalAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    if (status === "approved") {
      toast.success(`Approved: ${alert?.title}`);
    } else {
      toast.error(`Rejected: ${alert?.title}`);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Pending"
          value={pendingCount}
          icon={Bell}
          trend={IS_LIVE ? undefined : computeTrend(pendingCount, previousPendingCount, { goodDirection: "down" })}
        />
        <KpiCard
          label="Critical (pending)"
          value={criticalCount}
          icon={AlertTriangle}
          trend={criticalCount > 0 ? { direction: "up", label: "review now", tone: "negative" } : undefined}
        />
        <KpiCard label="Resolved" value={approvedCount} icon={ShieldCheck} />
      </div>

      <div className="flex flex-col gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as StatusFilter)}>
          <TabsList variant="line" className="w-full justify-start border-b border-border">
            <TabsTrigger value="all">All ({alerts.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="auto-executed">Auto-executed</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filter by:</span>
          <RegionSelector value={regionFilter} onValueChange={setRegionFilter} includeAll />
          <SeveritySelector value={severityFilter} onValueChange={setSeverityFilter} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No alerts in this view.</p>
        )}
        {filtered.map((alert) => (
          <AlertItem
            key={alert.id}
            alert={alert}
            nowIso={nowIso}
            onApprove={(id) => updateStatus(id, "approved")}
            onReject={(id) => updateStatus(id, "rejected")}
          />
        ))}
      </div>
    </div>
  );
}
