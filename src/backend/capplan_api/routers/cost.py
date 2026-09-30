"""Cost & SLA metrics, plus Cost Explorer-shaped usage and forecast endpoints."""

from __future__ import annotations

from datetime import timedelta

import numpy as np
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from capplan_db.models import Account, CostSlaDaily, FleetState, PolicySummary
from capplan_ml import config
from capplan_ml import metrics as mlm
from capplan_ml.capacity import required_units
from mock_aws import cost_explorer

from .. import serializers as ser
from ..auth import require_operator
from ..deps import account_scope, get_db
from ..runtime import runtime
from ..services import engine

router = APIRouter(prefix="/api", tags=["cost"], dependencies=[Depends(require_operator)])


def _rows(db: Session, acct: Account, days: int) -> list[CostSlaDaily]:
    now = engine._utc(engine.sim_state(db).now)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days - 1)
    rows = db.scalars(
        select(CostSlaDaily).where(CostSlaDaily.account_id == acct.id, CostSlaDaily.day >= start, CostSlaDaily.day <= today).order_by(CostSlaDaily.day, CostSlaDaily.region)
    ).all()
    # Live rows supersede backtest rows for the same day/region.
    best: dict[tuple, CostSlaDaily] = {}
    for r in rows:
        key = (engine._utc(r.day), r.region)
        if key not in best or r.source == "live":
            best[key] = r
    return [best[k] for k in sorted(best)]


@router.get("/cost-sla")
def cost_sla(days: int = Query(7, ge=1, le=30), db: Session = Depends(get_db), acct: Account = Depends(account_scope)):
    return [ser.cost_sla(r) for r in _rows(db, acct, days)]


@router.get("/cost-sla/policies")
def policies(db: Session = Depends(get_db)):
    rows = db.scalars(select(PolicySummary)).all()
    return {
        "systemPolicy": runtime.summary.get("systemPolicy"),
        "testWindow": {"start": runtime.summary.get("testStart"), "end": runtime.summary.get("testEnd")},
        "policies": [ser.policy_summary(p) for p in sorted(rows, key=lambda p: p.total_cost_usd)],
    }


def _usage_rows(rows: list[CostSlaDaily]) -> list[dict]:
    out = []
    for r in rows:
        services = {k: float(v) for k, v in (r.cost_by_resource or {}).items()}
        services["inference"] = float(r.model_inference_cost_usd)
        out.append({"day": cost_explorer.as_date(engine._utc(r.day)), "region": r.region, "services": services})
    return out


@router.get("/cost/usage")
def cost_and_usage(
    days: int = Query(7, ge=1, le=30),
    groupBy: str | None = Query(None, pattern="^(SERVICE|REGION)$"),
    db: Session = Depends(get_db),
    acct: Account = Depends(account_scope),
):
    """ce:GetCostAndUsage (DAILY, UnblendedCost)."""
    return cost_explorer.get_cost_and_usage(_usage_rows(_rows(db, acct, days)), groupBy)


@router.get("/cost/forecast")
def cost_forecast(days: int = Query(14, ge=1, le=60), db: Session = Depends(get_db), acct: Account = Depends(account_scope)):
    """ce:GetCostForecast plus a next-hour projection from the live demand forecast."""
    st = engine.sim_state(db)
    now = engine._utc(st.now)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    rows = _rows(db, acct, 8)
    daily: dict = {}
    today_so_far = 0.0
    for r in rows:
        total = r.infrastructure_cost_usd + r.model_inference_cost_usd
        d = engine._utc(r.day)
        if d == today:
            today_so_far += total
        else:
            daily[d] = daily.get(d, 0.0) + total
    history = [(cost_explorer.as_date(d), v) for d, v in sorted(daily.items())]
    forecast = cost_explorer.get_cost_forecast(history, cost_explorer.as_date(today), days)

    # Next hour: P50/P90 demand paths → units per fleet → cost.
    view = runtime.view(acct.id, acct.scale)
    model = runtime.selection[60]
    fleets = {(f.region, f.resource_type): f for f in db.scalars(select(FleetState).where(FleetState.account_id == acct.id))}
    by_region = []
    tot50 = tot90 = cur_cost = 0.0
    for region in acct.regions:
        f = engine._predict(view.series[region], model, [st.cursor])
        c50 = c90 = cc = 0.0
        for res in config.RESOURCE_TYPES:
            pol = engine.capacity_policy(acct, res)
            thr, price = config.throughput_per_unit(res), config.cost_per_unit_hour(res)
            step_h = config.STEP_MINUTES / 60
            c50 += sum(required_units(float(v), thr, pol.safety_margin_pct) for v in f.p50[0]) * price * step_h
            c90 += sum(required_units(float(v), thr, pol.safety_margin_pct) for v in f.p90[0]) * price * step_h
            fl = fleets.get((region, res))
            cc += (fl.current_units if fl else 0) * price
        by_region.append({"region": region, "p50CostUsd": round(c50, 2), "p90CostUsd": round(c90, 2), "currentRunRateUsdPerHour": round(cc, 2)})
        tot50, tot90, cur_cost = tot50 + c50, tot90 + c90, cur_cost + cc
    host = runtime.models[runtime.planning_model].profile.host
    inference_hour = mlm.daily_hosting_cost(host) * len(acct.regions) / len(config.REGIONS) / 24

    # Month-end projection.
    month_start = today.replace(day=1)
    mtd = sum(v for d, v in daily.items() if d >= month_start) + today_so_far
    remaining = [fr for fr in forecast["ForecastResultsByTime"] if fr["TimePeriod"]["Start"][:7] == today.strftime("%Y-%m")]
    rem_today = max(0.0, float(forecast["ForecastResultsByTime"][0]["MeanValue"]) - today_so_far) if forecast["ForecastResultsByTime"] else 0.0
    month_mean = mtd + rem_today + sum(float(x["MeanValue"]) for x in remaining[1:])
    month_lo = mtd + sum(float(x["PredictionIntervalLowerBound"]) for x in remaining[1:])
    month_hi = mtd + rem_today * 1.1 + sum(float(x["PredictionIntervalUpperBound"]) for x in remaining[1:])
    return {
        **forecast,
        "asOf": ser.iso(now),
        "todaySoFarUsd": round(today_so_far, 2),
        "nextHour": {
            "model": model,
            "p50CostUsd": round(tot50 + inference_hour, 2),
            "p90CostUsd": round(tot90 + inference_hour, 2),
            "currentRunRateUsdPerHour": round(cur_cost + inference_hour, 2),
            "byRegion": by_region,
        },
        "monthEnd": {"month": today.strftime("%Y-%m"), "monthToDateUsd": round(mtd, 2), "meanUsd": round(month_mean, 2), "lowerUsd": round(month_lo, 2), "upperUsd": round(month_hi, 2)},
        "history": [{"date": d.isoformat(), "costUsd": round(v, 2)} for d, v in history],
        "method": "linear trend on last 7 days of simulated Cost Explorer data; 80% interval from residual spread",
        "_n": int(np.size(history)),
    }
