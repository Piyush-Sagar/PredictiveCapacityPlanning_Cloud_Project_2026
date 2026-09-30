"""Re-run preprocessing on an existing dataset/raw/telemetry_1min.parquet.

    python dataset/scripts/preprocess.py
"""

import json

import pandas as pd

from capplan_ml import config
from capplan_ml.data import start_time
from capplan_ml.features import preprocess
from capplan_ml.pipeline import PROCESSED_FILE

if __name__ == "__main__":
    raw = pd.read_parquet(config.RAW_DIR / "telemetry_1min.parquet")
    events = pd.read_csv(config.RAW_DIR / "events.csv", parse_dates=["start", "end"])
    df, report = preprocess(raw, events, pd.Timestamp(start_time()))
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(config.PROCESSED_DIR / PROCESSED_FILE, index=False)
    print(json.dumps(report, indent=2))
