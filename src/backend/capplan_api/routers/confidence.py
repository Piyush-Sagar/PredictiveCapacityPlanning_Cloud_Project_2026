from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from capplan_db.models import Account, ConfidenceSnapshot
from capplan_ml import config

from .. import serializers as ser
from ..auth import require_operator
from ..deps import account_scope, get_db

router = APIRouter(prefix="/api/confidence", tags=["confidence"], dependencies=[Depends(require_operator)])


@router.get("")
def confidence(source: str = "live", db: Session = Depends(get_db), acct: Account = Depends(account_scope)):
    rows = []
    if source == "live":
        rows = db.scalars(select(ConfidenceSnapshot).where(ConfidenceSnapshot.account_id == acct.id, ConfidenceSnapshot.source == "live")).all()
    if not rows:
        rows = db.scalars(select(ConfidenceSnapshot).where(ConfidenceSnapshot.source == "backtest")).all()
    order = {m: i for i, m in enumerate(config.ALL_MODELS)}
    return [ser.confidence(r) for r in sorted(rows, key=lambda r: (order.get(r.model, 99), r.horizon))]
