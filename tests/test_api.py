"""End-to-end API test: Cognito tokens → JWT authoriser → connect account →
simulation ticks → forecasts/capacity/cost → approve → ECS desired count."""

import os

import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from conftest import login


class _JWKS:
    def __init__(self, key):
        self._key = key

    def get_signing_key_from_jwt(self, _token):
        return type("K", (), {"key": self._key})()


@pytest.fixture(scope="module")
def env(artifacts, cognito, tmp_path_factory):
    db = tmp_path_factory.mktemp("db") / "capplan.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{db}"
    from capplan_api import auth
    from capplan_api.config import get_settings
    from mock_aws import clients
    from mock_cognito import app as cognito_app

    get_settings.cache_clear()
    auth.set_jwks_client(_JWKS(cognito_app.key.private.public_key()))
    with mock_aws():
        clients.reset_cache()
        from capplan_api.main import app

        with TestClient(app) as api:
            op = login(cognito, "operator@capplan.example", "Operator#2026")
            ad = login(cognito, "admin@capplan.example", "Admin#2026")
            yield {
                "api": api,
                "op": {"Authorization": f"Bearer {op['access_token']}"},
                "admin": {"Authorization": f"Bearer {ad['access_token']}"},
                "cognito": cognito,
            }
    clients.reset_cache()
    auth.set_jwks_client(None)


def _connect(env, account_id="111122223333"):
    api, op = env["api"], env["op"]
    r = api.post("/api/accounts", headers=op, json={"awsAccountId": account_id})
    assert r.status_code == 201, r.text
    acct, url = r.json()["account"], r.json()["consoleUrl"]
    from urllib.parse import parse_qs, urlparse

    q = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
    sub = env["cognito"].post("/console/cloudformation/quickcreate", data={**q, "ack": "1"}, follow_redirects=False)
    assert sub.status_code == 303, sub.text
    back = {k: v[0] for k, v in parse_qs(urlparse(sub.headers["location"]).query).items()}
    r = api.post(f"/api/accounts/{acct['id']}/connect/complete", headers=op, json={"roleArn": back["roleArn"], "stackId": back["stackId"], "state": back["state"]})
    assert r.status_code == 200, r.text
    return r.json()["account"]


def test_requires_token(env):
    assert env["api"].get("/api/me").status_code == 401
    assert env["api"].get("/api/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_roles(env):
    api = env["api"]
    assert api.get("/api/me", headers=env["op"]).json()["role"] == "operator"
    assert api.get("/api/me", headers=env["admin"]).json()["role"] == "admin"


def test_no_account_yet(env):
    r = env["api"].get("/api/capacity", headers=env["op"])
    assert r.status_code == 409


def test_full_loop(env):
    api, op, admin = env["api"], env["op"], env["admin"]
    acct = _connect(env)
    assert acct["status"] == "connected"

    from capplan_api.services import engine
    from capplan_db.session import SessionLocal

    for _ in range(8):
        with SessionLocal() as db:
            engine.tick(db)

    fc = api.get("/api/forecasts", params={"region": "us-east", "horizon": 30}, headers=op).json()
    assert fc["points"][fc["nowIndex"]]["isForecast"] is False
    assert sum(p["isForecast"] for p in fc["points"]) == 6
    assert all(p["p90"] >= p["p50"] for p in fc["points"])

    recs = api.get("/api/capacity", headers=op).json()
    assert len(recs) == 20 and all(r["requiredUnits"] >= r["minUnits"] for r in recs)

    decisions = api.get("/api/capacity/decisions", headers=op).json()
    assert all(d["awsDesiredCount"] == d["toUnits"] for d in decisions)

    cost = api.get("/api/cost/forecast", headers=op).json()
    assert len(cost["ForecastResultsByTime"]) == 14
    assert cost["nextHour"]["p90CostUsd"] >= cost["nextHour"]["p50CostUsd"] > 0
    usage = api.get("/api/cost/usage", params={"groupBy": "SERVICE"}, headers=op).json()
    assert usage["ResultsByTime"] and usage["ResultsByTime"][0]["Groups"]

    assert len(api.get("/api/confidence", headers=op).json()) == 21
    assert len(api.get("/api/benchmarks", headers=op).json()["results"]) == 21
    status = api.get("/api/pipeline/status", headers=op).json()
    assert {s["key"] for s in status["stages"]} >= {"telemetry", "inference", "scaling", "alerts", "auth"}


def test_approval_executes_scaling_in_customer_account(env):
    api, op = env["api"], env["op"]
    from capplan_api.services import engine
    from capplan_db.models import Account, Alert, FleetState, Recommendation
    from capplan_db.session import SessionLocal
    from mock_aws import clients, resources

    # Force an approval-sized proposal: halve the budget-free threshold for big changes.
    with SessionLocal() as db:
        acct = db.query(Account).first()
        rec = db.query(Recommendation).filter_by(account_id=acct.id, region="us-east", resource_type="ecs-task").one()
        fleet = db.get(FleetState, (acct.id, "us-east", "ecs-task"))
        target = rec.required_units + 7
        rec.required_units = target
        alert = engine.upsert_alert(
            db, acct, "scale:test", type="proposed-scale", severity="warning", title="test", description="d",
            region="us-east", now=engine._utc(engine.sim_state(db).now), related=rec.id,
        )
        db.commit()
        alert_id, account_id, old = alert.id, acct.id, fleet.current_units
        assert alert.sns_message_id, "warning alerts are published to SNS"

    notes = api.get("/api/notifications", headers=op).json()
    assert any(n["subject"] == "[CapPlan] test" for n in notes)

    r = api.post(f"/api/alerts/{alert_id}/approve", headers=op)
    assert r.status_code == 200, r.text
    d = r.json()["decision"]
    assert d["fromUnits"] == old and d["toUnits"] == target and d["trigger"] == "approval"

    with SessionLocal() as db:
        acct = db.get(Account, account_id)
        creds = engine.creds_for(acct)
    ecs = clients.assumed("ecs", creds, "us-east-1")
    svc = ecs.describe_services(cluster=resources.CLUSTER, services=["us-east-ecs-task"])["services"][0]
    assert svc["desiredCount"] == target
    assert api.post(f"/api/alerts/{alert_id}/approve", headers=op).status_code == 409


def test_policy_is_admin_only(env):
    api = env["api"]
    assert api.put("/api/policy", headers=env["op"], json={"mode": "approve-all"}).status_code == 403
    r = api.put("/api/policy", headers=env["admin"], json={"mode": "approve-all", "safetyMarginPct": 0.25})
    assert r.status_code == 200 and r.json()["mode"] == "approve-all"
    assert api.get("/api/policy", headers=env["op"]).json()["safetyMarginPct"] == 0.25


def test_delete_is_admin_only(env):
    api = env["api"]
    acct = _connect(env, "444455556666")
    assert api.delete(f"/api/accounts/{acct['id']}", headers=env["op"]).status_code == 403
    assert api.delete(f"/api/accounts/{acct['id']}", headers=env["admin"]).status_code == 204


@pytest.mark.parametrize(
    "question, tool",
    [
        ("How many viewers will US East have in the next hour?", "get_demand_forecast"),
        ("How many servers will we need for the next peak?", "get_capacity_plan"),
        ("What will this month cost?", "get_cost_outlook"),
        ("Any big events coming up tonight?", "get_upcoming_events"),
        ("Is predictive scaling worth it?", "get_policy_comparison"),
    ],
)
def test_assistant_offline_answers(env, question, tool):
    r = env["api"].post("/api/assistant/chat", headers=env["op"], json={"messages": [{"role": "user", "content": question}]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mode"] == "offline" and tool in body["toolsUsed"] and body["answer"]

