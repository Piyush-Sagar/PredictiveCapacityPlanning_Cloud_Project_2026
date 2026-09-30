# Dataset Details

**Primary source:** Alibaba Cluster Trace v2018  
**URL:** https://github.com/alibaba/clusterdata/tree/master/cluster-trace-v2018  
**Scale:** about 4,000 machines for 8 days, six tables, approximately 49 GB compressed / 280 GB extracted.  
**Purpose:** realistic cloud-resource variability for forecasting and scaling experiments.  

## Planned preprocessing

1. Download only required usage tables.
2. Validate schema and remove invalid normalized values.
3. Align timestamps and aggregate to five-minute windows.
4. Handle missing values and create missingness flags.
5. Add lags, rolling statistics, seasonality, and event variables.
6. Split chronologically and prevent leakage.
7. Create a documented synthetic streaming-demand overlay.

## Limitation

The trace is not a native video streaming request dataset. Claims must be limited to a workload-proxy study until prototype streaming telemetry is available.

## Implementation (Phase II)

The trace is **not downloaded**: `dataset/scripts/generate_synthetic.py`
(`make data`) generates a deterministic, Alibaba-`machine_usage`-shaped trace.

* **Shape**: 23 days × 5 regions at 1-minute resolution; ~165k rows with
  `cpu_util_percent`, `mem_util_percent`, `net_in`, `net_out`,
  `disk_io_percent`.
* **Streaming overlay**: `viewers_k`, `requests_per_s`, `bitrate_mbps`,
  `bytes_out_gb`, `latency_ms`, `error_rate`.
* **Seasonality**: diurnal and weekly, keyed to each region's local prime time.
* **Scheduled event calendar** (usable as features): weekly series premieres,
  catalogue releases, regional and global live events.
* **Unscheduled viral flash crowds**: not in the calendar, so models can't see
  them coming.
* **Noise and data problems**: dropped samples, two telemetry outages per
  region, and invalid −1/101 readings, all of which preprocessing must handle.
* **Split**: train 12 d | val 2 d | test 7 d (backtest + policy simulation) |
  live 2 d (replayed by the running system).
* **Manifest**: `raw/MANIFEST.json` records source, row count and SHA-256;
  `processed/manifest.json` records the preprocessing report.

`dataset/scripts/load_kaggle.py` (`make kaggle`) can use a real Kaggle series
(default: NAB `realAWSCloudwatch`, 5-minute AWS CloudWatch metrics) as the
demand base shape, with the same overlay on top. It falls back to the
synthetic trace when no Kaggle credentials are present.
