# Predictive Capacity Planning Framework for Video Streaming Platforms using Time-Series Foundation Models

**Repository:** `PredictiveCapacityPlanning_Cloud_Project_2026`  
**Course:** BCSE355L - Cloud Architecture Design  
**Phase:** Phase II - Implementation (simulated AWS)  

## Team

| Member | Registration Number | Literature Allocation |
|---|---|---|
| Piyush Sagar | 24BIT0620 | Papers 1-5 |
| Chirayu Sahu | 24BIT0622 | Papers 6-10 |
| Sujal Agarwal | 24BIT0623 | Papers 11-15 |

## Problem Statement

A video streaming platform must provision sufficient origin, API, transcoding, and delivery-support capacity before demand peaks. Reactive threshold-based policies are late by design, while static schedules cannot reliably handle event-driven spikes or changing regional behavior. The problem is therefore to forecast near-future workload with calibrated uncertainty and convert that forecast into a stable capacity plan that reduces both service risk and avoidable cloud cost.

## Objectives

1. Build a cloud-ready pipeline that aggregates streaming workload and infrastructure metrics at five-minute intervals.
2. Forecast viewer/request demand and resource utilization for 15-, 30-, and 60-minute horizons using at least three time-series foundation models and three conventional baselines.
3. Evaluate models using MAE, RMSE, sMAPE, inference latency, and prediction-interval coverage under normal peaks and flash-crowd conditions.
4. Translate P50/P90 demand forecasts into required instance or task counts using measured throughput, configurable headroom, hysteresis, and cooldown rules.
5. Simulate or implement AWS scaling recommendations while tracking service-level violations, scaling oscillations, and estimated infrastructure cost.
6. Provide an authenticated dashboard and notification workflow for forecasts, capacity recommendations, model confidence, and scaling decisions.


## Proposed Framework

1. Collect five-minute demand and resource metrics.
2. Validate, resample, and engineer lag/seasonality/event features.
3. Benchmark TSFMs and conventional baselines.
4. Generate P50/P90 forecasts for 15-, 30-, and 60-minute horizons.
5. Convert the upper forecast into required capacity with guardrails.
6. Recommend or execute AWS scaling and monitor the outcome.

## Proposed Architecture

- [AWS cloud architecture](architecture/AWS_Architecture.png)
- [Complete system architecture](architecture/System_Architecture.png)

## Technology Stack

- Python, FastAPI, PyTorch, Hugging Face / forecasting libraries
- Chronos, TimesFM, Moirai, Tiny Time Mixers; seasonal-naive, XGBoost, LSTM/iTransformer baselines
- AWS CloudFront, MediaLive, MediaPackage, CloudWatch, Kinesis Data Firehose, S3, Timestream, Glue, Lambda, SageMaker AI, ECS/Fargate, Application Auto Scaling, SNS, QuickSight, API Gateway, Cognito, IAM/KMS

## Dataset

Alibaba Cluster Trace v2018 will be used as a cloud-workload proxy. It is **not** a native streaming-demand dataset. Streaming-specific demand and event fields will be simulated transparently until prototype CloudFront/CloudWatch telemetry is collected. See [Dataset Details](dataset/Dataset_Details.md).

## Implementation (Phase II) — runs locally, no AWS account

The framework is implemented end to end and runs entirely on a laptop. **Every
AWS service is simulated**: [moto](https://github.com/getmoto/moto) stands in
for S3, SNS/SQS, STS, IAM, CloudFormation, CloudWatch, ECS and Application Auto
Scaling; a mock Cognito user pool provides the OAuth 2.0 Hosted UI; Postgres
stands in for Timestream. Only dummy credentials (`test`/`test`) are ever used.

```bash
docker compose up --build        # Postgres + moto + mock Cognito + API + dashboard
# or, without Docker (SQLite + moto_server):
make install && make dev
```

Open http://localhost:3000 and sign in through the (simulated) Cognito Hosted UI:

| User | Password | Groups | Can |
|---|---|---|---|
| `operator@capplan.example` | `Operator#2026` | operators | view, approve/reject scaling, connect accounts |
| `admin@capplan.example` | `Admin#2026` | admins, operators | + edit scaling policy, control the simulation clock, remove accounts |

Then **AWS Accounts → Launch quick-create stack** to connect one of the sample
accounts (e.g. `111122223333`, StreamCo Production). That runs a simulated
CloudFormation stack that creates `CapPlanReadOnlyRole` (trusting the platform
with a unique ExternalId); the API calls `sts:AssumeRole`, creates the account's
ECS services, backfills history and starts planning. A simulation clock replays
one 5-minute step every 10 s (`SIM_TICK_SECONDS`).

### What maps to what

| Architecture (AWS) | Local implementation |
|---|---|
| CloudFront/CloudWatch → Kinesis Firehose | telemetry replayer → moto CloudWatch `PutMetricData` + Postgres `metrics` |
| S3 raw / curated | moto S3 `capplan-raw`, `capplan-curated` |
| Timestream | Postgres (`src/database`) |
| Glue / Lambda features | `capplan_ml.features` (validation, 5-min resampling, gap repair, lags, seasonality, scheduled events) |
| SageMaker TSFM inference | `capplan_ml.models` — real seasonal-naive / XGBoost / LSTM; **simulated** Chronos / TimesFM / Moirai / TTM |
| Capacity planner | `capplan_ml.capacity` — `ceil(P90 / throughput × (1 + margin))`, min/max, hysteresis, cooldown, budget cap |
| Application Auto Scaling / ECS | moto ECS `UpdateService` in the customer account (via assumed role) |
| SNS alerts / approval | moto SNS topic → SQS subscriber; approval workflow in the dashboard |
| Cognito + API Gateway | `src/aws/mock_cognito` (PKCE, RS256 JWT, JWKS) + JWT authoriser in the API |
| Cost Explorer | `mock_aws.cost_explorer` — `GetCostAndUsage` / `GetCostForecast`-shaped responses |
| QuickSight | Next.js dashboard (`src/frontend`) |

### Data and honesty notes

* The dataset is a **bundled, seeded synthetic trace** shaped like Alibaba
  Cluster Trace v2018 `machine_usage`, with a transparent streaming overlay
  (see [Dataset Details](dataset/Dataset_Details.md)). `make kaggle` can drive
  the demand shape from a real Kaggle series (default: NAB AWS CloudWatch
  metrics) and falls back to synthetic data when no Kaggle token is present.
* **Foundation models are simulated** (no weights are downloaded or run).
  They are emulated from documented error, latency and hosting profiles and
  are labelled `simulated` everywhere they appear. The three baselines are real
  models trained on the data.
* In the backtest the event-aware XGBoost/LSTM baselines are the most accurate,
  so capacity-first model selection picks them. Predictive P90 scaling cuts
  cost by ~13% versus reactive CPU-target scaling with fewer SLA-violation
  minutes. See [results](results/README.md).

### Commands

| Command | What it does |
|---|---|
| `make data` | generate + preprocess the dataset → `dataset/processed/` |
| `make backtest` | fit all 7 models, rolling-origin backtest, policy simulation → `results/` |
| `make test` | pytest: guardrails, features, PKCE/JWT, cross-account connect, full API loop |
| `make dev` / `make up` | run the stack without / with Docker |

Component docs: [ai_models](src/ai_models/README.md) · [backend](src/backend/README.md) ·
[aws](src/aws/README.md) · [database](src/database/README.md) · [frontend](src/frontend/README.md).

## Branching

- `main`
- `develop`
- `feature/piyush`
- `feature/chirayu`
- `feature/sujal`

Changes should move through pull requests from feature branches to `develop`, followed by a stable merge to `main` and the tag `v1.0-Phase1`.
