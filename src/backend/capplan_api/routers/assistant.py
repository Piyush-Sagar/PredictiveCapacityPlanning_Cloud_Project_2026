from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from capplan_db.models import Account

from ..auth import require_operator
from ..deps import account_scope, get_db
from ..services import assistant

router = APIRouter(prefix="/api/assistant", tags=["assistant"], dependencies=[Depends(require_operator)])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


@router.get("/status")
def status():
    cfg = assistant.settings()
    return {"mode": cfg["mode"], "model": cfg["model"] if cfg["mode"] == "openrouter" else None, "provider": "OpenRouter"}


@router.post("/chat")
def chat(body: ChatRequest, db: Session = Depends(get_db), acct: Account = Depends(account_scope)):
    return assistant.chat(db, acct, [m.model_dump() for m in body.messages])
