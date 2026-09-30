"""Shared fixtures. Tests run fully in-process: SQLite instead of Postgres,
``moto.mock_aws`` instead of the moto server, and the mock Cognito app via
TestClient — no network, no Docker, no AWS account."""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

ROOT = Path(__file__).resolve().parents[1]

# Must be set before the apps are imported (settings are read at import time).
os.environ.setdefault("COGNITO_KEY_DIR", str(ROOT / ".pytest_cache" / "cognito-keys"))
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ.pop("AWS_ENDPOINT_URL", None)
os.environ.pop("OPENROUTER_API_KEY", None)  # assistant tests run in offline mode
os.environ.update(AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test", AWS_DEFAULT_REGION="us-east-1")

if sys.platform == "darwin":  # xgboost needs libomp; torch ships one
    import torch  # noqa: F401


@pytest.fixture(scope="session")
def artifacts():
    """Dataset + trained models + backtest outputs (generated once if missing)."""
    from capplan_ml import config
    from capplan_ml.pipeline import run_backtest, run_data

    if not (config.PROCESSED_DIR / "telemetry_5min.parquet").exists():
        run_data()
    if not (config.ARTIFACTS_DIR / "models.pkl").exists() or not (config.RESULTS_DIR / "summary.json").exists():
        run_backtest(verbose=False)
    return config


@pytest.fixture(scope="session")
def cognito():
    from fastapi.testclient import TestClient

    from mock_cognito import app as cognito_app

    return TestClient(cognito_app.app)


def pkce_pair():
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


REDIRECT = "http://localhost:3000/auth/callback"


def login(client, email: str, password: str) -> dict:
    verifier, challenge = pkce_pair()
    form = {
        "username": email,
        "password": password,
        "client_id": "capplan-web",
        "redirect_uri": REDIRECT,
        "state": "st",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "scope": "openid email profile",
    }
    r = client.post("/login", data=form, follow_redirects=False)
    assert r.status_code == 302, r.text
    code = parse_qs(urlparse(r.headers["location"]).query)["code"][0]
    r = client.post(
        "/oauth2/token",
        data={"grant_type": "authorization_code", "client_id": "capplan-web", "code": code, "redirect_uri": REDIRECT, "code_verifier": verifier},
    )
    assert r.status_code == 200, r.text
    return r.json()
