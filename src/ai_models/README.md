# AI Models — `capplan_ml`

Offline pipeline and the forecasting / capacity logic reused by the live API.

```
capplan_ml/
  config.py          regions, horizons, splits, pricing (mirrors frontend lib/mock/constants.ts)
  data.py            synthetic Alibaba-shaped trace + streaming overlay + event calendar
  features.py        validation → 5-min resampling → gap repair → flags → features; RegionSeries
  models/            seasonal_naive.py, xgboost_q.py, lstm.py (real) · tsfm_sim.py (simulated)
  metrics.py         MAE, RMSE, sMAPE, MASE, P90 coverage, inference cost
  capacity.py        units = ceil(P90 / throughput × (1 + margin)) + guardrails
  simulator.py       closed-loop policy replay (static, reactive, predictive P50/P90)
  drift.py           rolling coverage, degraded/fallback rules
  pipeline.py        `python -m capplan_ml.pipeline data|backtest|all`
```

## Models

| Model | Kind | Implementation |
|---|---|---|
| Seasonal-naive | baseline, real | value one day earlier; P90 from per-lead residual quantile |
| XGBoost | baseline, real | quantile regression (α = 0.5, 0.9), direct multi-horizon, log-ratio target |
| LSTM | baseline, real | 48-step encoder + future calendar/event context, pinball loss |
| Chronos, TimesFM, Moirai, TTM | foundation, **simulated** | `tsfm_sim.py`: zero-shot seasonal prior blended with the realised future (weight decays with lead and drops in unscheduled flash crowds), smooth correlated noise, per-model calibration; latency/memory/hosting from profiles |

Every model implements `fit(series)` and `predict(series, origins) → P50/P90 paths`
for leads 1–12 (5 → 60 minutes). To plug in a real TSFM, implement `predict`
with the same signature, e.g. with `chronos.BaseChronosPipeline.predict_quantiles`.

## Evaluation

Rolling-origin backtest over the held-out test week, all five regions. Metrics
come at 15/30/60 min, overall and split into normal vs flash-crowd periods.
Model selection is capacity-first: sMAPE, penalised for P90 under-coverage and
inference latency. The simulator then replays the week under each scaling
policy with a 10-minute provisioning delay. Outputs go to `results/`.
