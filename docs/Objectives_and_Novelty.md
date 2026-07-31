# Objectives

1. Build a cloud-ready pipeline that aggregates streaming workload and infrastructure metrics at five-minute intervals.
2. Forecast viewer/request demand and resource utilization for 15-, 30-, and 60-minute horizons using at least three time-series foundation models and three conventional baselines.
3. Evaluate models using MAE, RMSE, sMAPE, inference latency, and prediction-interval coverage under normal peaks and flash-crowd conditions.
4. Translate P50/P90 demand forecasts into required instance or task counts using measured throughput, configurable headroom, hysteresis, and cooldown rules.
5. Simulate or implement AWS scaling recommendations while tracking service-level violations, scaling oscillations, and estimated infrastructure cost.
6. Provide an authenticated dashboard and notification workflow for forecasts, capacity recommendations, model confidence, and scaling decisions.

# Novelty

- Capacity-first evaluation: the project measures forecast usefulness through SLA risk, scaling stability, and cost—not accuracy alone.
- Foundation-model benchmarking for streaming operations: general-purpose TSFMs are compared on the same streaming-style workload and deployment constraints.
- Uncertainty-aware provisioning: a P90 demand forecast and configurable safety buffer are converted into capacity units rather than relying on a single point estimate.
- Event-aware forecasting: content releases, live-event schedules, region, hour-of-day, and recent acceleration are included as contextual features when supported.
- Closed-loop AWS integration: telemetry, inference, capacity translation, guarded scaling, alerts, and feedback monitoring are treated as one architecture.
- Model fallback and drift control: the system can fall back to seasonal-naive/reactive scaling when confidence, data quality, or recent backtest performance deteriorates.
