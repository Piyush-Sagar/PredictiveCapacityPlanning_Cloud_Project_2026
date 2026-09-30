"""ORM → camelCase shapes matching ``src/frontend/lib/types.ts``."""

from __future__ import annotations

from datetime import datetime, timezone

from capplan_db import models as m


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def account(a: m.Account, *, pending_alerts: int | None = None) -> dict:
    return {
        "id": a.id,
        "awsAccountId": a.aws_account_id,
        "alias": a.alias,
        "displayName": a.display_name,
        "status": a.status,
        "roleArn": a.role_arn,
        "externalId": a.external_id,
        "stackId": a.stack_id,
        "regions": a.regions,
        "scale": a.scale,
        "createdAt": iso(a.created_at),
        "connectedAt": iso(a.connected_at),
        "lastError": a.last_error,
        "pendingAlerts": pending_alerts,
    }


def recommendation(r: m.Recommendation) -> dict:
    return {
        "id": r.id,
        "region": r.region,
        "resourceType": r.resource_type,
        "timestamp": iso(r.ts),
        "forecastP90": r.forecast_p90,
        "throughputPerUnit": r.throughput_per_unit,
        "safetyMarginPct": r.safety_margin_pct,
        "requiredUnits": r.required_units,
        "rawRequiredUnits": r.raw_required_units,
        "currentUnits": r.current_units,
        "minUnits": r.min_units,
        "maxUnits": r.max_units,
        "hysteresisActive": r.hysteresis_active,
        "cooldownRemainingSec": r.cooldown_remaining_sec,
        "budgetThresholdUsd": r.budget_threshold_usd,
        "budgetCapped": r.budget_capped,
        "estimatedCostUsd": r.estimated_cost_usd,
        "decisionState": r.decision_state,
        "modelUsed": r.model,
    }


def alert(a: m.Alert) -> dict:
    out = {
        "id": a.id,
        "type": a.type,
        "severity": a.severity,
        "title": a.title,
        "description": a.description,
        "region": a.region,
        "createdAt": iso(a.created_at),
        "updatedAt": iso(a.updated_at),
        "status": a.status,
        "resolvedBy": a.resolved_by,
        "resolvedAt": iso(a.resolved_at),
        "snsMessageId": a.sns_message_id,
    }
    if a.related_recommendation_id:
        out["relatedRecommendationId"] = a.related_recommendation_id
    return out


def confidence(c: m.ConfidenceSnapshot) -> dict:
    out = {
        "modelName": c.model,
        "horizonMinutes": c.horizon,
        "region": c.region,
        "targetCoveragePct": c.target_coverage_pct,
        "actualCoveragePct": c.actual_coverage_pct,
        "calibrationErrorPct": c.calibration_error_pct,
        "confidenceScore": c.confidence_score,
        "status": c.status,
        "asOf": iso(c.as_of),
        "source": c.source,
    }
    if c.fallback_model:
        out["fallbackModel"] = c.fallback_model
    return out


def benchmark(b: m.BenchmarkResult) -> dict:
    return {
        "modelName": b.model,
        "modelType": b.model_type,
        "horizonMinutes": b.horizon,
        "mae": b.mae,
        "rmse": b.rmse,
        "smape": b.smape,
        "mase": b.mase,
        "p90CoveragePct": b.p90_coverage_pct,
        "inferenceLatencyMs": b.inference_latency_ms,
        "costPer1kInferencesUsd": b.cost_per_1k_usd,
        "memoryFootprintMb": b.memory_mb,
        "simulated": b.simulated,
        "host": b.host,
        "segments": b.segments,
    }


def cost_sla(r: m.CostSlaDaily) -> dict:
    return {
        "timestamp": iso(r.day),
        "region": r.region,
        "instanceHours": round(r.instance_hours, 1),
        "taskHours": round(r.task_hours, 1),
        "modelInferenceCostUsd": round(r.model_inference_cost_usd, 2),
        "infrastructureCostUsd": round(r.infrastructure_cost_usd, 2),
        "slaViolationMinutes": r.sla_violation_minutes,
        "overloadEvents": r.overload_events,
        "underutilizationEvents": r.underutilization_events,
        "scalingOscillations": r.scaling_oscillations,
        "source": r.source,
    }


def decision(d: m.ScalingDecision) -> dict:
    return {
        "id": d.id,
        "region": d.region,
        "resourceType": d.resource_type,
        "timestamp": iso(d.ts),
        "fromUnits": d.from_units,
        "toUnits": d.to_units,
        "trigger": d.trigger,
        "actor": d.actor,
        "modelUsed": d.model,
        "forecastP90": d.forecast_p90,
        "awsDesiredCount": d.aws_desired_count,
        "awsRequest": d.aws_request,
    }


def policy_summary(p: m.PolicySummary) -> dict:
    return {
        "policy": p.policy,
        "label": p.label,
        "slaViolationMinutes": p.sla_violation_minutes,
        "overloadEvents": p.overload_events,
        "underutilizationEvents": p.underutilization_events,
        "scalingOscillations": p.scaling_oscillations,
        "infrastructureCostUsd": p.infrastructure_cost_usd,
        "modelInferenceCostUsd": p.model_inference_cost_usd,
        "totalCostUsd": p.total_cost_usd,
        "avgUtilizationPct": p.avg_utilization_pct,
    }
