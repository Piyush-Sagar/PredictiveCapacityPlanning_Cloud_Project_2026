"""Shared constants for the capacity-planning pipeline.

Values mirror `src/frontend/lib/mock/constants.ts` so the dashboard's mock mode
and the real pipeline describe the same platform.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATASET_DIR = Path(os.environ.get("CAPPLAN_DATASET_DIR", REPO_ROOT / "dataset"))
RAW_DIR = DATASET_DIR / "raw"
PROCESSED_DIR = DATASET_DIR / "processed"
RESULTS_DIR = Path(os.environ.get("CAPPLAN_RESULTS_DIR", REPO_ROOT / "results"))
ARTIFACTS_DIR = Path(os.environ.get("CAPPLAN_ARTIFACTS_DIR", REPO_ROOT / "results" / "artifacts"))

SEED = 20260911

REGIONS = ["us-east", "us-west", "eu-west", "ap-south", "sa-east"]

# Concurrent viewers (thousands) at the diurnal mean, per region.
REGION_BASE_LOAD = {"us-east": 420, "us-west": 260, "eu-west": 310, "ap-south": 380, "sa-east": 140}

# UTC offset (hours) used to place each region's evening prime-time peak.
REGION_UTC_OFFSET = {"us-east": -4, "us-west": -7, "eu-west": 1, "ap-south": 5.5, "sa-east": -3}

STEP_MINUTES = 5
STEPS_PER_DAY = 24 * 60 // STEP_MINUTES  # 288
HORIZONS = [15, 30, 60]
HORIZON_STEPS = {15: 3, 30: 6, 60: 12}
MAX_LEAD = 12  # steps (60 minutes)

# Chronological split, in days: train | val | test (backtest + policy simulation) | live replay.
SPLIT_DAYS = {"train": 12, "val": 2, "test": 7, "live": 2}
TOTAL_DAYS = sum(SPLIT_DAYS.values())

FOUNDATION_MODELS = ["chronos", "timesfm", "moirai", "ttm"]
BASELINE_MODELS = ["seasonal-naive", "xgboost", "lstm"]
ALL_MODELS = FOUNDATION_MODELS + BASELINE_MODELS

RESOURCE_TYPES = ["ecs-task", "ec2-asg", "origin-capacity", "transcoding-worker"]

DEFAULT_SAFETY_MARGIN_PCT = 0.2
DEFAULT_THROUGHPUT_PER_UNIT = 8.0  # thousand concurrent viewers per capacity unit
DEFAULT_BUDGET_THRESHOLD_USD = 4200.0
DEFAULT_COST_PER_UNIT_HOUR_USD = 0.42

RESOURCE_THROUGHPUT_MULTIPLIER = {
    "ecs-task": 1.0,
    "ec2-asg": 1.6,
    "origin-capacity": 3.2,
    "transcoding-worker": 0.5,
}
RESOURCE_COST_MULTIPLIER = {
    "ecs-task": 1.0,
    "ec2-asg": 1.8,
    "origin-capacity": 2.4,
    "transcoding-worker": 1.3,
}

TARGET_COVERAGE_PCT = 90.0


def throughput_per_unit(resource_type: str) -> float:
    return DEFAULT_THROUGHPUT_PER_UNIT * RESOURCE_THROUGHPUT_MULTIPLIER[resource_type]


def cost_per_unit_hour(resource_type: str) -> float:
    return DEFAULT_COST_PER_UNIT_HOUR_USD * RESOURCE_COST_MULTIPLIER[resource_type]


def budget_threshold(resource_type: str) -> float:
    return round(DEFAULT_BUDGET_THRESHOLD_USD * RESOURCE_COST_MULTIPLIER[resource_type])
