"""Optionally drive the demand base shape from a real Kaggle time series.

Default: the Numenta Anomaly Benchmark (NAB) on Kaggle, whose
``realAWSCloudwatch`` folder holds 5-minute AWS CloudWatch metrics exported
from production EC2/ELB/RDS resources. The chosen series is normalised to
mean 1, tiled to the trace length, and used in place of the synthetic
diurnal/weekly base; the scheduled/unscheduled event overlay and derived
streaming metrics are then applied exactly as for the synthetic trace.

Requires ``pip install kaggle`` and ``~/.kaggle/kaggle.json``. On any failure
(no credentials, no network, unexpected layout) it falls back to the bundled
synthetic generator, so the pipeline always runs.

    python dataset/scripts/load_kaggle.py
    python dataset/scripts/load_kaggle.py --dataset boltzmannbrain/nab \
        --pattern "realAWSCloudwatch/*elb_request_count*.csv"
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from capplan_ml import config
from capplan_ml.pipeline import run_data


def fetch(dataset: str, dest: Path) -> None:
    if not (Path.home() / ".kaggle" / "kaggle.json").exists() and not os.environ.get("KAGGLE_KEY"):
        raise RuntimeError("no Kaggle credentials (~/.kaggle/kaggle.json or KAGGLE_USERNAME/KAGGLE_KEY)")
    dest.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, "-m", "kaggle", "datasets", "download", "-d", dataset, "-p", str(dest), "--unzip"],
        check=True,
    )


def base_shape_from(csv: Path, time_col: str, value_col: str) -> np.ndarray:
    df = pd.read_csv(csv)
    s = pd.Series(df[value_col].to_numpy(float), index=pd.to_datetime(df[time_col])).sort_index()
    s = s.resample("5min").mean().interpolate(limit_direction="both")
    # Light smoothing keeps the real trace's structure without its sensor jitter.
    s = s.rolling(3, center=True, min_periods=1).mean()
    s = s / s.mean()
    s = s.clip(lower=0.2)
    one_min = np.repeat(s.to_numpy(), 5)
    need = config.TOTAL_DAYS * 1440
    reps = int(np.ceil(need / len(one_min)))
    return np.tile(one_min, reps)[:need]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="boltzmannbrain/nab")
    ap.add_argument("--pattern", default="**/realAWSCloudwatch/*elb_request_count*.csv")
    ap.add_argument("--time-col", default="timestamp")
    ap.add_argument("--value-col", default="value")
    args = ap.parse_args()

    dest = config.RAW_DIR / "kaggle"
    try:
        fetch(args.dataset, dest)
        matches = sorted(glob.glob(str(dest / args.pattern), recursive=True))
        if not matches:
            raise RuntimeError(f"no file matching {args.pattern} in {args.dataset}")
        csv = Path(matches[0])
        shape = base_shape_from(csv, args.time_col, args.value_col)
        manifest = run_data(source=f"kaggle:{args.dataset}/{csv.name} + streaming overlay", base_shape=shape)
    except Exception as exc:  # noqa: BLE001 - any failure → documented fallback
        print(f"[load_kaggle] {exc}; falling back to bundled synthetic trace", file=sys.stderr)
        manifest = run_data(source="synthetic (kaggle fallback)")
    print(json.dumps(manifest["raw"], indent=2))


if __name__ == "__main__":
    main()
