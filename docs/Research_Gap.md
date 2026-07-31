# Consolidated Research Gap

Recent TSFMs are normally evaluated as forecasters, while cloud autoscaling research often uses task-specific models. This project addresses the missing link: an uncertainty-aware, cost-and-SLA capacity decision loop for video streaming workloads.

## Gaps

- Forecast error is rarely translated into capacity, service risk, scaling stability, and cost.
- Public benchmarks do not fully represent event-driven, multivariate streaming demand.
- Large-model accuracy gains may be operationally inferior after inference latency and hosting cost are included.
- Safe fallbacks for data gaps, drift, failed inference, and poor calibration are often absent.
- Public cloud traces are workload proxies rather than streaming traces, requiring a transparent hybrid-data methodology.
