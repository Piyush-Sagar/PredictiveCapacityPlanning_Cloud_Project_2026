from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from capplan_db.models import BenchmarkResult
from capplan_ml import config

from .. import serializers as ser
from ..auth import require_operator
from ..deps import get_db
from ..runtime import runtime

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"], dependencies=[Depends(require_operator)])


@router.get("")
def benchmarks(db: Session = Depends(get_db)):
    order = {m: i for i, m in enumerate(config.ALL_MODELS)}
    rows = sorted(db.scalars(select(BenchmarkResult)).all(), key=lambda b: (order.get(b.model, 99), b.horizon))
    return {
        "results": [ser.benchmark(b) for b in rows],
        "selection": {str(k): v for k, v in runtime.selection.items()},
        "simulatedModels": runtime.summary.get("simulatedModels", []),
        "testWindow": {"start": runtime.summary.get("testStart"), "end": runtime.summary.get("testEnd")},
    }
