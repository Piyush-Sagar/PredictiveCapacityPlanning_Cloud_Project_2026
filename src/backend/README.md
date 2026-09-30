# Backend — `capplan_api` (FastAPI)

Stands in for API Gateway + the Lambda/ECS API tier. Every `/api/*` route
requires a Cognito access token (RS256, verified against the user pool's
JWKS; issuer, `token_use` and `client_id` checked). The `admins` group maps to
the admin role; everyone else is an operator.

```
uvicorn capplan_api.main:app --port 8000     # needs AWS_ENDPOINT_URL (moto) + DATABASE_URL
```

On startup it migrates the database (Alembic; `create_all` on SQLite), loads
the processed dataset and trained models (running `data` + `backtest` first if
missing), seeds backtest results, bootstraps the platform's S3/SNS/SQS in moto
and starts the simulation scheduler.

## Control loop (`services/engine.py`, one tick = 5 simulated minutes)

1. ingest the next telemetry window → `metrics` + account CloudWatch
2. run the selected forecasters (+ seasonal-naive fallback) → `forecasts`
3. rolling P90 coverage / data-gap check → keep the model or fall back
4. P90 → units through the guardrails, per region × fleet; then auto-execute
   (`ecs:UpdateService` with the assumed role), raise an approval alert, or recommend
5. predicted-peak / SLA-risk / budget-risk alerts → SNS; cost & SLA accrual

## Endpoints

| Method | Path | Role |
|---|---|---|
| GET | `/api/me`, `/api/clock` | any |
| GET/POST | `/api/accounts`, `/api/accounts/samples` | operator |
| POST | `/api/accounts/{id}/connect/complete` | operator |
| DELETE | `/api/accounts/{id}` | admin |
| GET | `/api/forecasts?region&horizon`, `/api/forecasts/all?horizon` | operator |
| GET | `/api/capacity`, `/api/capacity/decisions` | operator |
| GET | `/api/confidence` | operator |
| GET · POST | `/api/alerts` · `/api/alerts/{id}/approve\|reject` | operator |
| GET | `/api/cost-sla`, `/api/cost-sla/policies` | operator |
| GET | `/api/cost/usage` (ce:GetCostAndUsage), `/api/cost/forecast` (ce:GetCostForecast + next-hour) | operator |
| GET | `/api/benchmarks`, `/api/pipeline/status`, `/api/notifications`, `/api/policy` | operator |
| PUT | `/api/policy`, `/api/pipeline/clock` · POST `/api/pipeline/step` | admin |

The account is chosen with the `x-capplan-account` header (set by the
dashboard's BFF), defaulting to the first connected account. Interactive docs
are at http://localhost:8000/docs.
