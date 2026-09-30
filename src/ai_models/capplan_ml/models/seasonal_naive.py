"""Seasonal-naive baseline: the value at the same 5-minute slot yesterday.

P90 = P50 x exp(q90 of in-sample log residuals), estimated per lead."""

from __future__ import annotations

import numpy as np

from .. import config
from ..features import RegionSeries, _take
from .base import LEADS, Forecast, Forecaster, ModelProfile


class SeasonalNaive(Forecaster):
    name = "seasonal-naive"
    kind = "baseline"
    profile = ModelProfile(host="fargate-1vcpu")

    def __init__(self, season: int = config.STEPS_PER_DAY):
        self.season = season
        self.q90 = np.full(config.MAX_LEAD, 0.1)

    def _p50(self, s: RegionSeries, origins: np.ndarray) -> np.ndarray:
        idx = origins[:, None] + LEADS[None, :] - self.season
        p50 = _take(s.y, idx)
        # Fall back to persistence if yesterday is unavailable.
        return np.where(np.isnan(p50), s.y[origins][:, None], p50)

    def fit(self, series):
        errs = []
        for s in series.values():
            o = s.indices("train")
            o = o[(o >= self.season) & (o + config.MAX_LEAD < len(s))]
            p50 = self._p50(s, o)
            actual = _take(s.y, o[:, None] + LEADS[None, :])
            errs.append(np.log(actual) - np.log(p50))
        self.q90 = np.nanquantile(np.concatenate(errs), 0.9, axis=0)
        return self

    def predict(self, s, origins):
        p50 = self._p50(s, origins)
        return Forecast(p50=p50, p90=p50 * np.exp(np.maximum(self.q90, 0))[None, :])

    def artifact_mb(self):
        return 0.01
