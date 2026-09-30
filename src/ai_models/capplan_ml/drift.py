"""Model confidence, calibration drift and fallback rules."""

from __future__ import annotations

import numpy as np

from . import config

FOUNDATION_DEGRADED = 6.0
FOUNDATION_FALLBACK = 11.0
BASELINE_DEGRADED = 9.0
MAX_MISSING_FRACTION = 0.3


def calibration_status(model: str, calibration_error_pct: float, missing_fraction: float = 0.0):
    """Returns (status, fallback_model)."""
    if missing_fraction > MAX_MISSING_FRACTION and model != "seasonal-naive":
        return "fallback", "seasonal-naive"
    if model == "seasonal-naive":
        return "nominal", None
    if model in config.FOUNDATION_MODELS:
        if calibration_error_pct > FOUNDATION_FALLBACK:
            return "fallback", "seasonal-naive"
        if calibration_error_pct > FOUNDATION_DEGRADED:
            return "degraded", None
        return "nominal", None
    if calibration_error_pct > BASELINE_DEGRADED:
        return "degraded", None
    return "nominal", None


def confidence_score(model: str, calibration_error_pct: float, smape: float | None = None) -> int:
    penalty = 6 if model in config.BASELINE_MODELS else 0
    score = 100 - calibration_error_pct * 3.4 - penalty - (0.8 * smape if smape is not None else 0)
    return int(max(0, min(100, round(score))))


def rolling_coverage(actual: np.ndarray, p90: np.ndarray, window: int = 48) -> float | None:
    ok = ~np.isnan(actual) & ~np.isnan(p90)
    a, u = actual[ok][-window:], p90[ok][-window:]
    if len(a) < 6:
        return None
    return float(np.mean(a <= u) * 100)
