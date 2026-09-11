import type {
  AlertItem,
  AlertSeverity,
  CapacityRecommendation,
  ModelConfidenceSnapshot,
} from "@/lib/types";
import { REGION_LABELS, RESOURCE_LABELS, MODEL_LABELS } from "@/lib/types";
import { MOCK_NOW } from "./constants";
import { seededRandom } from "./rng";

function minutesAgo(minutes: number): string {
  return new Date(MOCK_NOW.getTime() - minutes * 60_000).toISOString();
}

export function generateAlerts(
  recommendations: CapacityRecommendation[],
  confidenceSnapshots: ModelConfidenceSnapshot[]
): AlertItem[] {
  const alerts: AlertItem[] = [];
  const rand = seededRandom("alerts");

  for (const rec of recommendations) {
    const regionLabel = REGION_LABELS[rec.region];
    const resourceLabel = RESOURCE_LABELS[rec.resourceType];

    if (rec.decisionState === "approve") {
      const overBudget = rec.estimatedCostUsd > rec.budgetThresholdUsd;
      const severity: AlertSeverity = overBudget ? "critical" : "warning";
      alerts.push({
        id: `alert-scale-${rec.id}`,
        type: overBudget ? "budget-risk" : "proposed-scale",
        severity,
        title: overBudget
          ? `${regionLabel} ${resourceLabel} scaling exceeds budget`
          : `Scale ${resourceLabel} in ${regionLabel} to ${rec.requiredUnits} units`,
        description: overBudget
          ? `Recommended ${rec.requiredUnits} units (from ${rec.currentUnits}) would cost an estimated $${rec.estimatedCostUsd.toLocaleString()}, above the $${rec.budgetThresholdUsd.toLocaleString()} threshold. Operator approval required before execution.`
          : `Forecast P90 demand requires ${rec.requiredUnits} units (currently ${rec.currentUnits}). Change exceeds the auto-execute guardrail — awaiting approval.`,
        region: rec.region,
        createdAt: minutesAgo(Math.round(rand() * 180)),
        relatedRecommendationId: rec.id,
        status: "pending",
      });
    }
  }

  for (const snapshot of confidenceSnapshots) {
    if (snapshot.status === "fallback") {
      alerts.push({
        id: `alert-confidence-${snapshot.modelName}-${snapshot.horizonMinutes}`,
        type: "low-confidence",
        severity: "critical",
        title: `${MODEL_LABELS[snapshot.modelName]} confidence degraded at ${snapshot.horizonMinutes}m horizon`,
        description: `P90 calibration error reached ${snapshot.calibrationErrorPct}% in ${REGION_LABELS[snapshot.region]}. Falling back to ${MODEL_LABELS[snapshot.fallbackModel ?? "seasonal-naive"]} until confidence recovers.`,
        region: snapshot.region,
        createdAt: minutesAgo(Math.round(rand() * 240)),
        status: "auto-executed",
      });
    } else if (snapshot.status === "degraded" && rand() > 0.5) {
      alerts.push({
        id: `alert-degraded-${snapshot.modelName}-${snapshot.horizonMinutes}`,
        type: "low-confidence",
        severity: "warning",
        title: `${MODEL_LABELS[snapshot.modelName]} calibration drifting at ${snapshot.horizonMinutes}m horizon`,
        description: `Actual P90 coverage of ${snapshot.actualCoveragePct}% is below the ${snapshot.targetCoveragePct}% target in ${REGION_LABELS[snapshot.region]}. Monitoring for further drift.`,
        region: snapshot.region,
        createdAt: minutesAgo(Math.round(rand() * 300)),
        status: "pending",
      });
    }
  }

  const predictedPeakRegions = [recommendations[1]?.region, recommendations[7]?.region].filter(Boolean);
  predictedPeakRegions.forEach((region, index) => {
    if (!region) return;
    alerts.push({
      id: `alert-peak-${region}-${index}`,
      type: "predicted-peak",
      severity: "info",
      title: `Predicted demand peak in ${REGION_LABELS[region]}`,
      description: `Forecast shows a demand increase of ${20 + index * 15}% over the next hour, consistent with a scheduled content release. No action needed yet.`,
      region,
      createdAt: minutesAgo(Math.round(rand() * 120)),
      status: index === 0 ? "approved" : "pending",
    });
  });

  return alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
