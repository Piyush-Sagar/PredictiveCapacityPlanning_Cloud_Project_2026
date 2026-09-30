"""End-to-end offline pipeline: data → features → fit → backtest → model
selection → policy simulation → results + artefacts.

    python -m capplan_ml.pipeline data       # generate + preprocess
    python -m capplan_ml.pipeline backtest   # fit, evaluate, simulate
    python -m capplan_ml.pipeline all
"""

from __future__ import annotations

import argparse
import json
import pickle
import time
from pathlib import Path

import numpy as np
import pandas as pd

from . import config, drift, metrics
from .data import generate_raw, split_bounds, start_time, write_raw
from .features import DAY, RegionSeries, _take, preprocess, to_series
from .models import Forecaster, build_all
from .models.base import LEADS
from .simulator import default_policies, simulate

PROCESSED_FILE = "telemetry_5min.parquet"


# --------------------------------------------------------------------------- data stage


def run_data(source: str = "synthetic", base_shape: np.ndarray | None = None) -> dict:
    raw, events = generate_raw(base_shape=base_shape)
    meta = write_raw(raw, events, source)
    df, report = preprocess(raw, events, pd.Timestamp(start_time()))
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(config.PROCESSED_DIR / PROCESSED_FILE, index=False)
    bounds = {k: [str(a), str(b)] for k, (a, b) in split_bounds().items()}
    manifest = {"raw": meta, "preprocessing": report, "splits": bounds, "file": PROCESSED_FILE}
    (config.PROCESSED_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def load_processed() -> pd.DataFrame:
    path = config.PROCESSED_DIR / PROCESSED_FILE
    if not path.exists():
        run_data()
    return pd.read_parquet(path)


def load_events() -> pd.DataFrame:
    return pd.read_csv(config.RAW_DIR / "events.csv", parse_dates=["start", "end"])


# --------------------------------------------------------------------------- backtest stage


def _test_origins(s: RegionSeries) -> np.ndarray:
    o = s.indices("test")
    return o[o + config.MAX_LEAD < len(s)]


def _measure_latency_ms(model: Forecaster, s: RegionSeries, origin: int, reps: int = 25) -> float:
    o = np.array([origin])
    model.predict(s, o)
    times = []
    for _ in range(reps):
        t0 = time.perf_counter()
        model.predict(s, o)
        times.append((time.perf_counter() - t0) * 1000)
    return float(np.median(times))


def select_models(bench: pd.DataFrame) -> dict[int, str]:
    """Capacity-first selection: accuracy, penalised for poor P90 coverage and slow inference."""
    out = {}
    for h, g in bench.groupby("horizonMinutes"):
        score = (
            g["smape"] * (1 + np.maximum(0, 87 - g["p90CoveragePct"]) / 10)
            + 0.004 * g["inferenceLatencyMs"]
        )
        out[int(h)] = str(g.loc[score.idxmin(), "modelName"])
    return out


def run_backtest(verbose: bool = True) -> dict:
    log = print if verbose else (lambda *a, **k: None)
    df = load_processed()
    series = to_series(df)
    models = build_all()

    fit_seconds = {}
    for m in models:
        t0 = time.perf_counter()
        m.fit(series)
        fit_seconds[m.name] = round(time.perf_counter() - t0, 2)
        log(f"fitted {m.name:15s} in {fit_seconds[m.name]:6.2f}s")

    origins = {r: _test_origins(s) for r, s in series.items()}
    cubes: dict[str, dict[str, dict[str, np.ndarray]]] = {r: {} for r in series}
    latency = {}
    for m in models:
        for r, s in series.items():
            f = m.predict(s, origins[r])
            cubes[r][m.name] = {"p50": f.p50, "p90": f.p90}
        if m.profile.latency_ms is not None:
            latency[m.name] = m.profile.latency_ms
        else:
            s0 = series[config.REGIONS[0]]
            latency[m.name] = round(_measure_latency_ms(m, s0, int(origins[config.REGIONS[0]][0])), 3)

    # ---- accuracy / calibration
    rows, seg_rows, conf_rows = [], [], []
    for m in models:
        for h in config.HORIZONS:
            k = config.HORIZON_STEPS[h]
            ys, p50s, p90s, flash, per_region = [], [], [], [], {}
            scale_num = []
            for r, s in series.items():
                o = origins[r]
                y = s.y[o + k]
                ys.append(y)
                p50s.append(cubes[r][m.name]["p50"][:, k - 1])
                p90s.append(cubes[r][m.name]["p90"][:, k - 1])
                flash.append(s.flash_crowd[o + k] > 0)
                per_region[r] = metrics.coverage(y, cubes[r][m.name]["p90"][:, k - 1])
                tr = s.indices("train")
                scale_num.append(metrics.seasonal_scale(s.y[tr], DAY) / config.REGION_BASE_LOAD[r])
            y, p50, p90, fl = map(np.concatenate, (ys, p50s, p90s, flash))
            # MASE per region-normalised scale so large regions don't dominate.
            region_norm = np.concatenate([np.full(len(origins[r]), config.REGION_BASE_LOAD[r]) for r in series])
            mase_scale = float(np.mean(scale_num))
            host = m.profile.host
            mem = m.profile.memory_mb or round(m.artifact_mb() + metrics.RUNTIME_OVERHEAD_MB.get(m.name, 50))
            row = {
                "modelName": m.name,
                "modelType": m.kind,
                "horizonMinutes": h,
                "mae": round(metrics.mae(y, p50), 2),
                "rmse": round(metrics.rmse(y, p50), 2),
                "smape": round(metrics.smape(y, p50), 2),
                "mase": round(metrics.mase(y / region_norm, p50 / region_norm, mase_scale), 3),
                "p90CoveragePct": round(metrics.coverage(y, p90), 1),
                "inferenceLatencyMs": latency[m.name],
                "costPer1kInferencesUsd": round(metrics.cost_per_1k(latency[m.name], host), 6),
                "memoryFootprintMb": int(mem),
                "simulated": bool(m.profile.simulated),
                "host": host,
                "fitSeconds": fit_seconds[m.name],
            }
            rows.append(row)
            for seg, mask in (("normal", ~fl), ("flash-crowd", fl)):
                if mask.sum() == 0:
                    continue
                seg_rows.append(
                    {
                        "modelName": m.name,
                        "horizonMinutes": h,
                        "segment": seg,
                        "n": int(mask.sum()),
                        "mae": round(metrics.mae(y[mask], p50[mask]), 2),
                        "smape": round(metrics.smape(y[mask], p50[mask]), 2),
                        "p90CoveragePct": round(metrics.coverage(y[mask], p90[mask]), 1),
                    }
                )
            worst_region = min(per_region, key=per_region.get)
            cal_err = round(abs(config.TARGET_COVERAGE_PCT - row["p90CoveragePct"]), 1)
            status, fallback = drift.calibration_status(m.name, cal_err)
            conf_rows.append(
                {
                    "modelName": m.name,
                    "horizonMinutes": h,
                    "region": worst_region,
                    "targetCoveragePct": config.TARGET_COVERAGE_PCT,
                    "actualCoveragePct": row["p90CoveragePct"],
                    "calibrationErrorPct": cal_err,
                    "confidenceScore": drift.confidence_score(m.name, cal_err),
                    "status": status,
                    "fallbackModel": fallback,
                    "regionCoverage": {k2: round(v, 1) for k2, v in per_region.items()},
                }
            )

    bench = pd.DataFrame(rows)
    segments = pd.DataFrame(seg_rows)
    selection = select_models(bench)
    log("\nmodel selection:", selection)

    # ---- closed-loop policy simulation over the test week
    ranked = bench[bench.horizonMinutes == 15].sort_values("smape")["modelName"].tolist()
    sim_models = [selection[15]] + [m for m in ranked if m != selection[15]]
    policies = default_policies(sim_models)
    hosts = {m.name: m.profile.host for m in models}
    daily, summary = simulate(series, origins, cubes, policies, hosts)
    log("\npolicy summary (test week):")
    log(summary[["policy", "slaViolationMinutes", "scalingOscillations", "totalCostUsd"]].to_string(index=False))

    # ---- persist
    config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    config.ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    bench.to_csv(config.RESULTS_DIR / "benchmark.csv", index=False)
    segments.to_csv(config.RESULTS_DIR / "benchmark_segments.csv", index=False)
    daily.to_csv(config.RESULTS_DIR / "policy_daily.csv", index=False)
    summary.to_csv(config.RESULTS_DIR / "policy_summary.csv", index=False)
    (config.RESULTS_DIR / "confidence.json").write_text(json.dumps(conf_rows, indent=2))
    summary_json = {
        "selection": {str(k): v for k, v in selection.items()},
        "primaryModel": selection[15],
        "systemPolicy": f"predictive-{selection[15]}-p90",
        "fitSeconds": fit_seconds,
        "testStart": str(pd.Timestamp(series[config.REGIONS[0]].ts[origins[config.REGIONS[0]][0]])),
        "testEnd": str(pd.Timestamp(series[config.REGIONS[0]].ts[origins[config.REGIONS[0]][-1]])),
        "simulatedModels": [m.name for m in models if m.profile.simulated],
    }
    (config.RESULTS_DIR / "summary.json").write_text(json.dumps(summary_json, indent=2))
    with open(config.ARTIFACTS_DIR / "models.pkl", "wb") as fh:
        pickle.dump({m.name: m for m in models}, fh)
    _plots(series, origins, cubes, bench, summary, selection[15])
    return summary_json


def load_models(path: Path | None = None) -> dict[str, Forecaster]:
    with open(path or config.ARTIFACTS_DIR / "models.pkl", "rb") as fh:
        return pickle.load(fh)


def _plots(series, origins, cubes, bench, summary, primary):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = config.RESULTS_DIR
    # Forecast example: busiest test day in us-east, 15-minute horizon.
    s = series["us-east"]
    o = origins["us-east"]
    k = config.HORIZON_STEPS[15]
    day = pd.to_datetime(s.ts[o]).floor("D")
    busiest = pd.Series(s.y[o]).groupby(day).max().idxmax()
    mask = day == busiest
    x = pd.to_datetime(s.ts[o + k])[mask]
    fig, ax = plt.subplots(figsize=(11, 4))
    ax.plot(x, s.y[o + k][mask], color="black", lw=1.2, label="actual")
    for name, color in ((primary, "tab:blue"), ("xgboost", "tab:orange")):
        c = cubes["us-east"][name]
        ax.plot(x, c["p50"][mask, k - 1], color=color, lw=1, label=f"{name} P50")
        ax.fill_between(x, c["p50"][mask, k - 1], c["p90"][mask, k - 1], color=color, alpha=0.15, label=f"{name} P50–P90")
    ax.set_title(f"us-east 15-minute-ahead forecast, {busiest:%Y-%m-%d}")
    ax.set_ylabel("concurrent viewers (k)")
    ax.legend(loc="upper left", fontsize=8)
    fig.tight_layout()
    fig.savefig(out / "forecast_us-east_15m.png", dpi=120)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(9, 4))
    piv = bench.pivot(index="modelName", columns="horizonMinutes", values="p90CoveragePct")
    piv.plot.bar(ax=ax)
    ax.axhline(90, color="red", ls="--", lw=1)
    ax.set_ylabel("P90 coverage (%)")
    ax.set_title("Interval calibration by model and horizon (target 90%)")
    fig.tight_layout()
    fig.savefig(out / "calibration.png", dpi=120)
    plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    summary.plot.barh(x="policy", y="slaViolationMinutes", ax=axes[0], legend=False, color="tab:red")
    axes[0].set_title("SLA-violation minutes (test week)")
    summary.plot.barh(x="policy", y="totalCostUsd", ax=axes[1], legend=False, color="tab:green")
    axes[1].set_title("Total cost USD (infra + inference)")
    fig.tight_layout()
    fig.savefig(out / "policy_comparison.png", dpi=120)
    plt.close(fig)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["data", "backtest", "all"])
    args = ap.parse_args()
    if args.stage in ("data", "all"):
        m = run_data()
        print(json.dumps(m["preprocessing"], indent=2))
    if args.stage in ("backtest", "all"):
        run_backtest()


if __name__ == "__main__":
    main()


__all__ = ["run_data", "run_backtest", "load_models", "load_processed", "load_events", "LEADS", "_take"]
