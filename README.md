# Predictive Capacity Planning Framework for Video Streaming Platforms using Time-Series Foundation Models

**Repository:** `PredictiveCapacityPlanning_Cloud_Project_2026`  
**Course:** BCSE355L - Cloud Architecture Design  
**Phase:** Phase I - Planning and Documentation  

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

## Repository Status

No production code is required in Phase I. Folders contain README placeholders describing their intended purpose and future deliverables.

## Branching

- `main`
- `develop`
- `feature/piyush`
- `feature/chirayu`
- `feature/sujal`

Changes should move through pull requests from feature branches to `develop`, followed by a stable merge to `main` and the tag `v1.0-Phase1`.
