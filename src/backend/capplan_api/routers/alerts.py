from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from capplan_db.models import Account, Alert

from .. import serializers as ser
from ..auth import Principal, require_operator
from ..deps import account_scope, get_db
from ..services import engine, scheduler as sched_mod

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", dependencies=[Depends(require_operator)])
def list_alerts(
    status: str | None = None,
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
    acct: Account = Depends(account_scope),
):
    q = select(Alert).where(Alert.account_id == acct.id)
    if status:
        q = q.where(Alert.status == status)
    return [ser.alert(a) for a in db.scalars(q.order_by(Alert.updated_at.desc()).limit(limit))]


def _get(db: Session, acct: Account, alert_id: str) -> Alert:
    a = db.get(Alert, alert_id)
    if a is None or a.account_id != acct.id:
        raise HTTPException(404, "alert not found")
    if a.status != "pending":
        raise HTTPException(409, f"alert already {a.status}")
    return a


def _locked(fn):
    lock = sched_mod.scheduler.lock if sched_mod.scheduler else None
    if lock is None:
        return fn()
    with lock:
        return fn()


@router.post("/{alert_id}/approve")
def approve(alert_id: str, db: Session = Depends(get_db), acct: Account = Depends(account_scope), p: Principal = Depends(require_operator)):
    def run():
        a = _get(db, acct, alert_id)
        d = engine.approve_alert(db, a, p.email or p.sub)
        return {"alert": ser.alert(a), "decision": ser.decision(d) if d else None}

    return _locked(run)


@router.post("/{alert_id}/reject")
def reject(alert_id: str, db: Session = Depends(get_db), acct: Account = Depends(account_scope), p: Principal = Depends(require_operator)):
    def run():
        a = _get(db, acct, alert_id)
        engine.reject_alert(db, a, p.email or p.sub)
        return {"alert": ser.alert(a)}

    return _locked(run)
