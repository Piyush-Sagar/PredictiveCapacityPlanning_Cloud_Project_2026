"""Identity, simulation clock, pipeline status, policy and notifications."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from capplan_db.models import Account, Alert, ForecastRow, Metric, ScalingDecision
from capplan_ml import config
from mock_aws import clients, resources

from ..auth import Principal, current_principal, require_admin, require_operator
from ..config import get_settings
from ..deps import account_scope, get_db
from ..runtime import runtime
from ..serializers import iso
from ..services import engine, scheduler as sched_mod

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/me")
def me(p: Principal = Depends(current_principal)):
    initials = "".join(w[0] for w in (p.name or p.email).replace("@", " ").split()[:2]).upper() or "U"
    return {"sub": p.sub, "email": p.email, "name": p.name, "role": p.role, "groups": p.groups, "avatarInitials": initials}


def _clock(db: Session) -> dict:
    st = engine.sim_state(db)
    s = sched_mod.scheduler
    return {
        "now": iso(st.now),
        "tick": st.tick,
        "cursor": st.cursor,
        "stepMinutes": config.STEP_MINUTES,
        "tickSeconds": s.interval_s if s else get_settings().sim_tick_seconds,
        "running": bool(s and s.running),
        "lastTickAt": iso(st.last_tick_at),
        "lastTickMs": st.last_tick_ms,
        "liveWindow": {"start": iso(runtime.time_at(runtime.live_start)), "end": iso(runtime.time_at(runtime.last_valid_cursor()))},
    }


@router.get("/clock")
def clock(db: Session = Depends(get_db), _: Principal = Depends(require_operator)):
    return _clock(db)


@router.post("/pipeline/step")
def step(_: Principal = Depends(require_admin)):
    if not sched_mod.scheduler:
        raise HTTPException(503, "scheduler not running")
    st = sched_mod.scheduler.step()
    return {"tick": st.tick, "now": iso(st.now)}


class ClockUpdate(BaseModel):
    running: bool | None = None
    tickSeconds: float | None = Field(default=None, ge=1, le=300)


@router.put("/pipeline/clock")
def set_clock(body: ClockUpdate, db: Session = Depends(get_db), _: Principal = Depends(require_admin)):
    s = sched_mod.scheduler
    if not s:
        raise HTTPException(503, "scheduler not running")
    if body.running is not None:
        s.running = body.running
    if body.tickSeconds is not None:
        s.interval_s = body.tickSeconds
    return _clock(db)


@router.get("/pipeline/status")
def pipeline_status(db: Session = Depends(get_db), acct: Account = Depends(account_scope), _: Principal = Depends(require_operator)):
    st = engine.sim_state(db)
    now = engine._utc(st.now)
    hour_ago = now - timedelta(hours=1)
    n_metrics = db.scalar(select(func.count()).select_from(Metric).where(Metric.account_id == acct.id, Metric.ts > hour_ago)) or 0
    n_fc = db.scalar(select(func.count()).select_from(ForecastRow).where(ForecastRow.account_id == acct.id, ForecastRow.origin_ts > hour_ago)) or 0
    n_dec = db.scalar(select(func.count()).select_from(ScalingDecision).where(ScalingDecision.account_id == acct.id, ScalingDecision.ts > now - timedelta(hours=24))) or 0
    n_alerts = db.scalar(select(func.count()).select_from(Alert).where(Alert.account_id == acct.id, Alert.sns_message_id.is_not(None))) or 0
    aws_ok = engine.AWS_STATUS.get("ok")
    aws_state = "ok" if aws_ok else ("unknown" if aws_ok is None else "degraded")
    last = iso(st.last_tick_at)
    stages = [
        {"key": "telemetry", "label": "Telemetry ingest", "awsService": "CloudWatch → Kinesis Data Firehose", "localStandIn": "moto CloudWatch + replayed trace", "status": aws_state, "detail": f"{n_metrics} five-minute windows in the last hour", "lastRunAt": last},
        {"key": "storage", "label": "Raw / curated storage", "awsService": "S3 + Timestream", "localStandIn": "moto S3 + Postgres `metrics`", "status": "ok", "detail": f"s3://{resources.CURATED_BUCKET}/telemetry_5min.parquet", "lastRunAt": last},
        {"key": "features", "label": "Resampling & features", "awsService": "AWS Glue / Lambda", "localStandIn": "capplan_ml.features", "status": "ok", "detail": "lags, rolling stats, seasonality, scheduled events", "lastRunAt": last},
        {"key": "inference", "label": "TSFM inference", "awsService": "SageMaker AI endpoint", "localStandIn": "in-process forecasters", "status": "ok", "detail": f"{n_fc} forecast points in the last hour · models {', '.join(runtime.live_models())}", "lastRunAt": last},
        {"key": "planner", "label": "Capacity planner", "awsService": "Lambda", "localStandIn": "capplan_ml.capacity", "status": "ok", "detail": f"ceil(P90 / throughput × (1 + margin)) · primary {runtime.planning_model}", "lastRunAt": last},
        {"key": "scaling", "label": "Guarded scaling", "awsService": "Application Auto Scaling / ECS", "localStandIn": "moto ECS UpdateService", "status": aws_state, "detail": f"{n_dec} scaling actions in the last 24 h", "lastRunAt": last},
        {"key": "alerts", "label": "Alerts & approvals", "awsService": "SNS", "localStandIn": f"moto SNS topic {resources.ALERT_TOPIC}", "status": aws_state if engine.PLATFORM.get("topicArn") else "degraded", "detail": f"{n_alerts} notifications published", "lastRunAt": last},
        {"key": "auth", "label": "Authentication", "awsService": "Cognito + API Gateway", "localStandIn": "mock Cognito (PKCE, RS256 JWT)", "status": "ok", "detail": get_settings().cognito_issuer, "lastRunAt": last},
    ]
    return {
        "clock": _clock(db),
        "stages": stages,
        "selection": {str(k): v for k, v in runtime.selection.items()},
        "planningModel": runtime.planning_model,
        "dataset": runtime.manifest.get("raw", {}),
        "preprocessing": runtime.manifest.get("preprocessing", {}),
        "aws": {**engine.AWS_STATUS, "endpoint": clients.endpoint_url(), "platformAccount": clients.PLATFORM_ACCOUNT_ID, **engine.PLATFORM},
        "schedulerError": sched_mod.scheduler.last_error if sched_mod.scheduler else "scheduler disabled",
        "account": {"id": acct.id, "awsAccountId": acct.aws_account_id, "alias": acct.alias},
    }


class PolicyUpdate(BaseModel):
    safetyMarginPct: float | None = Field(default=None, ge=0, le=1)
    mode: str | None = Field(default=None, pattern="^(auto|approve-all|recommend-only)$")
    hysteresisPct: float | None = Field(default=None, ge=0, le=0.5)
    hysteresisPeriods: int | None = Field(default=None, ge=0, le=12)
    scaleInCooldownSec: int | None = Field(default=None, ge=0, le=7200)
    budgetMultiplier: float | None = Field(default=None, gt=0, le=10)
    autoExecuteMaxChangePct: float | None = Field(default=None, ge=0, le=1)
    approvalMinChangePct: float | None = Field(default=None, ge=0, le=5)


@router.get("/policy")
def get_policy(acct: Account = Depends(account_scope), _: Principal = Depends(require_operator)):
    return engine.account_policy(acct)


@router.put("/policy")
def put_policy(body: PolicyUpdate, db: Session = Depends(get_db), acct: Account = Depends(account_scope), _: Principal = Depends(require_admin)):
    merged = {**(acct.policy or {}), **body.model_dump(exclude_none=True)}
    acct.policy = merged
    db.commit()
    return engine.account_policy(acct)


@router.get("/notifications")
def notifications(_: Principal = Depends(require_operator)):
    """Most recent SNS deliveries, read back from the SQS subscriber."""
    q = engine.PLATFORM.get("queueUrl")
    if not q:
        return []
    return engine._aws(resources.recent_notifications, q) or []
