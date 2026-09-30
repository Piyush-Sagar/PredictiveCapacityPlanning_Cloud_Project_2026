from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from capplan_db.models import Account, ForecastRow, Metric
from capplan_ml import config

from ..auth import require_operator
from ..deps import account_scope, get_db
from ..runtime import runtime
from ..serializers import iso
from ..services import engine

router = APIRouter(prefix="/api/forecasts", tags=["forecasts"], dependencies=[Depends(require_operator)])


def build_series(db: Session, acct: Account, region: str, horizon: int) -> dict:
    if region not in acct.regions:
        raise HTTPException(404, f"region {region} is not enabled for this account")
    if horizon not in config.HORIZONS:
        raise HTTPException(422, f"horizon must be one of {config.HORIZONS}")
    st = engine.sim_state(db)
    now = engine._utc(st.now)
    k = config.HORIZON_STEPS[horizon]
    model = runtime.selection[horizon]
    start = now - timedelta(minutes=config.STEP_MINUTES * engine.HISTORY_STEPS)
    actual = {
        engine._utc(m.ts): m.viewers_k
        for m in db.scalars(
            select(Metric).where(Metric.account_id == acct.id, Metric.region == region, Metric.ts >= start, Metric.ts <= now)
        )
    }
    hist = {
        engine._utc(f.target_ts): f
        for f in db.scalars(
            select(ForecastRow).where(
                ForecastRow.account_id == acct.id,
                ForecastRow.region == region,
                ForecastRow.model == model,
                ForecastRow.lead == k,
                ForecastRow.target_ts >= start,
                ForecastRow.target_ts <= now,
            )
        )
    }
    future = db.scalars(
        select(ForecastRow)
        .where(
            ForecastRow.account_id == acct.id,
            ForecastRow.region == region,
            ForecastRow.model == model,
            ForecastRow.origin_ts == now,
            ForecastRow.lead <= k,
        )
        .order_by(ForecastRow.lead)
    ).all()
    points = []
    for i in range(engine.HISTORY_STEPS + 1):
        ts = start + timedelta(minutes=config.STEP_MINUTES * i)
        f = hist.get(ts)
        if f is None:
            continue
        pt = {"timestamp": iso(ts), "region": region, "horizonMinutes": horizon, "p50": round(f.p50, 1), "p90": round(f.p90, 1), "modelUsed": model, "isForecast": False}
        if ts in actual:
            pt["actual"] = round(actual[ts], 1)
        points.append(pt)
    now_index = len(points) - 1
    for f in future:
        points.append(
            {"timestamp": iso(f.target_ts), "region": region, "horizonMinutes": horizon, "p50": round(f.p50, 1), "p90": round(f.p90, 1), "modelUsed": model, "isForecast": True}
        )
    return {"region": region, "horizonMinutes": horizon, "generatedAt": iso(now), "nowIndex": now_index, "points": points}


@router.get("")
def forecast(region: str, horizon: int = Query(15), db: Session = Depends(get_db), acct: Account = Depends(account_scope)):
    return build_series(db, acct, region, horizon)


@router.get("/all")
def forecast_all(horizon: int = Query(15), db: Session = Depends(get_db), acct: Account = Depends(account_scope)):
    return [build_series(db, acct, r, horizon) for r in acct.regions]
