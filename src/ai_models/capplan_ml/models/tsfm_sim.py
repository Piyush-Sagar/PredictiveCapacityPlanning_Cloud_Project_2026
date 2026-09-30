"""SIMULATED time-series foundation models (Chronos, TimesFM, Moirai, TTM).

No foundation-model weights are downloaded or executed. Each adapter emulates
a zero-shot TSFM with a documented error profile:

* P50 is a log-space blend of a zero-shot seasonal prior (yesterday's shape,
  re-levelled to the current observation) and the realised future. The weight
  on the realised future decays with lead time and drops sharply during
  unscheduled flash crowds, so the emulator lags genuine surprises just as a
  real model would.
* Correlated log-normal noise is added along the path (seeded per origin, so
  results are deterministic).
* P90 widens with the expected error and a per-model calibration factor
  (<1 = under-dispersed, >1 = conservative).
* Latency, memory and hosting are taken from the profile rather than measured.

Every result from these adapters carries ``simulated=True``; see the README.
Replacing an emulator with a real model means implementing ``predict`` with
the same signature (e.g. ``chronos.BaseChronosPipeline.predict_quantiles``).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .. import config
from ..features import DAY, RegionSeries, _take
from .base import LEADS, Z90, Forecast, Forecaster, ModelProfile


@dataclass(frozen=True)
class TSFMErrorProfile:
    w0: float  # weight on realised future at lead 1
    decay: float  # per-lead decay of that weight
    noise_sd: float  # log-noise sd at lead 1
    noise_growth: float  # added sd per lead
    bias: float  # log bias
    calib: float  # P90 width factor
    surprise_penalty: float  # weight lost during unscheduled flash crowds
    rho: float = 0.6  # noise correlation along the path


PROFILES: dict[str, tuple[TSFMErrorProfile, ModelProfile]] = {
    # Chronos-Bolt (small): strong zero-shot accuracy, well calibrated quantiles.
    "chronos": (
        TSFMErrorProfile(0.80, 0.022, 0.018, 0.0018, 0.000, 1.00, 0.35),
        ModelProfile(latency_ms=140, memory_mb=620, host="sagemaker-ml.g5.xlarge", simulated=True),
    ),
    # TimesFM 2.0: fast direct multi-horizon decoding, slightly narrow intervals.
    "timesfm": (
        TSFMErrorProfile(0.78, 0.024, 0.019, 0.0020, 0.004, 0.90, 0.38),
        ModelProfile(latency_ms=95, memory_mb=410, host="sagemaker-ml.g5.xlarge", simulated=True),
    ),
    # Moirai (base): multivariate any-variate attention, heavier and a bit conservative.
    "moirai": (
        TSFMErrorProfile(0.76, 0.026, 0.020, 0.0021, -0.003, 1.08, 0.36),
        ModelProfile(latency_ms=180, memory_mb=780, host="sagemaker-ml.g5.xlarge", simulated=True),
    ),
    # Tiny Time Mixers: ~1M params, CPU friendly, weaker on rare spikes.
    "ttm": (
        TSFMErrorProfile(0.72, 0.028, 0.022, 0.0024, 0.002, 0.92, 0.45),
        ModelProfile(latency_ms=60, memory_mb=260, host="sagemaker-ml.c6i.xlarge", simulated=True),
    ),
}


class SimulatedTSFM(Forecaster):
    kind = "foundation"

    def __init__(self, name: str):
        self.name = name
        self.err, self.profile = PROFILES[name]
        self.prior_sd = np.full(config.MAX_LEAD, 0.08)
        self._model_id = config.FOUNDATION_MODELS.index(name) + 1

    def _prior(self, s: RegionSeries, origins: np.ndarray) -> np.ndarray:
        """Zero-shot seasonal prior: yesterday's path re-levelled to now."""
        ly = s.logy
        cur = ly[origins][:, None]
        fwd = origins[:, None] + LEADS[None, :]
        shape = _take(ly, fwd - DAY) - _take(ly, origins - DAY)[:, None]
        return cur + np.nan_to_num(shape)

    def fit(self, series):
        # Zero-shot: nothing is trained. We only estimate the prior's spread so
        # the emulated interval width is on the right scale for this data.
        errs = []
        for s in series.values():
            o = s.indices("train")
            o = o[(o >= DAY) & (o + config.MAX_LEAD < len(s))]
            errs.append(_take(s.logy, o[:, None] + LEADS[None, :]) - self._prior(s, o))
        self.prior_sd = np.nanstd(np.concatenate(errs), axis=0)
        return self

    def _smooth_noise(self, region: str, origins: np.ndarray) -> np.ndarray:
        """Deterministic unit-variance noise that is smooth across origins (as
        consecutive forecasts from a real model are) and correlated along the
        path: a random-phase sum of sinusoids with 30-min to 8-h periods."""
        e = self.err
        rng = np.random.default_rng([config.SEED, self._model_id, config.REGIONS.index(region) + 1])
        periods = rng.uniform(6, 96, size=(config.MAX_LEAD + 1, 6))
        phases = rng.uniform(0, 2 * np.pi, size=(config.MAX_LEAD + 1, 6))
        t = origins.astype(float)[:, None, None]
        waves = np.sin(2 * np.pi * t / periods[None] + phases[None]).sum(axis=-1) / np.sqrt(3.0)
        common, own = waves[:, :1], waves[:, 1:]
        return e.rho * common + np.sqrt(1 - e.rho**2) * own

    def predict(self, s: RegionSeries, origins: np.ndarray) -> Forecast:
        e = self.err
        prior = self._prior(s, origins)
        fwd = origins[:, None] + LEADS[None, :]
        truth = _take(s.logy, fwd)
        truth = np.where(np.isnan(truth), prior, truth)  # beyond available data
        # Surprise = flash crowd not on the scheduled calendar.
        surprise = (_take(s.flash_crowd, fwd) > 0) & (_take(s.sched_live, fwd) + _take(s.sched_release, fwd) == 0)
        w = np.clip(e.w0 - e.decay * (LEADS - 1), 0.05, 0.95)[None, :] - e.surprise_penalty * surprise
        w = np.clip(w, 0.0, 0.95)

        sd = e.noise_sd + e.noise_growth * (LEADS - 1)
        noise = sd[None, :] * self._smooth_noise(s.region, origins)
        logp50 = w * truth + (1 - w) * prior + e.bias + noise
        exp_sd = np.sqrt(((1 - w) * self.prior_sd[None, :]) ** 2 + sd[None, :] ** 2)
        logp90 = logp50 + Z90 * e.calib * exp_sd
        return Forecast(p50=np.exp(logp50), p90=np.exp(logp90))


def all_simulated() -> list[SimulatedTSFM]:
    return [SimulatedTSFM(n) for n in config.FOUNDATION_MODELS]
