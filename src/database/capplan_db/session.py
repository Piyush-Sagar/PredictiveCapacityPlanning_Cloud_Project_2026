from __future__ import annotations

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DEFAULT_URL = "postgresql+psycopg://capplan:capplan@localhost:5432/capplan"


class Base(DeclarativeBase):
    pass


def database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_URL)


def make_engine(url: str | None = None):
    url = url or database_url()
    kwargs = {"pool_pre_ping": True, "future": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _fk(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

    return engine


engine = None
SessionLocal = sessionmaker(expire_on_commit=False, future=True)


def init(url: str | None = None):
    global engine
    engine = make_engine(url)
    SessionLocal.configure(bind=engine)
    return engine
