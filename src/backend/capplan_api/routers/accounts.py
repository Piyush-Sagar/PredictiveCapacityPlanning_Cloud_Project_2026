from __future__ import annotations

import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from capplan_db.models import Account
from capplan_ml import config
from capplan_ml.data import SAMPLE_ACCOUNTS
from mock_aws import sts_connect

from .. import serializers as ser
from ..auth import Principal, require_admin, require_operator
from ..config import get_settings
from ..deps import get_db
from ..runtime import runtime
from ..services import engine, scheduler as sched_mod

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class CreateAccount(BaseModel):
    awsAccountId: str = Field(pattern=r"^\d{12}$")
    alias: str | None = Field(default=None, max_length=64)
    displayName: str | None = Field(default=None, max_length=128)
    regions: list[str] | None = None
    scale: float | None = Field(default=None, gt=0.01, le=3.0)


class CompleteConnect(BaseModel):
    roleArn: str
    stackId: str | None = None
    state: str


def _console_url(acct: Account) -> str:
    s = get_settings()
    q = urlencode(
        {
            "accountId": acct.aws_account_id,
            "externalId": acct.external_id,
            "redirectUri": f"{s.frontend_url}/accounts/callback",
            "state": acct.id,
            "stackName": sts_connect.STACK_NAME,
        }
    )
    return f"{s.cognito_public_url}/console/cloudformation/quickcreate?{q}"


@router.get("")
def list_accounts(db: Session = Depends(get_db), _: Principal = Depends(require_operator)):
    rows = db.scalars(select(Account).order_by(Account.created_at)).all()
    return [ser.account(a, pending_alerts=engine.pending_alert_count(db, a.id)) for a in rows]


@router.get("/samples")
def sample_accounts(_: Principal = Depends(require_operator)):
    return SAMPLE_ACCOUNTS


@router.post("", status_code=201)
def create_account(body: CreateAccount, db: Session = Depends(get_db), p: Principal = Depends(require_operator)):
    sample = next((a for a in SAMPLE_ACCOUNTS if a["accountId"] == body.awsAccountId), None)
    regions = body.regions or (sample["regions"] if sample else ["us-east", "eu-west", "ap-south"])
    bad = [r for r in regions if r not in config.REGIONS]
    if bad:
        raise HTTPException(422, f"unknown regions: {bad}")
    acct = db.scalars(select(Account).where(Account.aws_account_id == body.awsAccountId)).first()
    if acct and acct.status == "connected":
        raise HTTPException(409, "account already connected")
    if acct is None:
        acct = Account(id=str(uuid.uuid4()), aws_account_id=body.awsAccountId, created_by=p.sub, created_at=datetime.now(timezone.utc))
        db.add(acct)
    acct.alias = body.alias or (sample["alias"] if sample else f"acct-{body.awsAccountId[-4:]}")
    acct.display_name = body.displayName or (sample["displayName"] if sample else f"AWS account {body.awsAccountId}")
    acct.regions = regions
    acct.scale = body.scale or (sample["scale"] if sample else 0.3)
    acct.status, acct.external_id, acct.role_arn, acct.last_error = "pending", sts_connect.new_external_id(), None, None
    acct.policy = acct.policy or {}
    db.commit()
    return {"account": ser.account(acct), "consoleUrl": _console_url(acct)}


@router.post("/{account_id}/connect/complete")
def complete_connect(account_id: str, body: CompleteConnect, db: Session = Depends(get_db), _: Principal = Depends(require_operator)):
    acct = db.get(Account, account_id)
    if acct is None:
        raise HTTPException(404, "account not found")
    if body.state != acct.id:
        raise HTTPException(400, "state mismatch")
    if acct.aws_account_id not in body.roleArn:
        raise HTTPException(400, "role belongs to a different account")
    try:
        creds = sts_connect.verify_and_assume(body.roleArn, acct.external_id)
    except sts_connect.ConnectError as exc:
        acct.status, acct.last_error = "error", str(exc)
        db.commit()
        raise HTTPException(403, str(exc)) from exc
    acct.role_arn, acct.stack_id = body.roleArn, body.stackId
    engine._CREDS[acct.id] = creds
    lock = sched_mod.scheduler.lock if sched_mod.scheduler else None
    if lock:
        lock.acquire()
    try:
        acct.status, acct.connected_at, acct.last_error = "connected", datetime.now(timezone.utc), None
        runtime.forget(acct.id)
        engine.connect_account(db, acct, creds)
        db.commit()
    except Exception as exc:
        db.rollback()
        acct = db.get(Account, account_id)
        acct.status, acct.last_error = "error", f"{type(exc).__name__}: {exc}"
        db.commit()
        raise
    finally:
        if lock:
            lock.release()
    return {"account": ser.account(acct), "assumedRoleArn": creds.get("AssumedRoleArn"), "expiration": creds.get("Expiration")}


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: str, db: Session = Depends(get_db), _: Principal = Depends(require_admin)):
    acct = db.get(Account, account_id)
    if acct is None:
        raise HTTPException(404, "account not found")
    lock = sched_mod.scheduler.lock if sched_mod.scheduler else None
    if lock:
        lock.acquire()
    try:
        db.delete(acct)
        db.commit()
    finally:
        if lock:
            lock.release()
    runtime.forget(account_id)
    engine.forget_creds(account_id)
