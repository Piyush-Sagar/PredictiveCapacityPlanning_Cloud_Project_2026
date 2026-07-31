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
