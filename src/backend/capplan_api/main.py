"""CapPlan API.

    uvicorn capplan_api.main:app --port 8000
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from capplan_db import session as dbs
from capplan_db.seed import seed_results
from capplan_ml import config as mlconfig
from mock_aws import resources

from .config import get_settings
from .routers import accounts, alerts, benchmarks, capacity, confidence, cost, forecasts, system
from .runtime import runtime
from .services import engine
from .services import scheduler as sched_mod

log = logging.getLogger("capplan")
ALEMBIC_INI = Path(__file__).resolve().parents[2] / "database" / "alembic.ini"


def migrate(url: str) -> None:
    if os.environ.get("CAPPLAN_DB_CREATE_ALL") == "1" or url.startswith("sqlite"):
        from capplan_db import models  # noqa: F401 - register tables

        dbs.Base.metadata.create_all(dbs.engine)
        return
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(ALEMBIC_INI.parent / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    for attempt in range(30):
        try:
            command.upgrade(cfg, "head")
            return
        except Exception as exc:  # noqa: BLE001 - database may still be starting
            if attempt == 29:
                raise
            log.warning("database not ready (%s); retrying", exc)
            time.sleep(2)


def bootstrap_aws() -> None:
    for attempt in range(20):
        try:
            engine.PLATFORM.update(resources.bootstrap_platform())
            for key, path in (
                ("telemetry_5min.parquet", mlconfig.PROCESSED_DIR / "telemetry_5min.parquet"),
                ("manifest.json", mlconfig.PROCESSED_DIR / "manifest.json"),
            ):
                if path.exists():
                    resources.upload_file(resources.CURATED_BUCKET, key, path)
            for key in ("MANIFEST.json", "events.csv"):
                path = mlconfig.RAW_DIR / key
                if path.exists():
                    resources.upload_file(resources.RAW_BUCKET, key, path)
            engine.AWS_STATUS.update(ok=True, lastOkAt=datetime.now(timezone.utc).isoformat())
            return
        except Exception as exc:  # noqa: BLE001 - fake AWS may still be starting
            engine.AWS_STATUS.update(ok=False, lastError=f"bootstrap: {exc}"[:300])
            log.warning("AWS bootstrap failed (%s); retrying", exc)
            time.sleep(1.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    s = get_settings()
    dbs.init(s.database_url)
    migrate(s.database_url)
    runtime.load(auto_bootstrap=s.auto_bootstrap)
    with dbs.SessionLocal() as db:
        seed_results(db, mlconfig.RESULTS_DIR, runtime.time_at(runtime.live_start))
        engine.sim_state(db)
    bootstrap_aws()
    with dbs.SessionLocal() as db:
        restored = engine.restore_accounts(db)
        if restored:
            log.info("re-created simulated AWS resources for %d account(s)", restored)
    if s.scheduler_enabled:
        sched_mod.scheduler = sched_mod.Scheduler(s.sim_tick_seconds)
        sched_mod.scheduler.start()
    yield
    if sched_mod.scheduler:
        sched_mod.scheduler.stop()
        sched_mod.scheduler = None


app = FastAPI(title="CapPlan API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
for r in (system, accounts, forecasts, capacity, confidence, alerts, cost, benchmarks):
    app.include_router(r.router)


@app.get("/health")
def health():
    return {"status": "ok", "runtimeLoaded": runtime.loaded}
