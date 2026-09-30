from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from capplan_db.models import Account, Recommendation, ScalingDecision

from .. import serializers as ser
from ..auth import require_operator
from ..deps import account_scope, get_db

router = APIRouter(prefix="/api/capacity", tags=["capacity"], dependencies=[Depends(require_operator)])


@router.get("")
def recommendations(db: Session = Depends(get_db), acct: Account = Depends(account_scope)):
    rows = db.scalars(select(Recommendation).where(Recommendation.account_id == acct.id).order_by(Recommendation.region, Recommendation.resource_type))
    return [ser.recommendation(r) for r in rows]


@router.get("/decisions")
def decisions(limit: int = Query(100, le=1000), db: Session = Depends(get_db), acct: Account = Depends(account_scope)):
    rows = db.scalars(
        select(ScalingDecision).where(ScalingDecision.account_id == acct.id).order_by(ScalingDecision.ts.desc(), ScalingDecision.id.desc()).limit(limit)
    )
    return [ser.decision(d) for d in rows]
