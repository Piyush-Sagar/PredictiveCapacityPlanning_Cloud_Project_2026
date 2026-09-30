"""XGBoost quantile regression (alpha 0.5 and 0.9) on the shared feature layer.

A single direct multi-horizon model: (origin, lead) rows are stacked with
``lead`` as a feature, and the target is log(y[t+lead]/y[t]) so the model is
scale-invariant across regions and accounts."""

from __future__ import annotations

import numpy as np
import xgboost as xgb

from .. import config
from ..features import RegionSeries, supervised_matrix
from .base import LEADS, Forecast, Forecaster, ModelProfile

WARMUP = config.STEPS_PER_DAY  # need one day of history for seasonal lags


class XGBoostQuantile(Forecaster):
    name = "xgboost"
    kind = "baseline"
    profile = ModelProfile(host="fargate-1vcpu")

    def __init__(self, n_estimators: int = 400, seed: int = config.SEED):
        self.params = dict(
            objective="reg:quantileerror",
            quantile_alpha=np.array([0.5, 0.9]),
            tree_method="hist",
            learning_rate=0.05,
            max_depth=6,
            min_child_weight=5,
            subsample=0.8,
            colsample_bytree=0.8,
            seed=seed,
            nthread=4,
        )
        self.n_estimators = n_estimators
        self.booster: xgb.Booster | None = None
        self.columns: list[str] | None = None

    def _xy(self, series, split):
        Xs, ys = [], []
        for s in series.values():
            o = s.indices(split)
            o = o[(o >= WARMUP) & (o + config.MAX_LEAD < len(s))]
            X, y = supervised_matrix(s, o, LEADS)
            Xs.append(X)
            ys.append(y)
        import pandas as pd

        return pd.concat(Xs, ignore_index=True), np.concatenate(ys)

    def fit(self, series):
        Xtr, ytr = self._xy(series, "train")
        Xva, yva = self._xy(series, "val")
        self.columns = list(Xtr.columns)
        dtr = xgb.DMatrix(Xtr, label=ytr)
        dva = xgb.DMatrix(Xva, label=yva)
        self.booster = xgb.train(
            self.params,
            dtr,
            num_boost_round=self.n_estimators,
            evals=[(dva, "val")],
            early_stopping_rounds=40,
            verbose_eval=False,
        )
        return self

    def predict(self, s: RegionSeries, origins: np.ndarray) -> Forecast:
        X, _ = supervised_matrix(s, origins, LEADS)
        pred = self.booster.predict(
            xgb.DMatrix(X[self.columns]), iteration_range=(0, self.booster.best_iteration + 1)
        )
        n = len(origins)
        # Rows are stacked lead-major: [lead1 * n, lead2 * n, ...]
        q50 = pred[:, 0].reshape(config.MAX_LEAD, n).T
        q90 = np.maximum(pred[:, 1].reshape(config.MAX_LEAD, n).T, q50)
        level = s.y[origins][:, None]
        return Forecast(p50=level * np.exp(q50), p90=level * np.exp(q90))

    def artifact_mb(self):
        return len(self.booster.save_raw()) / 1e6 if self.booster else 0.0

    def save(self, path):
        self.booster.save_model(str(path))
