"""Load offline backtest outputs (``results/``) into the global tables.
Idempotent: re-running replaces benchmark, backtest-confidence and policy rows."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .models import BenchmarkResult, ConfidenceSnapshot, PolicySummary


def seed_results(db: Session, results_dir: Path, as_of: datetime) -> dict:
    bench = pd.read_csv(results_dir / "benchmark.csv")
    seg_path = results_dir / "benchmark_segments.csv"
    segs = pd.read_csv(seg_path) if seg_path.exists() else pd.DataFrame(columns=["modelName", "horizonMinutes", "segment"])
    db.execute(delete(BenchmarkResult))
    for r in bench.to_dict("records"):
        s = segs[(segs.modelName == r["modelName"]) & (segs.horizonMinutes == r["horizonMinutes"])]
        db.add(
            BenchmarkResult(
                model=r["modelName"],
                model_type=r["modelType"],
                horizon=int(r["horizonMinutes"]),
                mae=r["mae"],
                rmse=r["rmse"],
                smape=r["smape"],
                mase=r["mase"],
                p90_coverage_pct=r["p90CoveragePct"],
                inference_latency_ms=r["inferenceLatencyMs"],
                cost_per_1k_usd=r["costPer1kInferencesUsd"],
                memory_mb=int(r["memoryFootprintMb"]),
                simulated=bool(r["simulated"]),
                host=r["host"],
                segments={x["segment"]: {k: x[k] for k in ("n", "mae", "smape", "p90CoveragePct")} for x in s.to_dict("records")},
            )
        )
    db.execute(delete(ConfidenceSnapshot).where(ConfidenceSnapshot.source == "backtest"))
    for c in json.loads((results_dir / "confidence.json").read_text()):
        db.add(
            ConfidenceSnapshot(
                account_id=None,
                source="backtest",
                model=c["modelName"],
                horizon=int(c["horizonMinutes"]),
                region=c["region"],
                target_coverage_pct=c["targetCoveragePct"],
                actual_coverage_pct=c["actualCoveragePct"],
                calibration_error_pct=c["calibrationErrorPct"],
                confidence_score=c["confidenceScore"],
                status=c["status"],
                fallback_model=c["fallbackModel"],
                as_of=as_of,
            )
        )
    db.execute(delete(PolicySummary))
    for p in pd.read_csv(results_dir / "policy_summary.csv").to_dict("records"):
        db.add(
            PolicySummary(
                policy=p["policy"],
                label=p["policyLabel"],
                sla_violation_minutes=int(p["slaViolationMinutes"]),
                overload_events=int(p["overloadEvents"]),
                underutilization_events=int(p["underutilizationEvents"]),
                scaling_oscillations=int(p["scalingOscillations"]),
                infrastructure_cost_usd=float(p["infrastructureCostUsd"]),
                model_inference_cost_usd=float(p["modelInferenceCostUsd"]),
                total_cost_usd=float(p["totalCostUsd"]),
                avg_utilization_pct=float(p["avgUtilizationPct"]),
            )
        )
    db.commit()
    return {"benchmarks": len(bench), "asOf": as_of.astimezone(timezone.utc).isoformat()}
