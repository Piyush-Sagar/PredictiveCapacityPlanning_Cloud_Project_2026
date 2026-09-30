"""Preprocessing (validation → 5-min resampling → gap repair → flags) and the
feature layer shared by every forecaster.

Every model sees the same :class:`RegionSeries`: arrays over the full 5-minute
timeline for one region. Causality is enforced at feature-construction time —
features for an origin ``t`` only read observations at ``<= t``; the only
forward-looking inputs are the calendar and the *scheduled* event calendar,
which an operator genuinely knows in advance.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import config

NORMALISED_COLS = ["cpu_util_percent", "mem_util_percent", "net_in", "net_out", "disk_io_percent"]
MEAN_COLS = [
    "viewers_k",
    "requests_per_s",
    "bitrate_mbps",
    "cpu_util_percent",
    "mem_util_percent",
    "net_in",
    "net_out",
    "disk_io_percent",
    "latency_ms",
    "error_rate",
]
SUM_COLS = ["bytes_out_gb"]


# --------------------------------------------------------------------------- preprocessing


def validate(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    df = raw.copy()
    report = {"rows_in": int(len(df))}
    invalid = 0
    for col in NORMALISED_COLS:
        bad = (df[col] < 0) | (df[col] > 100)
        invalid += int(bad.sum())
        df.loc[bad, col] = np.nan
    bad_v = df["viewers_k"] <= 0
    df.loc[bad_v, "viewers_k"] = np.nan
    report["invalid_values_removed"] = invalid + int(bad_v.sum())
    report["duplicate_rows"] = int(df.duplicated(["time_stamp", "region"]).sum())
    df = df.drop_duplicates(["time_stamp", "region"])
    return df, report


def resample_5min(df: pd.DataFrame) -> pd.DataFrame:
    out = []
    for region, g in df.groupby("region", sort=False):
        g = g.set_index("time_stamp").sort_index()
        full_index = pd.date_range(g.index.min().floor("5min"), g.index.max().floor("5min"), freq="5min")
        agg = g[MEAN_COLS].resample("5min").mean()
        agg[SUM_COLS] = g[SUM_COLS].resample("5min").sum(min_count=1)
        agg["samples"] = g["viewers_k"].resample("5min").count()
        agg = agg.reindex(full_index)
        agg["samples"] = agg["samples"].fillna(0).astype(int)
        agg["region"] = region
        out.append(agg.rename_axis("ts").reset_index())
    return pd.concat(out, ignore_index=True)


def repair_gaps(df: pd.DataFrame) -> pd.DataFrame:
    """Short gaps: time interpolation. Long gaps (> 30 min): same slot yesterday."""
    parts = []
    for _, g in df.groupby("region", sort=False):
        g = g.sort_values("ts").reset_index(drop=True)
        g["was_missing"] = g["viewers_k"].isna().astype(int)
        for col in MEAN_COLS + SUM_COLS:
            s = g[col]
            interp = s.interpolate(limit=6, limit_area="inside")
            seasonal = s.shift(config.STEPS_PER_DAY)
            g[col] = interp.fillna(seasonal).ffill().bfill()
        parts.append(g)
    return pd.concat(parts, ignore_index=True)


def flag_outliers(df: pd.DataFrame, z: float = 4.0) -> pd.DataFrame:
    parts = []
    for _, g in df.groupby("region", sort=False):
        d = np.log(g["viewers_k"]).diff()
        med = d.median()
        mad = (d - med).abs().median() * 1.4826 + 1e-9
        g = g.copy()
        g["outlier_flag"] = (((d - med) / mad).abs() > z).astype(int)
        parts.append(g)
    return pd.concat(parts, ignore_index=True)


def add_event_columns(df: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    """Scheduled-event features (known in advance) plus a ground-truth
    ``flash_crowd`` label used only to segment the evaluation."""
    df = df.copy()
    for col in ["sched_live", "sched_release", "flash_crowd"]:
        df[col] = 0
    ts = df["ts"]
    for ev in events.itertuples():
        start, end = pd.Timestamp(ev.start), pd.Timestamp(ev.end)
        reg = df["region"] == ev.region
        if ev.scheduled:
            pre = pd.Timedelta(minutes=20 if ev.kind == "live" else 0)
            window = reg & (ts >= start - pre) & (ts < end)
            df.loc[window, "sched_live" if ev.kind == "live" else "sched_release"] = 1
        if ev.lift >= 0.3:
            window = reg & (ts >= start) & (ts < end)
            df.loc[window, "flash_crowd"] = 1
    return df


def add_calendar(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    off = df["region"].map(config.REGION_UTC_OFFSET).astype(float)
    local = df["ts"] + pd.to_timedelta(off, unit="h")
    hour = local.dt.hour + local.dt.minute / 60
    df["local_hour"] = hour
    df["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    df["dow"] = local.dt.dayofweek
    df["weekend"] = (df["dow"] >= 5).astype(int)
    return df


def assign_split(df: pd.DataFrame, start: pd.Timestamp) -> pd.DataFrame:
    df = df.copy()
    edges = [start]
    for d in config.SPLIT_DAYS.values():
        edges.append(edges[-1] + pd.Timedelta(days=d))
    labels = list(config.SPLIT_DAYS)
    df["split"] = pd.cut(df["ts"], bins=edges, labels=labels, right=False).astype(str)
    return df


def preprocess(raw: pd.DataFrame, events: pd.DataFrame, start: pd.Timestamp) -> tuple[pd.DataFrame, dict]:
    df, report = validate(raw)
    df = resample_5min(df)
    report["missing_5min_windows"] = int((df["samples"] == 0).sum())
    df = repair_gaps(df)
    df = flag_outliers(df)
    df = add_event_columns(df, events)
    df = add_calendar(df)
    df = assign_split(df, start)
    report["rows_out"] = int(len(df))
    report["outliers_flagged"] = int(df["outlier_flag"].sum())
    return df, report


# --------------------------------------------------------------------------- series container


@dataclass
class RegionSeries:
    """One region's 5-minute timeline. ``y`` is concurrent viewers (thousands)."""

    region: str
    ts: np.ndarray  # datetime64[ns]
    y: np.ndarray
    cpu: np.ndarray
    hour_sin: np.ndarray
    hour_cos: np.ndarray
    weekend: np.ndarray
    sched_live: np.ndarray
    sched_release: np.ndarray
    flash_crowd: np.ndarray
    split: np.ndarray
    extra: dict = field(default_factory=dict)

    @property
    def logy(self) -> np.ndarray:
        return np.log(np.maximum(self.y, 1e-6))

    def __len__(self) -> int:
        return len(self.y)

    def scaled(self, factor: float, noise: np.ndarray | None = None) -> "RegionSeries":
        y = self.y * factor
        if noise is not None:
            y = y * noise
        return RegionSeries(**{**self.__dict__, "y": y})

    def indices(self, split: str) -> np.ndarray:
        return np.flatnonzero(self.split == split)


def to_series(df: pd.DataFrame) -> dict[str, RegionSeries]:
    out = {}
    for region, g in df.groupby("region", sort=False):
        g = g.sort_values("ts")
        out[region] = RegionSeries(
            region=region,
            ts=g["ts"].to_numpy(),
            y=g["viewers_k"].to_numpy(float),
            cpu=g["cpu_util_percent"].to_numpy(float),
            hour_sin=g["hour_sin"].to_numpy(float),
            hour_cos=g["hour_cos"].to_numpy(float),
            weekend=g["weekend"].to_numpy(float),
            sched_live=g["sched_live"].to_numpy(float),
            sched_release=g["sched_release"].to_numpy(float),
            flash_crowd=g["flash_crowd"].to_numpy(int),
            split=g["split"].to_numpy(str),
            extra={"was_missing": g["was_missing"].to_numpy(int), "outlier": g["outlier_flag"].to_numpy(int)},
        )
    return out


# --------------------------------------------------------------------------- supervised features

LAGS = [1, 2, 3, 6, 12, 24]
DAY = config.STEPS_PER_DAY
WEEK = 7 * DAY


def _take(arr: np.ndarray, idx: np.ndarray) -> np.ndarray:
    """Index with NaN for out-of-range positions."""
    out = np.full(idx.shape, np.nan)
    ok = (idx >= 0) & (idx < len(arr))
    out[ok] = arr[idx[ok]]
    return out


def origin_features(s: RegionSeries, origins: np.ndarray) -> dict[str, np.ndarray]:
    """Features that depend only on the origin (history up to t)."""
    ly = s.logy
    cur = ly[origins]
    f = {}
    for j in LAGS:
        f[f"mom_{j}"] = cur - _take(ly, origins - j)
    csum = np.concatenate([[0.0], np.cumsum(ly)])
    csq = np.concatenate([[0.0], np.cumsum(ly**2)])
    lo = np.maximum(origins - 11, 0)
    n = origins - lo + 1
    mean12 = (csum[origins + 1] - csum[lo]) / n
    var12 = (csq[origins + 1] - csq[lo]) / n - mean12**2
    f["roll_mean12"] = cur - mean12
    f["roll_std12"] = np.sqrt(np.maximum(var12, 0))
    f["cpu_now"] = s.cpu[origins] / 100
    f["event_now"] = s.sched_live[origins] + s.sched_release[origins]
    f["season_now"] = cur - _take(ly, origins - DAY)
    return f


def lead_features(s: RegionSeries, origins: np.ndarray, lead: int) -> dict[str, np.ndarray]:
    """Features for target time t+lead: calendar/scheduled events (known ahead)
    and seasonal lags (observed history)."""
    ly = s.logy
    cur = ly[origins]
    tgt = origins + lead
    f = {
        "lead": np.full(origins.shape, lead, dtype=float),
        "season_day": _take(ly, tgt - DAY) - cur,
        "season_week": _take(ly, tgt - WEEK) - cur,
        "hour_sin": _take(s.hour_sin, tgt),
        "hour_cos": _take(s.hour_cos, tgt),
        "weekend": _take(s.weekend, tgt),
        "sched_live": _take(s.sched_live, tgt),
        "sched_release": _take(s.sched_release, tgt),
        "sched_live_yday": _take(s.sched_live, tgt - DAY),
        "sched_release_yday": _take(s.sched_release, tgt - DAY),
    }
    return f


def region_onehot(region: str, n: int) -> dict[str, np.ndarray]:
    return {f"reg_{r}": np.full(n, float(r == region)) for r in config.REGIONS}


def supervised_matrix(
    s: RegionSeries, origins: np.ndarray, leads: range | list[int]
) -> tuple[pd.DataFrame, np.ndarray]:
    """Stacked (origin, lead) design matrix and log-ratio targets."""
    base = origin_features(s, origins)
    oh = region_onehot(s.region, len(origins))
    X_parts, y_parts = [], []
    ly = s.logy
    for lead in leads:
        f = {**base, **lead_features(s, origins, lead), **oh}
        X_parts.append(pd.DataFrame(f))
        y_parts.append(_take(ly, origins + lead) - ly[origins])
    return pd.concat(X_parts, ignore_index=True), np.concatenate(y_parts)
