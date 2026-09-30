"""Simulated AWS Cost Explorer.

Costs come from simulated unit-hours × the on-demand pricing table in
``capplan_ml.config``; responses follow the shapes of
``ce:GetCostAndUsage`` and ``ce:GetCostForecast`` so a real Cost Explorer
client could replace this module.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import numpy as np

SERVICE_LABELS = {
    "ecs-task": "Amazon Elastic Container Service",
    "ec2-asg": "Amazon Elastic Compute Cloud - Compute",
    "origin-capacity": "Amazon CloudFront (origin shield)",
    "transcoding-worker": "AWS Elemental MediaLive",
    "inference": "Amazon SageMaker",
}


def _period(d: date, days: int = 1) -> dict:
    return {"Start": d.isoformat(), "End": (d + timedelta(days=days)).isoformat()}


def _amount(v: float) -> dict:
    return {"Amount": f"{v:.2f}", "Unit": "USD"}


def get_cost_and_usage(rows: list[dict], group_by: str | None = None) -> dict:
    """``rows``: dicts with ``day`` (date), ``region`` and per-service cost keys."""
    by_day: dict[date, list[dict]] = {}
    for r in rows:
        by_day.setdefault(r["day"], []).append(r)
    results = []
    for d in sorted(by_day):
        items = by_day[d]
        total = sum(sum(v for k, v in i["services"].items()) for i in items)
        entry = {"TimePeriod": _period(d), "Total": {"UnblendedCost": _amount(total)}, "Groups": [], "Estimated": False}
        if group_by == "SERVICE":
            agg: dict[str, float] = {}
            for i in items:
                for k, v in i["services"].items():
                    agg[k] = agg.get(k, 0) + v
            entry["Groups"] = [{"Keys": [SERVICE_LABELS.get(k, k)], "Metrics": {"UnblendedCost": _amount(v)}} for k, v in agg.items()]
        elif group_by == "REGION":
            agg = {}
            for i in items:
                agg[i["region"]] = agg.get(i["region"], 0) + sum(i["services"].values())
            entry["Groups"] = [{"Keys": [k], "Metrics": {"UnblendedCost": _amount(v)}} for k, v in agg.items()]
        results.append(entry)
    return {"GroupDefinitions": [{"Type": "DIMENSION", "Key": group_by}] if group_by else [], "ResultsByTime": results}


def get_cost_forecast(history: list[tuple[date, float]], start: date, days: int, confidence: int = 80) -> dict:
    """Daily cost forecast from recent history: linear trend on the last
    ``len(history)`` days, prediction interval from residual spread."""
    if not history:
        return {"Total": _amount(0), "ForecastResultsByTime": []}
    y = np.array([v for _, v in history], dtype=float)
    x = np.arange(len(y), dtype=float)
    if len(y) >= 3:
        slope, intercept = np.polyfit(x, y, 1)
        resid = y - (slope * x + intercept)
        sd = float(np.std(resid, ddof=1)) if len(y) > 2 else 0.0
        # Damp the trend so a single busy week doesn't extrapolate wildly.
        slope *= 0.5
    else:
        slope, intercept, sd = 0.0, float(y.mean()), float(y.std())
    z = {80: 1.2816, 95: 1.96}.get(confidence, 1.2816)
    out, total = [], 0.0
    for i in range(days):
        mean = max(0.0, intercept + slope * (len(y) + i))
        width = z * sd * np.sqrt(1 + (i + 1) / len(y))
        total += mean
        out.append(
            {
                "TimePeriod": _period(start + timedelta(days=i)),
                "MeanValue": f"{mean:.2f}",
                "PredictionIntervalLowerBound": f"{max(0.0, mean - width):.2f}",
                "PredictionIntervalUpperBound": f"{mean + width:.2f}",
            }
        )
    return {"Total": _amount(total), "ForecastResultsByTime": out, "PredictionIntervalLevel": confidence}


def as_date(v) -> date:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return datetime.fromisoformat(str(v)).date()
