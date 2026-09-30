"""Forecast accuracy, calibration and serving-cost metrics."""

from __future__ import annotations

import numpy as np

# On-demand prices (USD/hour, us-east-1, 2026 list) used to cost inference.
HOST_PRICE_PER_HOUR = {
    "fargate-1vcpu": 0.0494,  # 1 vCPU + 2 GB Fargate task
    "sagemaker-ml.c6i.xlarge": 0.238,
    "sagemaker-ml.g5.xlarge": 1.408,
}
# Share of a host a model's endpoint occupies when kept warm for the planner.
HOST_SHARE = {"fargate-1vcpu": 0.25, "sagemaker-ml.c6i.xlarge": 1.0, "sagemaker-ml.g5.xlarge": 1.0}
# Runtime overhead (framework + interpreter) added to artefact size, MB.
RUNTIME_OVERHEAD_MB = {"seasonal-naive": 18, "xgboost": 85, "lstm": 135}


def mae(y, p):
    return float(np.nanmean(np.abs(y - p)))


def rmse(y, p):
    return float(np.sqrt(np.nanmean((y - p) ** 2)))


def smape(y, p):
    return float(np.nanmean(2 * np.abs(y - p) / (np.abs(y) + np.abs(p) + 1e-9)) * 100)


def mase(y, p, scale):
    return float(np.nanmean(np.abs(y - p)) / scale)


def coverage(y, upper):
    ok = ~np.isnan(y) & ~np.isnan(upper)
    return float(np.mean(y[ok] <= upper[ok]) * 100)


def seasonal_scale(y_train: np.ndarray, season: int) -> float:
    """MASE denominator: in-sample MAE of the seasonal-naive forecast."""
    return float(np.nanmean(np.abs(y_train[season:] - y_train[:-season])))


def cost_per_1k(latency_ms: float, host: str) -> float:
    return latency_ms / 1000 * 1000 * HOST_PRICE_PER_HOUR[host] / 3600


def daily_hosting_cost(host: str) -> float:
    return HOST_PRICE_PER_HOUR[host] * HOST_SHARE[host] * 24
