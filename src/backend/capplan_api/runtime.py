"""In-process state: the processed telemetry, trained forecasters and
backtest outputs, plus per-account views of the telemetry.

An account's telemetry is the base trace scaled by the account's size with a
small, deterministic account-specific perturbation, so different accounts see
related but not identical demand.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from capplan_ml import config
from capplan_ml.features import RegionSeries, to_series
from capplan_ml.models import Forecaster
from capplan_ml.pipeline import load_models, load_processed, run_backtest, run_data

log = logging.getLogger("capplan.runtime")


@dataclass
class AccountView:
    series: dict[str, RegionSeries]


class Runtime:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.loaded = False

    # ------------------------------------------------------------------ loading
    def ensure_artifacts(self, auto_bootstrap: bool) -> None:
        processed = config.PROCESSED_DIR / "telemetry_5min.parquet"
        models = config.ARTIFACTS_DIR / "models.pkl"
        summary = config.RESULTS_DIR / "summary.json"
        if not processed.exists():
            if not auto_bootstrap:
                raise RuntimeError("processed dataset missing; run `make data`")
            log.info("generating dataset …")
            run_data()
        if not models.exists() or not summary.exists():
            if not auto_bootstrap:
                raise RuntimeError("model artefacts missing; run `make backtest`")
            log.info("running backtest (first start) …")
            run_backtest(verbose=False)

    def load(self, auto_bootstrap: bool = True) -> None:
        self.ensure_artifacts(auto_bootstrap)
        df = load_processed()
        self.base: dict[str, RegionSeries] = to_series(df)
        ts0 = self.base[config.REGIONS[0]].ts
        for s in self.base.values():
            if len(s.ts) != len(ts0) or (s.ts != ts0).any():
                raise RuntimeError("regions are not aligned on a common 5-minute grid")
        self.ts = pd.to_datetime(ts0, utc=True)
        self.split = self.base[config.REGIONS[0]].split
        self.models: dict[str, Forecaster] = load_models()
        self.summary = json.loads((config.RESULTS_DIR / "summary.json").read_text())
        self.selection: dict[int, str] = {int(k): v for k, v in self.summary["selection"].items()}
        self.bench = pd.read_csv(config.RESULTS_DIR / "benchmark.csv")
        seg_path = config.RESULTS_DIR / "benchmark_segments.csv"
        self.segments = pd.read_csv(seg_path) if seg_path.exists() else pd.DataFrame()
        self.confidence = json.loads((config.RESULTS_DIR / "confidence.json").read_text())
        self.policy_daily = pd.read_csv(config.RESULTS_DIR / "policy_daily.csv")
        self.policy_summary = pd.read_csv(config.RESULTS_DIR / "policy_summary.csv")
        manifest = config.PROCESSED_DIR / "manifest.json"
        self.manifest = json.loads(manifest.read_text()) if manifest.exists() else {}
        live = np.flatnonzero(self.split == "live")
        self.live_start, self.live_end = int(live[0]), int(live[-1])
        self._views: dict[str, AccountView] = {}
        self.loaded = True
        log.info("runtime loaded: %d steps, selection=%s", len(self.ts), self.selection)

    # ------------------------------------------------------------------ helpers
    @property
    def planning_model(self) -> str:
        return self.selection[15]

    def live_models(self) -> list[str]:
        """Models run every tick: the selected ones plus the fallback."""
        return sorted(set(self.selection.values()) | {"seasonal-naive"})

    def index_of(self, when: datetime) -> int:
        target = pd.Timestamp(when).tz_convert("UTC") if pd.Timestamp(when).tzinfo else pd.Timestamp(when, tz="UTC")
        idx = int(self.ts.searchsorted(target))
        return min(max(idx, 0), len(self.ts) - 1)

    def time_at(self, idx: int) -> datetime:
        return self.ts[idx].to_pydatetime().astimezone(timezone.utc)

    def last_valid_cursor(self) -> int:
        return len(self.ts) - config.MAX_LEAD - 1

    def view(self, account_id: str, scale: float) -> AccountView:
        with self.lock:
            v = self._views.get(account_id)
            if v is None:
                seed = int(hashlib.sha256(account_id.encode()).hexdigest()[:8], 16)
                rng = np.random.default_rng(seed)
                series = {}
                n = len(self.ts)
                for region, s in self.base.items():
                    # Smooth account-specific perturbation (±~4%) around the shared trace.
                    walk = np.cumsum(rng.normal(0, 0.004, n))
                    walk = walk - pd.Series(walk).rolling(288, min_periods=1).mean().to_numpy()
                    series[region] = s.scaled(scale, np.exp(np.clip(walk, -0.08, 0.08)))
                v = AccountView(series=series)
                self._views[account_id] = v
            return v

    def forget(self, account_id: str) -> None:
        with self.lock:
            self._views.pop(account_id, None)


runtime = Runtime()
