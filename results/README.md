# Results

Produced by `make backtest` (deterministic; seed `20260911`). Dataset: the
bundled synthetic trace, 23 days × 5 regions at 5-minute resolution. Test week
2026-09-21 → 2026-09-27 (rolling origin, every 5-minute step).

> Chronos, TimesFM, Moirai and TTM are **simulated** (see
> `src/ai_models/capplan_ml/models/tsfm_sim.py`); their numbers show the
> framework working, not the models' real accuracy. Seasonal-naive, XGBoost and
> LSTM are real models trained on the data.

## Forecast accuracy — 15-minute horizon

| Model | Kind | MAE (k viewers) | sMAPE | MASE | P90 coverage | Latency |
|---|---|---|---|---|---|---|
| XGBoost | baseline | 5.99 | 1.4% | 0.18 | 89.7% | 2.4 ms |
| LSTM | baseline | 6.14 | 1.5% | 0.18 | 94.7% | 0.5 ms |
| Chronos | foundation (sim.) | 7.78 | 2.1% | 0.23 | 91.5% | 140 ms |
| TimesFM | foundation (sim.) | 8.25 | 2.2% | 0.24 | 92.4% | 95 ms |
| Moirai | foundation (sim.) | 8.63 | 2.4% | 0.26 | 92.2% | 180 ms |
| TTM | foundation (sim.) | 9.78 | 2.6% | 0.29 | 91.2% | 60 ms |
| Seasonal-naive | baseline | 39.87 | 8.4% | 1.18 | 86.6% | <0.01 ms |

All horizons are in `benchmark.csv`; normal vs flash-crowd splits are in
`benchmark_segments.csv`. Model selection picks XGBoost (15 min) and LSTM
(30/60 min): they use the scheduled-event calendar, which the zero-shot
emulators don't.

## Capacity-first evaluation — scaling policies over the test week

| Policy | SLA-violation min | Oscillations | Total cost | vs reactive |
|---|---|---|---|---|
| Predictive P90 · XGBoost (in use) | 115 | 247 | $106,019 | −13.4% |
| Predictive P90 · LSTM | 140 | 217 | $106,391 | −13.1% |
| Predictive P90 · Chronos (sim.) | 90 | 302 | $107,837 | −12.0% |
| Predictive P50 · XGBoost | 175 | 194 | $103,412 | −15.6% |
| Reactive (70% CPU target) | 130 | 196 | $122,484 | — |
| Predictive P90 · seasonal-naive | 1485 | 117 | $114,104 | −6.8% |
| Static schedule | 630 | 0 | $130,185 | +6.3% |

Takeaways:

* Planning on P90 rather than P50 buys fewer SLA minutes (115 vs 175) for about 2.5% more cost.
* Simulated TSFMs with GPU hosting reach the fewest SLA minutes but pay about $237/week in inference.
* A poor forecaster (seasonal-naive) is worse than reactive scaling. This is why the live loop falls back only when confidence drops, and why fallback is monitored.

Files: `benchmark.csv`, `benchmark_segments.csv`, `confidence.json`,
`policy_daily.csv`, `policy_summary.csv`, `summary.json`, and the plots
`forecast_us-east_15m.png`, `calibration.png`, `policy_comparison.png`.
`artifacts/models.pkl` (trained models) is git-ignored and regenerated on demand.
