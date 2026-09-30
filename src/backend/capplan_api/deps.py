from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy.orm import Session

from capplan_db.session import SessionLocal


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


from fastapi import Depends, HTTPException, Request  # noqa: E402
from sqlalchemy import select  # noqa: E402

from capplan_db.models import Account  # noqa: E402


def account_scope(request: Request, db: Session = Depends(get_db)) -> Account:
    """Account selected by the BFF (``x-capplan-account`` header or
    ``?account=``); defaults to the first connected account."""
    wanted = request.headers.get("x-capplan-account") or request.query_params.get("account")
    q = select(Account).where(Account.status == "connected")
    acct = None
    if wanted:
        acct = db.scalars(q.where((Account.id == wanted) | (Account.aws_account_id == wanted))).first()
    if acct is None:
        acct = db.scalars(q.order_by(Account.connected_at)).first()
    if acct is None:
        raise HTTPException(409, {"code": "no_connected_account", "message": "Connect an AWS account first."})
    return acct
