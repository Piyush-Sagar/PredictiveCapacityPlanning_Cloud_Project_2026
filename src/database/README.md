# Database — `capplan_db`

Postgres in Docker Compose (SQLite for `make dev` and tests), standing in for
Timestream operational metrics plus the forecast, decision and audit stores.
Migrations live in `alembic/` (`0001_initial_schema`).

| Table | Purpose |
|---|---|
| `users` | Cognito `sub`, email, role (upserted on each authenticated call) |
| `accounts` | linked AWS accounts: ExternalId, role ARN, stack, regions, scale, policy |
| `sim_state` | simulation clock (cursor into the replay window) |
| `metrics` | 5-minute telemetry per account/region |
| `forecasts` | P50/P90 per model, origin and lead (8 h retention) |
| `fleet_state` | current units + guardrail controller state per fleet |
| `capacity_recommendations` | latest recommendation per account/region/fleet |
| `scaling_decisions` | audit trail of executed changes, incl. the AWS request |
| `alerts` | approval workflow, deduplicated, with SNS message ids |
| `confidence_snapshots` | backtest + live rolling calibration |
| `benchmark_results`, `policy_summary` | backtest outputs |
| `cost_sla_metrics` | daily cost / SLA per account/region (backtest + live) |

`seed.py` loads `results/` into the global tables. Regenerate the migration
after model changes:
`DATABASE_URL=sqlite:///tmp.db alembic -c src/database/alembic.ini revision --autogenerate -m "..."`.
