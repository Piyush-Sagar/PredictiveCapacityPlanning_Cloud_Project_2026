"""Raw telemetry generation.

Produces a one-minute, multi-region telemetry trace shaped like Alibaba Cluster
Trace v2018 ``machine_usage`` (cpu/mem/net/disk utilisation percentages), with a
transparent streaming-demand overlay: concurrent viewers, segment requests,
bitrate, egress bytes, latency and errors.

The overlay is deliberately explicit (see ``Dataset_Details.md``): diurnal and
weekly seasonality keyed to each region's local prime time, a *scheduled* event
calendar (content releases, live events) that the forecasters may use as
features, *unscheduled* flash crowds they cannot see coming, telemetry gaps,
and invalid normalised values that preprocessing must reject.

Optionally a real series (e.g. a Kaggle CloudWatch trace) can replace the
synthetic diurnal base via ``base_shape``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from . import config

START = datetime(2026, 9, 7, tzinfo=timezone.utc)


@dataclass
class Event:
    event_id: str
    region: str
    kind: str  # "release" | "live" | "viral"
    start: pd.Timestamp
    end: pd.Timestamp
    lift: float  # peak multiplicative lift, e.g. 0.8 == +80%
    scheduled: bool
    name: str


SAMPLE_ACCOUNTS = [
    {
        "accountId": "111122223333",
        "alias": "streamco-prod",
        "displayName": "StreamCo Production",
        "scale": 1.0,
        "regions": list(config.REGIONS),
    },
    {
        "accountId": "444455556666",
        "alias": "streamco-staging",
        "displayName": "StreamCo Staging",
        "scale": 0.15,
        "regions": ["us-east", "eu-west"],
    },
    {
        "accountId": "777788889999",
        "alias": "kidsflix-prod",
        "displayName": "KidsFlix Production",
        "scale": 0.45,
        "regions": ["us-east", "us-west", "ap-south"],
    },
]


def _diurnal(local_hour: np.ndarray) -> np.ndarray:
    """Overnight trough (~05:00), daytime plateau, prime-time peak (~21:00)."""
    a = 2 * np.pi * (local_hour - 21.0) / 24.0
    b = 4 * np.pi * (local_hour - 19.5) / 24.0
    return 1.0 + 0.48 * np.cos(a) + 0.12 * np.cos(b)


def _event_profile(minutes: np.ndarray, ev: Event, t0: pd.Timestamp) -> np.ndarray:
    """Lift curve for one event over the global minute index."""
    s = (ev.start - t0).total_seconds() / 60
    e = (ev.end - t0).total_seconds() / 60
    out = np.zeros_like(minutes, dtype=float)
    if ev.kind == "live":
        ramp = 20.0
        up = (minutes >= s - ramp) & (minutes < s)
        out[up] = (minutes[up] - (s - ramp)) / ramp
        on = (minutes >= s) & (minutes < e)
        # Slight build during the event, then a fast drop-off.
        out[on] = 1.0 + 0.15 * (minutes[on] - s) / max(e - s, 1)
        tail = (minutes >= e) & (minutes < e + 15)
        out[tail] = 1.0 - (minutes[tail] - e) / 15
    elif ev.kind == "release":
        on = (minutes >= s) & (minutes < e)
        rise = 15.0
        dt = minutes[on] - s
        out[on] = np.where(dt < rise, dt / rise, np.exp(-(dt - rise) / ((e - s) / 2.5)))
    else:  # viral: abrupt onset, exponential decay
        on = (minutes >= s) & (minutes < e)
        rise = 6.0
        dt = minutes[on] - s
        out[on] = np.where(dt < rise, dt / rise, np.exp(-(dt - rise) / ((e - s) / 3.0)))
    return ev.lift * np.clip(out, 0, None)


def build_event_calendar(rng: np.random.Generator, days: int) -> list[Event]:
    t0 = pd.Timestamp(START)
    events: list[Event] = []
    n = 0

    def add(region, kind, start, dur_min, lift, scheduled, name):
        nonlocal n
        n += 1
        events.append(
            Event(
                event_id=f"ev-{n:03d}",
                region=region,
                kind=kind,
                start=start,
                end=start + pd.Timedelta(minutes=int(dur_min)),
                lift=float(lift),
                scheduled=scheduled,
                name=name,
            )
        )

    # Global live events (e.g. a football final) hitting every region with regional weights.
    global_events = [
        (4, 19.0, 150, "Champions Cup Semi-final"),
        (11, 18.5, 165, "Champions Cup Final"),
        (19, 20.0, 140, "Global Awards Night"),
    ]
    for day, utc_hour, dur, name in global_events:
        start = t0 + pd.Timedelta(days=day, hours=utc_hour)
        for region in config.REGIONS:
            weight = {"eu-west": 1.3, "sa-east": 1.2, "us-east": 0.8, "us-west": 0.6, "ap-south": 0.7}[region]
            add(region, "live", start, dur, rng.uniform(0.7, 1.1) * weight, True, name)

    for region in config.REGIONS:
        off = config.REGION_UTC_OFFSET[region]
        # Weekly Friday 20:00-local episode drop.
        for day in range(days):
            local_day = (t0 + pd.Timedelta(days=day))
            if local_day.dayofweek == 4:
                start = local_day + pd.Timedelta(hours=20 - off)
                add(region, "release", start, 180, rng.uniform(0.3, 0.45), True, "Weekly series premiere")
        # A couple of ad-hoc releases and regional live events.
        for _ in range(3):
            day = int(rng.integers(1, days - 1))
            hour = float(rng.uniform(17, 22))
            start = t0 + pd.Timedelta(days=day, hours=hour - off)
            add(region, "release", start, int(rng.integers(120, 240)), rng.uniform(0.25, 0.5), True, "Catalogue release")
        for _ in range(2):
            day = int(rng.integers(1, days - 1))
            hour = float(rng.uniform(18, 21))
            start = t0 + pd.Timedelta(days=day, hours=hour - off)
            add(region, "live", start, int(rng.integers(100, 200)), rng.uniform(0.5, 1.0), True, "Regional live match")
        # Unscheduled viral flash crowds — not visible to the forecasters.
        for _ in range(max(1, days // 3)):
            day = int(rng.integers(1, days))
            hour = float(rng.uniform(8, 23))
            start = t0 + pd.Timedelta(days=day, hours=hour - off)
            add(region, "viral", start, int(rng.integers(30, 75)), rng.uniform(0.3, 0.8), False, "Unscheduled viral spike")

    return events


def generate_raw(
    days: int = config.TOTAL_DAYS,
    seed: int = config.SEED,
    base_shape: np.ndarray | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (telemetry_1min, events). ``base_shape`` (length days*1440, mean≈1)
    replaces the synthetic diurnal/weekly base when a real trace is supplied."""
    rng = np.random.default_rng(seed)
    t0 = pd.Timestamp(START)
    n_min = days * 1440
    minutes = np.arange(n_min, dtype=float)
    ts = pd.date_range(t0, periods=n_min, freq="1min")
    events = build_event_calendar(rng, days)

    frames = []
    for region in config.REGIONS:
        off = config.REGION_UTC_OFFSET[region]
        local = ts + pd.Timedelta(hours=off)
        local_hour = (local.hour + local.minute / 60).to_numpy()
        if base_shape is not None:
            shift = int(round(off * 60))
            base = np.roll(base_shape[:n_min], shift)
        else:
            base = _diurnal(local_hour)
            dow = local.dayofweek.to_numpy()
            base = base * np.where(dow >= 5, 1.12, 1.0) * np.where((dow == 4) & (local_hour >= 18), 1.06, 1.0)
        trend = 1.0 + 0.003 * minutes / 1440

        # Log-AR(1) demand noise plus measurement noise.
        eps = rng.normal(0, 0.0035, n_min)
        ar = np.empty(n_min)
        acc = 0.0
        for i in range(n_min):
            acc = 0.985 * acc + eps[i]
            ar[i] = acc

        lift = np.zeros(n_min)
        for ev in events:
            if ev.region == region:
                lift += _event_profile(minutes, ev, t0)

        viewers = (
            config.REGION_BASE_LOAD[region]
            * base
            * trend
            * (1 + lift)
            * np.exp(ar)
            * (1 + rng.normal(0, 0.008, n_min))
        )
        viewers = np.maximum(viewers, 1.0)

        # Historical fleet ran a lagging reactive policy, which is what drives CPU.
        smoothed = pd.Series(viewers).rolling(15, min_periods=1).mean().shift(10).bfill().to_numpy()
        hist_units = np.ceil(smoothed / config.DEFAULT_THROUGHPUT_PER_UNIT / 0.65)
        util = viewers / (hist_units * config.DEFAULT_THROUGHPUT_PER_UNIT)
        cpu = np.clip(util * 92 + rng.normal(0, 2.0, n_min), 1, 100)
        mem = np.clip(38 + 0.35 * cpu + rng.normal(0, 1.5, n_min), 1, 100)
        bitrate = 4.3 + 0.9 * (base - base.min()) / (np.ptp(base) + 1e-9) + rng.normal(0, 0.08, n_min)
        requests = viewers * 1000 / 4.0 * (1 + rng.normal(0, 0.01, n_min))  # 4 s HLS segments
        bytes_gb = viewers * 1000 * bitrate * 60 / 8 / 1000
        overload = np.clip(util - 0.85, 0, None)
        latency = 38 + 900 * overload**2 + rng.gamma(2.0, 2.5, n_min)
        errors = 0.001 + 0.2 * overload + np.abs(rng.normal(0, 0.0004, n_min))
        net_in = np.clip(8 + 0.05 * cpu + rng.normal(0, 1, n_min), 0, 100)
        net_out = np.clip(bytes_gb / bytes_gb.max() * 90 + rng.normal(0, 1, n_min), 0, 100)
        disk = np.clip(5 + rng.gamma(2, 2, n_min), 0, 100)

        df = pd.DataFrame(
            {
                "time_stamp": ts,
                "region": region,
                "viewers_k": viewers,
                "requests_per_s": requests,
                "bitrate_mbps": bitrate,
                "bytes_out_gb": bytes_gb,
                "cpu_util_percent": cpu,
                "mem_util_percent": mem,
                "net_in": net_in,
                "net_out": net_out,
                "disk_io_percent": disk,
                "latency_ms": latency,
                "error_rate": errors,
            }
        )

        # Alibaba-style invalid normalised readings (-1 / 101) that validation must drop.
        bad = rng.choice(n_min, size=n_min // 800, replace=False)
        df.loc[bad, "cpu_util_percent"] = rng.choice([-1.0, 101.0], size=len(bad))
        # Random dropped samples plus two telemetry outages.
        drop = rng.random(n_min) < 0.003
        for _ in range(2):
            s = int(rng.integers(1440, n_min - 60))
            drop[s : s + int(rng.integers(10, 25))] = True
        df = df[~drop]
        frames.append(df)

    telemetry = pd.concat(frames, ignore_index=True)
    events_df = pd.DataFrame(
        [
            {
                "event_id": e.event_id,
                "region": e.region,
                "kind": e.kind,
                "name": e.name,
                "start": e.start,
                "end": e.end,
                "lift": round(e.lift, 3),
                "scheduled": e.scheduled,
            }
            for e in events
        ]
    )
    return telemetry, events_df


def write_raw(telemetry: pd.DataFrame, events: pd.DataFrame, source: str) -> dict:
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)
    tel_path = config.RAW_DIR / "telemetry_1min.parquet"
    ev_path = config.RAW_DIR / "events.csv"
    telemetry.to_parquet(tel_path, index=False)
    events.to_csv(ev_path, index=False)
    (config.RAW_DIR / "accounts.json").write_text(json.dumps(SAMPLE_ACCOUNTS, indent=2))

    import hashlib

    digest = hashlib.sha256(tel_path.read_bytes()).hexdigest()
    meta = {
        "source": source,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rows": int(len(telemetry)),
        "start": str(telemetry["time_stamp"].min()),
        "end": str(telemetry["time_stamp"].max()),
        "sha256": digest,
        "events": int(len(events)),
    }
    (config.RAW_DIR / "MANIFEST.json").write_text(json.dumps(meta, indent=2))
    return meta


def start_time() -> datetime:
    return START


def split_bounds() -> dict[str, tuple[pd.Timestamp, pd.Timestamp]]:
    t = pd.Timestamp(START)
    out = {}
    for name, d in config.SPLIT_DAYS.items():
        out[name] = (t, t + pd.Timedelta(days=d))
        t = t + pd.Timedelta(days=d)
    return out


def utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


__all__ = [
    "SAMPLE_ACCOUNTS",
    "generate_raw",
    "write_raw",
    "split_bounds",
    "start_time",
    "timedelta",
]
