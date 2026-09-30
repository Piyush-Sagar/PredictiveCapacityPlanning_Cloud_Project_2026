"""The closed control loop, one simulated 5-minute step at a time.

Per connected account and region, each tick:

1. **Telemetry**: ingest the next 5-minute window into ``metrics`` and publish
   it to the account's CloudWatch. CPU and latency come from the fleet's
   actual current capacity, so decisions feed back into the telemetry.
2. **Inference**: run the selected forecasters (plus the seasonal-naive
   fallback) for leads 1..12 and store the paths.
3. **Drift**: rolling P90 coverage and data quality decide whether the
   planner keeps its model or falls back.
4. **Capacity**: P90 → units through the guardrails for each resource fleet,
   then auto-execute via ECS UpdateService, raise an approval alert, or just
   recommend.
5. **Alerts / cost**: predicted peaks, SLA risk, and budget risk go out
   through SNS; cost and SLA counters accumulate for Cost Explorer.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from capplan_db.models import (
    Account,
    Alert,
    ConfidenceSnapshot,
    CostSlaDaily,
    FleetState,
    ForecastRow,
    Metric,
    Recommendation,
    ScalingDecision,
    SimState,
)
from capplan_ml import config, drift
from capplan_ml import metrics as mlm
from capplan_ml.capacity import CapacityController, CapacityPolicy, policy_for, required_units
from capplan_ml.features import RegionSeries
from mock_aws import resources, sts_connect

from ..config import get_settings
from ..runtime import runtime

log = logging.getLogger("capplan.engine")

HISTORY_STEPS = 72  # 6 h shown on forecast charts
BACKFILL_STEPS = HISTORY_STEPS + config.MAX_LEAD
DRIFT_WINDOW = 48
CONFIDENCE_EVERY = 6  # ticks
STEP_S = config.STEP_MINUTES * 60

POLICY_DEFAULTS = {
    "safetyMarginPct": config.DEFAULT_SAFETY_MARGIN_PCT,
    "mode": "auto",
    "hysteresisPct": 0.10,
    "hysteresisPeriods": 2,
    "scaleInCooldownSec": 600,
    "budgetMultiplier": 1.0,
    "autoExecuteMaxChangePct": 0.15,
    "approvalMinChangePct": 0.5,
}

# Shared, process-wide status used by /pipeline/status.
PLATFORM: dict = {"topicArn": None, "queueUrl": None}
AWS_STATUS: dict = {"ok": None, "lastError": None, "lastOkAt": None, "calls": 0, "failures": 0}
_CREDS: dict[str, dict] = {}


# --------------------------------------------------------------------------- helpers


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _aws(fn, *args, **kwargs):
    AWS_STATUS["calls"] += 1
    try:
        out = fn(*args, **kwargs)
        AWS_STATUS.update(ok=True, lastOkAt=datetime.now(timezone.utc).isoformat())
        return out
    except Exception as exc:  # noqa: BLE001 - the loop must survive a flaky fake AWS
        AWS_STATUS["failures"] += 1
        AWS_STATUS.update(ok=False, lastError=f"{type(exc).__name__}: {exc}"[:300])
        log.warning("AWS call %s failed: %s", getattr(fn, "__name__", fn), exc)
        return None


def account_policy(acct: Account) -> dict:
    return {**POLICY_DEFAULTS, **(acct.policy or {})}


def capacity_policy(acct: Account, resource: str) -> CapacityPolicy:
    p = account_policy(acct)
    return policy_for(
        resource,
        safety_margin_pct=float(p["safetyMarginPct"]),
        mode=p["mode"],
        hysteresis_pct=float(p["hysteresisPct"]),
        hysteresis_periods=int(p["hysteresisPeriods"]),
        scale_in_cooldown_s=int(p["scaleInCooldownSec"]),
        auto_execute_max_change=float(p["autoExecuteMaxChangePct"]),
        approval_min_change=float(p["approvalMinChangePct"]),
        budget_threshold_usd=round(config.budget_threshold(resource) * acct.scale * float(p["budgetMultiplier"]), 2),
        min_units=max(1, round(2 * acct.scale)),
        max_units=max(10, int(600 * acct.scale)),
    )


def creds_for(acct: Account, force: bool = False) -> dict:
    c = _CREDS.get(acct.id)
    if c and not force:
        exp = datetime.fromisoformat(c["Expiration"].replace("Z", "+00:00"))
        if _utc(exp) - datetime.now(timezone.utc) > timedelta(minutes=5):
            return c
    c = sts_connect.verify_and_assume(acct.role_arn, acct.external_id)
    _CREDS[acct.id] = c
    return c


def forget_creds(account_id: str) -> None:
    _CREDS.pop(account_id, None)


def sim_state(db: Session) -> SimState:
    st = db.get(SimState, 1)
    if st is None:
        start = datetime.fromisoformat(get_settings().sim_start.replace("Z", "+00:00"))
        cursor = min(max(runtime.index_of(start), runtime.live_start), runtime.last_valid_cursor())
        st = SimState(id=1, cursor=cursor, now=runtime.time_at(cursor), tick=0, info={"running": True})
        db.add(st)
        db.commit()
    return st


def _predict(s: RegionSeries, model: str, origins):
    with runtime.lock:
        return runtime.models[model].predict(s, np.asarray(origins, dtype=int))


def _telemetry(s: RegionSeries, c: int, ecs_units: int) -> dict:
    viewers = float(s.y[c])
    util = viewers / max(ecs_units * config.throughput_per_unit("ecs-task"), 1e-9)
    over = max(util - 0.85, 0.0)
    rng = np.random.default_rng([config.SEED, c, config.REGIONS.index(s.region)])
    return {
        "viewers_k": round(viewers, 3),
        "requests_per_s": round(viewers * 250 * (1 + rng.normal(0, 0.01)), 1),
        "cpu_util": round(float(np.clip(util * 92 + rng.normal(0, 1.5), 1, 100)), 2),
        "latency_ms": round(38 + 900 * over**2 + float(rng.gamma(2.0, 2.5)), 2),
        "error_rate": round(0.001 + 0.2 * over + abs(float(rng.normal(0, 0.0004))), 5),
        "bytes_out_gb": round(viewers * 1000 * 4.8 * STEP_S / 8 / 1000, 2),
    }


def _forecast_rows(acct_id, region, model, s, origins, f) -> list[dict]:
    rows = []
    for i, o in enumerate(origins):
        o_ts = runtime.time_at(int(o))
        for k in range(1, config.MAX_LEAD + 1):
            rows.append(
                {
                    "account_id": acct_id,
                    "region": region,
                    "model": model,
                    "origin_ts": o_ts,
                    "target_ts": o_ts + timedelta(minutes=config.STEP_MINUTES * k),
                    "lead": k,
                    "p50": round(float(f.p50[i, k - 1]), 3),
                    "p90": round(float(f.p90[i, k - 1]), 3),
                }
            )
    return rows


# --------------------------------------------------------------------------- alerts


def _latest_alert(db: Session, acct_id: str, key: str) -> Alert | None:
    return db.scalars(
        select(Alert).where(Alert.account_id == acct_id, Alert.dedupe_key == key).order_by(Alert.created_at.desc()).limit(1)
    ).first()


def upsert_alert(
    db: Session,
    acct: Account,
    key: str,
    *,
    type: str,
    severity: str,
    title: str,
    description: str,
    region: str,
    now: datetime,
    related: str | None = None,
    status: str = "pending",
) -> Alert:
    existing = _latest_alert(db, acct.id, key)
    if existing and existing.status == "pending" and status == "pending":
        existing.type, existing.severity, existing.title = type, severity, title
        existing.description, existing.updated_at, existing.related_recommendation_id = description, now, related
        alert = existing
    else:
        alert = Alert(
            id="al-" + uuid.uuid4().hex[:12],
            account_id=acct.id,
            dedupe_key=key,
            type=type,
            severity=severity,
            title=title,
            description=description,
            region=region,
            created_at=now,
            updated_at=now,
            related_recommendation_id=related,
            status=status,
            resolved_by="planner" if status == "auto-executed" else None,
            resolved_at=now if status == "auto-executed" else None,
        )
        db.add(alert)
    # Notify once, when an alert first reaches warning/critical (new or escalated).
    if PLATFORM.get("topicArn") and severity in ("warning", "critical") and not alert.sns_message_id:
        payload = {
            "alertId": alert.id,
            "account": acct.aws_account_id,
            "region": region,
            "type": type,
            "severity": severity,
            "title": title,
            "description": description,
            "simTime": now.isoformat(),
        }
        alert.sns_message_id = _aws(resources.publish_alert, PLATFORM["topicArn"], f"[CapPlan] {title}", payload)
    return alert


def _close_stale(db: Session, acct_id: str, key: str, now: datetime) -> None:
    a = _latest_alert(db, acct_id, key)
    if a and a.status == "pending":
        a.status, a.resolved_by, a.resolved_at, a.updated_at = "rejected", "planner: superseded", now, now


# --------------------------------------------------------------------------- execution


def execute(
    db: Session,
    acct: Account,
    fleet: FleetState,
    ctrl: CapacityController,
    units: int,
    now: datetime,
    *,
    trigger: str,
    actor: str,
    model: str,
    p90: float,
    creds: dict | None,
) -> ScalingDecision:
    aws_count = None
    if creds is not None:
        aws_count = _aws(resources.set_desired_count, creds, fleet.region, fleet.resource_type, units)
    prev = fleet.current_units
    now_s = int(now.timestamp())
    ctrl.apply(units, now_s)
    flags = dict(fleet.controller or {})
    direction = 1 if units > prev else -1
    osc = flags.get("last_dir", 0) not in (0, direction) and now_s - flags.get("last_change_s", -10**9) <= 6 * STEP_S
    flags.update(ctrl.state(), last_dir=direction, last_change_s=now_s, oscillated=bool(osc))
    fleet.controller = flags
    fleet.current_units = units
    decision = ScalingDecision(
        account_id=acct.id,
        region=fleet.region,
        resource_type=fleet.resource_type,
        ts=now,
        from_units=prev,
        to_units=units,
        trigger=trigger,
        actor=actor,
        model=model,
        forecast_p90=round(p90, 2),
        aws_desired_count=aws_count,
        aws_request=f"ecs:UpdateService {resources.CLUSTER}/{resources.service_name(fleet.region, fleet.resource_type)}",
    )
    db.add(decision)
    return decision


def _controller(acct: Account, fleet: FleetState) -> CapacityController:
    pol = capacity_policy(acct, fleet.resource_type)
    ctrl = CapacityController(pol, config.throughput_per_unit(fleet.resource_type), fleet.current_units)
    ctrl.load_state(fleet.controller or {})
    ctrl.current = fleet.current_units
    return ctrl


# --------------------------------------------------------------------------- drift / confidence


def live_drift(s: RegionSeries, model: str, c: int, lead: int = 3) -> tuple[str, str | None, float, float]:
    origins = np.arange(c - lead - DRIFT_WINDOW + 1, c - lead + 1)
    f = _predict(s, model, origins)
    cov = mlm.coverage(s.y[origins + lead], f.p90[:, lead - 1])
    cal_err = abs(config.TARGET_COVERAGE_PCT - cov)
    missing = float(np.mean(s.extra["was_missing"][max(0, c - 11) : c + 1])) if "was_missing" in s.extra else 0.0
    status, fallback = drift.calibration_status(model, cal_err, missing)
    return status, fallback, cov, missing


def refresh_confidence(db: Session, acct: Account, c: int, now: datetime) -> None:
    view = runtime.view(acct.id, acct.scale)
    origins = np.arange(c - config.MAX_LEAD - DRIFT_WINDOW, c + 1)
    for model in config.ALL_MODELS:
        per_region: dict[int, dict[str, float]] = {h: {} for h in config.HORIZONS}
        pooled: dict[int, list[bool]] = {h: [] for h in config.HORIZONS}
        for region in acct.regions:
            s = view.series[region]
            f = _predict(s, model, origins)
            for h in config.HORIZONS:
                k = config.HORIZON_STEPS[h]
                mask = origins + k <= c
                o = origins[mask][-DRIFT_WINDOW:]
                hits = s.y[o + k] <= f.p90[mask][-DRIFT_WINDOW:, k - 1]
                pooled[h].extend(hits.tolist())
                per_region[h][region] = float(np.mean(hits) * 100)
        for h in config.HORIZONS:
            cov = float(np.mean(pooled[h]) * 100)
            cal = round(abs(config.TARGET_COVERAGE_PCT - cov), 1)
            status, fb = drift.calibration_status(model, cal)
            worst = min(per_region[h], key=per_region[h].get)
            row = db.scalars(
                select(ConfidenceSnapshot).where(
                    ConfidenceSnapshot.account_id == acct.id,
                    ConfidenceSnapshot.source == "live",
                    ConfidenceSnapshot.model == model,
                    ConfidenceSnapshot.horizon == h,
                )
            ).first()
            if row is None:
                row = ConfidenceSnapshot(account_id=acct.id, source="live", model=model, horizon=h)
                db.add(row)
            row.region = worst
            row.target_coverage_pct = config.TARGET_COVERAGE_PCT
            row.actual_coverage_pct = round(cov, 1)
            row.calibration_error_pct = cal
            row.confidence_score = drift.confidence_score(model, cal)
            row.status, row.fallback_model, row.as_of = status, fb, now


# --------------------------------------------------------------------------- account lifecycle


def connect_account(db: Session, acct: Account, creds: dict) -> None:
    st = sim_state(db)
    c = st.cursor
    view = runtime.view(acct.id, acct.scale)
    db.execute(delete(FleetState).where(FleetState.account_id == acct.id))
    initial = {}
    for region in acct.regions:
        s = view.series[region]
        for resource in config.RESOURCE_TYPES:
            pol = capacity_policy(acct, resource)
            units = required_units(float(s.y[c]), config.throughput_per_unit(resource), pol.safety_margin_pct)
            units = min(max(units, pol.min_units), pol.max_units)
            initial[(region, resource)] = units
            db.add(FleetState(account_id=acct.id, region=region, resource_type=resource, current_units=units, controller={}, suppress_until_tick=0))
    _aws(resources.bootstrap_account, creds, acct.regions, config.RESOURCE_TYPES, initial)
    db.flush()
    backfill(db, acct, c)
    seed_account_costs(db, acct)
    seed_live_day(db, acct, c)
    refresh_confidence(db, acct, c, st.now)
    step_account(db, acct, st, creds, ingest=False)


def backfill(db: Session, acct: Account, c: int) -> None:
    """(Re)create the trailing metrics and forecast history ending at cursor ``c``."""
    db.execute(delete(Metric).where(Metric.account_id == acct.id))
    db.execute(delete(ForecastRow).where(ForecastRow.account_id == acct.id))
    view = runtime.view(acct.id, acct.scale)
    fleets = {(f.region, f.resource_type): f for f in db.scalars(select(FleetState).where(FleetState.account_id == acct.id))}
    metric_rows, fc_rows = [], []
    lo = c - BACKFILL_STEPS
    for region in acct.regions:
        s = view.series[region]
        ecs_units = fleets[(region, "ecs-task")].current_units if (region, "ecs-task") in fleets else 1
        for i in range(lo, c + 1):
            metric_rows.append({"account_id": acct.id, "region": region, "ts": runtime.time_at(i), **_telemetry(s, i, ecs_units)})
        origins = np.arange(lo - config.MAX_LEAD, c + 1)
        for model in runtime.live_models():
            fc_rows.extend(_forecast_rows(acct.id, region, model, s, origins, _predict(s, model, origins)))
    if metric_rows:
        db.execute(insert(Metric), metric_rows)
    if fc_rows:
        db.execute(insert(ForecastRow), fc_rows)


def seed_account_costs(db: Session, acct: Account) -> None:
    """Seven days of history from the offline policy simulation of the
    system policy, scaled to the account's size."""
    db.execute(delete(CostSlaDaily).where(CostSlaDaily.account_id == acct.id))
    pol = runtime.summary["systemPolicy"]
    df = runtime.policy_daily[(runtime.policy_daily["policy"] == pol) & (runtime.policy_daily["region"].isin(acct.regions))]
    rows = []
    for r in df.to_dict("records"):
        day = datetime.fromisoformat(str(r["timestamp"]))
        rows.append(
            {
                "account_id": acct.id,
                "source": "backtest",
                "day": _utc(day),
                "region": r["region"],
                "instance_hours": round(r["instanceHours"] * acct.scale, 1),
                "task_hours": round(r["taskHours"] * acct.scale, 1),
                "model_inference_cost_usd": float(r["modelInferenceCostUsd"]),
                "infrastructure_cost_usd": round(r["infrastructureCostUsd"] * acct.scale, 2),
                "sla_violation_minutes": int(r["slaViolationMinutes"]),
                "overload_events": int(r["overloadEvents"]),
                "underutilization_events": int(r["underutilizationEvents"]),
                "scaling_oscillations": int(r["scalingOscillations"]),
                "cost_by_resource": {res: round(float(r.get(f"cost_{res}", 0.0)) * acct.scale, 2) for res in config.RESOURCE_TYPES},
            }
        )
    if rows:
        db.execute(insert(CostSlaDaily), rows)


def seed_live_day(db: Session, acct: Account, c: int) -> None:
    """Fill today's live cost row for the steps before cursor ``c`` (the
    simulation may start mid-day), assuming the planner tracked P90 demand."""
    now = runtime.time_at(c)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = runtime.index_of(day)
    if start >= c:
        return
    view = runtime.view(acct.id, acct.scale)
    hours = STEP_S / 3600
    host = runtime.models[runtime.planning_model].profile.host
    for region in acct.regions:
        s = view.series[region]
        by_res = {r: 0.0 for r in config.RESOURCE_TYPES}
        task_h = inst_h = 0.0
        for i in range(start, c):
            demand = float(s.y[i])
            for resource in config.RESOURCE_TYPES:
                pol = capacity_policy(acct, resource)
                units = min(max(required_units(demand, config.throughput_per_unit(resource), pol.safety_margin_pct), pol.min_units), pol.max_units)
                by_res[resource] += units * config.cost_per_unit_hour(resource) * hours
                if resource == "ecs-task":
                    task_h += units * hours
                elif resource == "ec2-asg":
                    inst_h += units * hours
        db.add(
            CostSlaDaily(
                account_id=acct.id, source="live", day=day, region=region,
                instance_hours=round(inst_h, 2), task_hours=round(task_h, 2),
                model_inference_cost_usd=round(mlm.daily_hosting_cost(host) / len(config.REGIONS) * (c - start) / config.STEPS_PER_DAY, 4),
                infrastructure_cost_usd=round(sum(by_res.values()), 2),
                sla_violation_minutes=0, overload_events=0, underutilization_events=0, scaling_oscillations=0,
                cost_by_resource={k: round(v, 4) for k, v in by_res.items()},
            )
        )
    db.flush()


# --------------------------------------------------------------------------- the step


def step_account(db: Session, acct: Account, st: SimState, creds: dict | None, ingest: bool = True) -> None:
    view = runtime.view(acct.id, acct.scale)
    c, now = st.cursor, _utc(st.now)
    now_s = int(now.timestamp())
    fleets = {(f.region, f.resource_type): f for f in db.scalars(select(FleetState).where(FleetState.account_id == acct.id))}
    planning = runtime.planning_model
    host = runtime.models[planning].profile.host
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)

    for region in acct.regions:
        s = view.series[region]
        demand = float(s.y[c])

        # 1. telemetry
        if ingest:
            tel = _telemetry(s, c, fleets[(region, "ecs-task")].current_units)
            db.add(Metric(account_id=acct.id, region=region, ts=now, **tel))
            if creds is not None:
                _aws(
                    resources.put_metrics,
                    creds,
                    region,
                    now,
                    {"ConcurrentViewers": tel["viewers_k"] * 1000, "CPUUtilization": tel["cpu_util"], "Latency": tel["latency_ms"]},
                )

        # 2. inference
        paths = {}
        fc_rows = []
        for model in runtime.live_models():
            f = _predict(s, model, [c])
            paths[model] = f
            if ingest:
                fc_rows.extend(_forecast_rows(acct.id, region, model, s, [c], f))
        if fc_rows:
            db.execute(insert(ForecastRow), fc_rows)

        # 3. drift / fallback
        status, fallback, cov, missing = live_drift(s, planning, c)
        plan_model = planning if status != "fallback" else (fallback or "seasonal-naive")
        conf_key = f"conf:{planning}:{region}"
        if status == "fallback":
            reason = f"data gaps in {missing:.0%} of the last hour" if missing > drift.MAX_MISSING_FRACTION else f"rolling P90 coverage {cov:.1f}% vs 90% target"
            upsert_alert(
                db, acct, conf_key, type="low-confidence", severity="critical",
                title=f"{planning} falling back to {plan_model} in {region}",
                description=f"Planner switched to {plan_model} because of {reason}. It returns to {planning} automatically once confidence recovers.",
                region=region, now=now,
            )
        else:
            _close_stale(db, acct.id, conf_key, now)

        p90_plan = float(np.max(paths[plan_model].p90[0, 1:3]))

        # 4. SLA risk is judged against capacity in effect *before* this tick's actions.
        at_risk = [
            r for r in config.RESOURCE_TYPES if demand > fleets[(region, r)].current_units * config.throughput_per_unit(r)
        ]
        if at_risk:
            worst = max(at_risk, key=lambda r: demand / (fleets[(region, r)].current_units * config.throughput_per_unit(r)))
            pct = demand / (fleets[(region, worst)].current_units * config.throughput_per_unit(worst)) * 100
            upsert_alert(
                db, acct, f"sla:{region}", type="sla-risk", severity="critical",
                title=f"SLA risk: {worst} in {region} at {pct:.0f}% of capacity",
                description=f"Observed demand {demand:,.0f}k viewers exceeds provisioned capacity for {', '.join(at_risk)}. Approve pending scale-outs or raise the budget cap.",
                region=region, now=now,
            )

        # 5. capacity decisions
        for resource in config.RESOURCE_TYPES:
            fleet = fleets[(region, resource)]
            ctrl = _controller(acct, fleet)
            d = ctrl.decide(p90_plan, now_s)
            rec_id = f"{acct.alias}:{region}-{resource}"
            rec = db.get(Recommendation, rec_id)
            if rec is None:
                rec = Recommendation(id=rec_id, account_id=acct.id, region=region, resource_type=resource)
                db.add(rec)
            rec.ts, rec.model, rec.forecast_p90 = now, plan_model, round(p90_plan, 2)
            rec.throughput_per_unit = config.throughput_per_unit(resource)
            rec.safety_margin_pct = ctrl.policy.safety_margin_pct
            rec.raw_required_units, rec.required_units, rec.current_units = d.raw_required, d.required, d.current
            rec.min_units, rec.max_units = ctrl.policy.min_units, ctrl.policy.max_units
            rec.hysteresis_active, rec.cooldown_remaining_sec = d.hysteresis_active, d.cooldown_remaining_s
            rec.budget_threshold_usd, rec.budget_capped = ctrl.policy.budget_threshold_usd, d.budget_capped
            rec.estimated_cost_usd, rec.decision_state = d.estimated_daily_cost, d.decision_state

            key = f"scale:{region}:{resource}"
            flags = dict(fleet.controller or {})
            flags["oscillated"] = False
            fleet.controller = {**flags, **ctrl.state()}
            if d.required != d.current:
                magnitude = abs(d.change) / max(d.current, 1)
                if d.decision_state == "auto-execute":
                    execute(db, acct, fleet, ctrl, d.required, now, trigger="auto", actor="planner", model=plan_model, p90=p90_plan, creds=creds)
                    _close_stale(db, acct.id, key, now)
                    if magnitude > ctrl.policy.auto_execute_max_change:
                        upsert_alert(
                            db, acct, key, type="proposed-scale", severity="info",
                            title=f"Auto-scaled {resource} in {region} {d.current} → {d.required}",
                            description=f"P90 demand {p90_plan:,.0f}k (model {plan_model}) needed {d.required} units; scale-out within guardrails executed automatically.",
                            region=region, now=now, related=rec_id, status="auto-executed",
                        )
                elif st.tick >= fleet.suppress_until_tick:
                    direction = "out" if d.change > 0 else "in"
                    if d.decision_state == "approve":
                        if d.budget_capped:
                            sev, typ = "critical", "budget-risk"
                            title = f"{region} {resource} scaling exceeds budget"
                            desc = (
                                f"Forecast P90 {p90_plan:,.0f}k needs {d.raw_required} units but the daily budget of "
                                f"${ctrl.policy.budget_threshold_usd:,.0f} caps it at {d.required} (currently {d.current}, "
                                f"≈${d.estimated_daily_cost:,.0f}/day). Operator approval required."
                            )
                        else:
                            sev, typ = "warning", "proposed-scale"
                            title = f"Scale {resource} in {region} to {d.required} units"
                            desc = (
                                f"Forecast P90 demand {p90_plan:,.0f}k requires {d.required} units (currently {d.current}). "
                                f"A {magnitude:.0%} change exceeds the auto-execute guardrail and is awaiting approval."
                            )
                    else:
                        sev, typ = "info", "proposed-scale"
                        title = f"Recommend scale-{direction} of {resource} in {region} to {d.required}"
                        desc = f"Demand forecast allows {d.required} units (currently {d.current}). Recommendation only under the current policy."
                    upsert_alert(db, acct, key, type=typ, severity=sev, title=title, description=desc, region=region, now=now, related=rec_id)
            else:
                _close_stale(db, acct.id, key, now)

        # 6. predicted peak (60-minute horizon model)
        peak_model = runtime.selection[60]
        p90_60 = float(paths[peak_model].p90[0, config.MAX_LEAD - 1])
        if p90_60 > demand * 1.25:
            last = _latest_alert(db, acct.id, f"peak:{region}")
            if last is None or last.status == "pending" or _utc(last.created_at) < now - timedelta(hours=1):
                upcoming = bool(np.any(s.sched_live[c + 1 : c + config.MAX_LEAD + 1]) or np.any(s.sched_release[c + 1 : c + config.MAX_LEAD + 1]))
                why = "consistent with a scheduled content release or live event" if upcoming else "not linked to any scheduled event"
                upsert_alert(
                    db, acct, f"peak:{region}", type="predicted-peak", severity="info",
                    title=f"Predicted demand peak in {region}",
                    description=f"{peak_model} P90 shows demand rising {p90_60 / demand - 1:.0%} to {p90_60:,.0f}k within the hour, {why}.",
                    region=region, now=now,
                )

        # 7. cost / SLA accounting for the live day
        if ingest:
            row = db.scalars(
                select(CostSlaDaily).where(
                    CostSlaDaily.account_id == acct.id, CostSlaDaily.source == "live", CostSlaDaily.day == day, CostSlaDaily.region == region
                )
            ).first()
            if row is None:
                row = CostSlaDaily(
                    account_id=acct.id, source="live", day=day, region=region,
                    instance_hours=0, task_hours=0, model_inference_cost_usd=0, infrastructure_cost_usd=0,
                    sla_violation_minutes=0, overload_events=0, underutilization_events=0, scaling_oscillations=0,
                    cost_by_resource={},
                )
                db.add(row)
            hours = STEP_S / 3600
            by_res = dict(row.cost_by_resource or {})
            overloaded_any = False
            for resource in config.RESOURCE_TYPES:
                fleet = fleets[(region, resource)]
                units = fleet.current_units
                by_res[resource] = round(by_res.get(resource, 0.0) + units * config.cost_per_unit_hour(resource) * hours, 4)
                util = demand / max(units * config.throughput_per_unit(resource), 1e-9)
                flags = dict(fleet.controller or {})
                over, under = util > 1.0, util < 0.35
                if over and not flags.get("overloaded"):
                    row.overload_events += 1
                if under and not flags.get("underutil"):
                    row.underutilization_events += 1
                if flags.get("oscillated"):
                    row.scaling_oscillations += 1
                flags.update(overloaded=over, underutil=under, oscillated=False)
                fleet.controller = flags
                overloaded_any |= over
            row.cost_by_resource = by_res
            row.infrastructure_cost_usd = round(sum(by_res.values()), 2)
            row.task_hours = round(row.task_hours + fleets[(region, "ecs-task")].current_units * hours, 2)
            row.instance_hours = round(row.instance_hours + fleets[(region, "ec2-asg")].current_units * hours, 2)
            row.model_inference_cost_usd = round(
                row.model_inference_cost_usd + mlm.daily_hosting_cost(host) / len(config.REGIONS) / config.STEPS_PER_DAY, 4
            )
            if overloaded_any:
                row.sla_violation_minutes += config.STEP_MINUTES


def connected_accounts(db: Session) -> list[Account]:
    return list(db.scalars(select(Account).where(Account.status == "connected")))


def tick(db: Session) -> SimState:
    t0 = time.perf_counter()
    st = sim_state(db)
    nxt = st.cursor + 1
    wrapped = nxt > runtime.last_valid_cursor()
    if wrapped:
        nxt = runtime.live_start + BACKFILL_STEPS
    st.cursor, st.now, st.tick = nxt, runtime.time_at(nxt), st.tick + 1
    for acct in connected_accounts(db):
        try:
            creds = creds_for(acct)
        except sts_connect.ConnectError as exc:
            acct.status, acct.last_error = "error", str(exc)
            continue
        except Exception as exc:  # noqa: BLE001 - AWS unreachable: keep planning without it
            AWS_STATUS.update(ok=False, lastError=f"{type(exc).__name__}: {exc}"[:300])
            creds = None
        if wrapped:
            db.execute(delete(CostSlaDaily).where(CostSlaDaily.account_id == acct.id, CostSlaDaily.source == "live"))
            backfill(db, acct, nxt)
            seed_live_day(db, acct, nxt)
            step_account(db, acct, st, creds, ingest=False)
        else:
            step_account(db, acct, st, creds)
            # Keep the forecast store bounded (Timestream-style retention).
            db.execute(
                delete(ForecastRow).where(ForecastRow.account_id == acct.id, ForecastRow.origin_ts < st.now - timedelta(hours=8))
            )
        if st.tick % CONFIDENCE_EVERY == 0:
            refresh_confidence(db, acct, nxt, _utc(st.now))
    st.last_tick_at = datetime.now(timezone.utc)
    st.last_tick_ms = round((time.perf_counter() - t0) * 1000, 1)
    info = dict(st.info or {})
    info["wrapped"] = info.get("wrapped", 0) + int(wrapped)
    st.info = info
    db.commit()
    return st


# --------------------------------------------------------------------------- operator actions


def approve_alert(db: Session, alert: Alert, actor: str) -> ScalingDecision | None:
    st = sim_state(db)
    now = _utc(st.now)
    decision = None
    if alert.type in ("proposed-scale", "budget-risk") and alert.related_recommendation_id:
        rec = db.get(Recommendation, alert.related_recommendation_id)
        acct = db.get(Account, alert.account_id)
        if rec and acct:
            fleet = db.get(FleetState, (acct.id, rec.region, rec.resource_type))
            ctrl = _controller(acct, fleet)
            try:
                creds = creds_for(acct)
            except Exception:  # noqa: BLE001
                creds = None
            if rec.required_units != fleet.current_units:
                decision = execute(
                    db, acct, fleet, ctrl, rec.required_units, now,
                    trigger="approval", actor=actor, model=rec.model, p90=rec.forecast_p90, creds=creds,
                )
                rec.current_units = rec.required_units
                rec.decision_state = "auto-execute"
    alert.status, alert.resolved_by, alert.resolved_at, alert.updated_at = "approved", actor, now, now
    db.commit()
    return decision


def reject_alert(db: Session, alert: Alert, actor: str) -> None:
    st = sim_state(db)
    now = _utc(st.now)
    alert.status, alert.resolved_by, alert.resolved_at, alert.updated_at = "rejected", actor, now, now
    if alert.related_recommendation_id:
        rec = db.get(Recommendation, alert.related_recommendation_id)
        if rec:
            fleet = db.get(FleetState, (alert.account_id, rec.region, rec.resource_type))
            if fleet:
                fleet.suppress_until_tick = st.tick + 6  # snooze re-proposal for 30 simulated minutes
    db.commit()


def pending_alert_count(db: Session, account_id: str) -> int:
    return int(db.scalar(select(func.count()).select_from(Alert).where(Alert.account_id == account_id, Alert.status == "pending")) or 0)
