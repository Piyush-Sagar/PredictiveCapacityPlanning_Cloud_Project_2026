import numpy as np
import pytest
import pandas as pd

from capplan_ml import config, metrics
from capplan_ml.data import generate_raw, start_time
from capplan_ml.features import origin_features, preprocess, to_series


def test_metrics():
    y = np.array([10.0, 20.0, 30.0])
    p = np.array([12.0, 18.0, 30.0])
    assert metrics.mae(y, p) == 4 / 3
    assert round(metrics.rmse(y, p), 4) == round(np.sqrt(8 / 3), 4)
    assert metrics.coverage(y, np.array([11, 19, 31])) == pytest.approx(200 / 3)
    assert metrics.smape(y, y) == 0


def test_preprocess_validates_resamples_and_flags():
    raw, events = generate_raw(days=3, seed=7)
    df, report = preprocess(raw, events, pd.Timestamp(start_time()))
    assert report["invalid_values_removed"] > 0
    assert df["viewers_k"].notna().all() and df["cpu_util_percent"].between(0, 100).all()
    assert len(df) == 3 * config.STEPS_PER_DAY * len(config.REGIONS)
    assert {"sched_live", "flash_crowd", "was_missing", "outlier_flag", "split"} <= set(df.columns)


def test_origin_features_are_causal():
    raw, events = generate_raw(days=3, seed=7)
    df, _ = preprocess(raw, events, pd.Timestamp(start_time()))
    s = to_series(df)["us-east"]
    origins = np.array([400, 500])
    before = origin_features(s, origins)
    s.y = s.y.copy()
    s.y[501:] *= 5  # tamper with the future
    after = origin_features(s, origins)
    for k in before:
        np.testing.assert_allclose(before[k], after[k])


def test_backtest_outputs_are_sane(artifacts):
    bench = pd.read_csv(artifacts.RESULTS_DIR / "benchmark.csv")
    h15 = bench[bench.horizonMinutes == 15].set_index("modelName")
    assert set(h15.index) == set(config.ALL_MODELS)
    # Trained baselines beat seasonal-naive; seasonal-naive MASE is ~1.
    assert h15.loc["xgboost", "smape"] < h15.loc["seasonal-naive", "smape"]
    assert h15.loc["lstm", "smape"] < h15.loc["seasonal-naive", "smape"]
    assert 0.8 < h15.loc["seasonal-naive", "mase"] < 1.5
    assert bench["p90CoveragePct"].between(80, 100).all()
    assert bench.loc[bench.modelType == "foundation", "simulated"].all()
    policies = pd.read_csv(artifacts.RESULTS_DIR / "policy_summary.csv").set_index("policy")
    best_pred = policies[policies.index.str.startswith("predictive") & policies.index.str.endswith("p90")]
    assert best_pred["slaViolationMinutes"].min() < policies.loc["reactive", "slaViolationMinutes"]
    assert best_pred["totalCostUsd"].min() < policies.loc["reactive", "totalCostUsd"]
