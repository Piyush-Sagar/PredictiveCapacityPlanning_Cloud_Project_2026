"""Common forecaster interface.

A forecaster maps (series, origins) to P50/P90 paths for leads 1..MAX_LEAD
(5-minute steps, i.e. up to the 60-minute horizon). Values are in the series'
own units (thousand concurrent viewers).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .. import config
from ..features import RegionSeries

Z90 = 1.2815515655446004


@dataclass
class Forecast:
    p50: np.ndarray  # (n_origins, MAX_LEAD)
    p90: np.ndarray


@dataclass(frozen=True)
class ModelProfile:
    """Serving characteristics reported in the benchmark."""

    latency_ms: float | None = None  # None → measured
    memory_mb: float | None = None
    host: str = "fargate-1vcpu"  # pricing key, see metrics.HOST_PRICE_PER_HOUR
    simulated: bool = False


class Forecaster:
    name: str = "base"
    kind: str = "baseline"  # or "foundation"
    profile = ModelProfile()

    def fit(self, series: dict[str, RegionSeries]) -> "Forecaster":
        return self

    def predict(self, s: RegionSeries, origins: np.ndarray) -> Forecast:
        raise NotImplementedError

    # Artefact size in MB for the memory-footprint column (baselines).
    def artifact_mb(self) -> float:
        return 0.0


def residual_log_quantile(errors: np.ndarray, q: float = 0.9) -> np.ndarray:
    """Per-lead quantile of log errors (actual - forecast), shape (MAX_LEAD,)."""
    return np.nanquantile(errors, q, axis=0)


LEADS = np.arange(1, config.MAX_LEAD + 1)
