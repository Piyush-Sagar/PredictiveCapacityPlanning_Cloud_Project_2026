"""ORM models. Column names are snake_case; the API layer maps them to the
camelCase shapes in ``src/frontend/lib/types.ts``."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .session import Base

TS = DateTime(timezone=True)


class User(Base):
    __tablename__ = "users"
    sub: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(TS)
    last_login_at: Mapped[datetime] = mapped_column(TS)


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    aws_account_id: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    alias: Mapped[str] = mapped_column(String(64))
    display_name: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | connected | error | disconnected
    external_id: Mapped[str] = mapped_column(String(64))
    role_arn: Mapped[str | None] = mapped_column(String(256), nullable=True)
    stack_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    scale: Mapped[float] = mapped_column(Float, default=1.0)
    regions: Mapped[list] = mapped_column(JSON, default=list)
    policy: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(TS)
    connected_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class SimState(Base):
    """Single-row simulation clock shared by all accounts."""

    __tablename__ = "sim_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    cursor: Mapped[int] = mapped_column(Integer)
    now: Mapped[datetime] = mapped_column(TS)
    tick: Mapped[int] = mapped_column(Integer, default=0)
    last_tick_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    last_tick_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    info: Mapped[dict] = mapped_column(JSON, default=dict)


class Metric(Base):
    """5-minute operational metrics (Timestream stand-in)."""

    __tablename__ = "metrics"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    region: Mapped[str] = mapped_column(String(16))
    ts: Mapped[datetime] = mapped_column(TS)
    viewers_k: Mapped[float] = mapped_column(Float)
    requests_per_s: Mapped[float] = mapped_column(Float)
    cpu_util: Mapped[float] = mapped_column(Float)
    latency_ms: Mapped[float] = mapped_column(Float)
    error_rate: Mapped[float] = mapped_column(Float)
    bytes_out_gb: Mapped[float] = mapped_column(Float)
    __table_args__ = (UniqueConstraint("account_id", "region", "ts"), Index("ix_metrics_acct_region_ts", "account_id", "region", "ts"))


class ForecastRow(Base):
    __tablename__ = "forecasts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    region: Mapped[str] = mapped_column(String(16))
    model: Mapped[str] = mapped_column(String(32))
    origin_ts: Mapped[datetime] = mapped_column(TS)
    target_ts: Mapped[datetime] = mapped_column(TS)
    lead: Mapped[int] = mapped_column(Integer)
    p50: Mapped[float] = mapped_column(Float)
    p90: Mapped[float] = mapped_column(Float)
    __table_args__ = (
        UniqueConstraint("account_id", "region", "model", "origin_ts", "lead"),
        Index("ix_forecasts_target", "account_id", "region", "model", "lead", "target_ts"),
    )


class FleetState(Base):
    __tablename__ = "fleet_state"
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)
    region: Mapped[str] = mapped_column(String(16), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    current_units: Mapped[int] = mapped_column(Integer)
    controller: Mapped[dict] = mapped_column(JSON, default=dict)
    suppress_until_tick: Mapped[int] = mapped_column(Integer, default=0)


class Recommendation(Base):
    """Latest capacity recommendation per (account, region, resource)."""

    __tablename__ = "capacity_recommendations"
    id: Mapped[str] = mapped_column(String(96), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    region: Mapped[str] = mapped_column(String(16))
    resource_type: Mapped[str] = mapped_column(String(32))
    ts: Mapped[datetime] = mapped_column(TS)
    model: Mapped[str] = mapped_column(String(32))
    forecast_p90: Mapped[float] = mapped_column(Float)
    throughput_per_unit: Mapped[float] = mapped_column(Float)
    safety_margin_pct: Mapped[float] = mapped_column(Float)
    raw_required_units: Mapped[int] = mapped_column(Integer)
    required_units: Mapped[int] = mapped_column(Integer)
    current_units: Mapped[int] = mapped_column(Integer)
    min_units: Mapped[int] = mapped_column(Integer)
    max_units: Mapped[int] = mapped_column(Integer)
    hysteresis_active: Mapped[bool] = mapped_column(Boolean)
    cooldown_remaining_sec: Mapped[int] = mapped_column(Integer)
    budget_threshold_usd: Mapped[float] = mapped_column(Float)
    budget_capped: Mapped[bool] = mapped_column(Boolean, default=False)
    estimated_cost_usd: Mapped[float] = mapped_column(Float)
    decision_state: Mapped[str] = mapped_column(String(16))


class ScalingDecision(Base):
    """Audit trail of every executed scaling action."""

    __tablename__ = "scaling_decisions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    region: Mapped[str] = mapped_column(String(16))
    resource_type: Mapped[str] = mapped_column(String(32))
    ts: Mapped[datetime] = mapped_column(TS)
    from_units: Mapped[int] = mapped_column(Integer)
    to_units: Mapped[int] = mapped_column(Integer)
    trigger: Mapped[str] = mapped_column(String(16))  # auto | approval
    actor: Mapped[str] = mapped_column(String(255))
    model: Mapped[str] = mapped_column(String(32))
    forecast_p90: Mapped[float] = mapped_column(Float)
    aws_desired_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    aws_request: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    dedupe_key: Mapped[str] = mapped_column(String(128), index=True)
    type: Mapped[str] = mapped_column(String(24))
    severity: Mapped[str] = mapped_column(String(12))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    region: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(TS)
    updated_at: Mapped[datetime] = mapped_column(TS)
    related_recommendation_id: Mapped[str | None] = mapped_column(String(96), nullable=True)
    status: Mapped[str] = mapped_column(String(16))  # pending | approved | rejected | auto-executed
    resolved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    sns_message_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ConfidenceSnapshot(Base):
    __tablename__ = "confidence_snapshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(16))  # backtest | live
    model: Mapped[str] = mapped_column(String(32))
    horizon: Mapped[int] = mapped_column(Integer)
    region: Mapped[str] = mapped_column(String(16))
    target_coverage_pct: Mapped[float] = mapped_column(Float)
    actual_coverage_pct: Mapped[float] = mapped_column(Float)
    calibration_error_pct: Mapped[float] = mapped_column(Float)
    confidence_score: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    fallback_model: Mapped[str | None] = mapped_column(String(32), nullable=True)
    as_of: Mapped[datetime] = mapped_column(TS)
    __table_args__ = (UniqueConstraint("account_id", "source", "model", "horizon"),)


class BenchmarkResult(Base):
    __tablename__ = "benchmark_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model: Mapped[str] = mapped_column(String(32))
    model_type: Mapped[str] = mapped_column(String(16))
    horizon: Mapped[int] = mapped_column(Integer)
    mae: Mapped[float] = mapped_column(Float)
    rmse: Mapped[float] = mapped_column(Float)
    smape: Mapped[float] = mapped_column(Float)
    mase: Mapped[float] = mapped_column(Float)
    p90_coverage_pct: Mapped[float] = mapped_column(Float)
    inference_latency_ms: Mapped[float] = mapped_column(Float)
    cost_per_1k_usd: Mapped[float] = mapped_column(Float)
    memory_mb: Mapped[int] = mapped_column(Integer)
    simulated: Mapped[bool] = mapped_column(Boolean)
    host: Mapped[str] = mapped_column(String(64))
    segments: Mapped[dict] = mapped_column(JSON, default=dict)
    __table_args__ = (UniqueConstraint("model", "horizon"),)


class CostSlaDaily(Base):
    __tablename__ = "cost_sla_metrics"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(16))  # backtest | live
    day: Mapped[datetime] = mapped_column(TS)
    region: Mapped[str] = mapped_column(String(16))
    instance_hours: Mapped[float] = mapped_column(Float, default=0)
    task_hours: Mapped[float] = mapped_column(Float, default=0)
    model_inference_cost_usd: Mapped[float] = mapped_column(Float, default=0)
    infrastructure_cost_usd: Mapped[float] = mapped_column(Float, default=0)
    sla_violation_minutes: Mapped[int] = mapped_column(Integer, default=0)
    overload_events: Mapped[int] = mapped_column(Integer, default=0)
    underutilization_events: Mapped[int] = mapped_column(Integer, default=0)
    scaling_oscillations: Mapped[int] = mapped_column(Integer, default=0)
    cost_by_resource: Mapped[dict] = mapped_column(JSON, default=dict)
    __table_args__ = (UniqueConstraint("account_id", "source", "day", "region"),)


class PolicySummary(Base):
    __tablename__ = "policy_summary"
    policy: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(128))
    sla_violation_minutes: Mapped[int] = mapped_column(Integer)
    overload_events: Mapped[int] = mapped_column(Integer)
    underutilization_events: Mapped[int] = mapped_column(Integer)
    scaling_oscillations: Mapped[int] = mapped_column(Integer)
    infrastructure_cost_usd: Mapped[float] = mapped_column(Float)
    model_inference_cost_usd: Mapped[float] = mapped_column(Float)
    total_cost_usd: Mapped[float] = mapped_column(Float)
    avg_utilization_pct: Mapped[float] = mapped_column(Float)
