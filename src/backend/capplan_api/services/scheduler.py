"""Background thread advancing the simulation clock (EventBridge schedule →
Lambda stand-in). One tick = one simulated 5-minute step."""

from __future__ import annotations

import logging
import threading
import time

from capplan_db.session import SessionLocal

from . import engine

log = logging.getLogger("capplan.scheduler")


class Scheduler:
    def __init__(self, interval_s: float):
        self.interval_s = interval_s
        self.running = True
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.lock = threading.Lock()  # serialises ticks with manual steps / approvals
        self.last_error: str | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._loop, name="capplan-scheduler", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def step(self):
        with self.lock, SessionLocal() as db:
            return engine.tick(db)

    def _loop(self) -> None:
        while not self._stop.wait(self.interval_s):
            if not self.running:
                continue
            try:
                st = self.step()
                self.last_error = None
                log.debug("tick %s → %s (%.0f ms)", st.tick, st.now, st.last_tick_ms or 0)
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                self.last_error = f"{type(exc).__name__}: {exc}"
                log.exception("tick failed")
                time.sleep(1)


scheduler: Scheduler | None = None
