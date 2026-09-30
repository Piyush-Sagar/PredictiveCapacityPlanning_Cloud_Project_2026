"""Closed-loop scaling simulator.

Replays the test week at 5-minute steps for every region and resource fleet
under competing policies, and measures what the architecture actually cares
about: SLA-violation minutes, overload / under-utilisation events, scaling
oscillations, and infrastructure + inference cost.

Mechanics (identical for all policies):
* capacity added at step t becomes available at t + PROVISION_DELAY (task
  start-up / warm-up); removals are immediate;
* a step is an SLA violation when demand exceeds capacity x throughput;
* every policy goes through the same :class:`CapacityController` guardrails.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import config, metrics
from .capacity import CapacityController, policy_for
from .features import RegionSeries

PROVISION_DELAY = 2  # steps (10 minutes)
REACTIVE_TARGET_UTIL = 0.70
UNDERUTIL_THRESHOLD = 0.35
OSCILLATION_WINDOW = 6  # steps


@dataclass
class PolicySpec:
    key: str
    label: str
    kind: str  # static | reactive | predictive
    model: str | None = None
    quantile: str = "p90"


def default_policies(models: list[str]) -> list[PolicySpec]:
    out = [
        PolicySpec("static", "Static schedule", "static"),
        PolicySpec("reactive", "Reactive (70% CPU target)", "reactive"),
    ]
    for m in models:
        out.append(PolicySpec(f"predictive-{m}-p90", f"Predictive P90 · {m}", "predictive", m, "p90"))
    if models:
        out.append(PolicySpec(f"predictive-{models[0]}-p50", f"Predictive P50 · {models[0]}", "predictive", models[0], "p50"))
    return out


def _static_schedule(s: RegionSeries, throughput: float, margin: float) -> np.ndarray:
    """Units per local-hour slot from the training period's P95 demand."""
    train = s.indices("train")
    hours = np.floor((np.arctan2(s.hour_sin, s.hour_cos) / (2 * np.pi) * 24) % 24).astype(int)
    df = pd.DataFrame({"h": hours[train], "y": s.y[train]})
    p95 = df.groupby("h")["y"].quantile(0.95).reindex(range(24)).ffill().bfill().to_numpy()
    return np.ceil(p95[hours] / throughput * (1 + margin)).astype(int)


def simulate_fleet(
    s: RegionSeries,
    resource: str,
    spec: PolicySpec,
    origins: np.ndarray,
    cube: dict | None,
    margin: float = config.DEFAULT_SAFETY_MARGIN_PCT,
) -> pd.DataFrame:
    """Simulate one (region, resource, policy). ``cube[model]`` holds P50/P90
    paths aligned with ``origins`` (shape n x MAX_LEAD)."""
    thr = config.throughput_per_unit(resource)
    pol = policy_for(resource, safety_margin_pct=margin, mode="auto", max_units=2000)
    if spec.kind == "reactive":
        pol.scale_in_cooldown_s = 300
    start_units = int(np.ceil(s.y[origins[0]] / thr * (1 + margin)))
    ctrl = CapacityController(pol, thr, start_units)
    schedule = _static_schedule(s, thr, margin) if spec.kind == "static" else None
    pending: list[tuple[int, int]] = []  # (effective_step, units)
    effective = start_units
    rows = []
    last_dir, last_change_step = 0, -10**9

    for i, t in enumerate(origins):
        now_s = i * config.STEP_MINUTES * 60
        # Apply scale-outs whose provisioning delay has elapsed.
        for _, units in [p for p in pending if p[0] <= i]:
            effective = units
        pending = [p for p in pending if p[0] > i]

        demand = s.y[t]
        util = demand / max(effective * thr, 1e-9)

        if spec.kind == "static":
            target_p = schedule[min(t + PROVISION_DELAY, len(s) - 1)] * thr / (1 + margin)
        elif spec.kind == "reactive":
            observed = s.y[t - 1]  # CloudWatch metric lags one period
            target_p = observed / REACTIVE_TARGET_UTIL / (1 + margin)
        else:
            paths = cube[spec.model][spec.quantile]
            # Plan for the window the new capacity will actually serve.
            target_p = float(np.max(paths[i, PROVISION_DELAY - 1 : PROVISION_DELAY + 1]))

        d = ctrl.decide(target_p, now_s)
        if d.required != ctrl.current:
            direction = 1 if d.required > ctrl.current else -1
            oscillation = direction != last_dir and last_dir != 0 and i - last_change_step <= OSCILLATION_WINDOW
            last_dir, last_change_step = direction, i
            if direction > 0:
                pending.append((i + PROVISION_DELAY, d.required))
            else:
                effective = d.required
                pending = [(e, min(u, d.required)) for e, u in pending]
            ctrl.apply(d.required, now_s)
        else:
            oscillation = False

        rows.append(
            {
                "ts": s.ts[t],
                "units": effective,
                "util": util,
                "violation": demand > effective * thr,
                "underutil": util < UNDERUTIL_THRESHOLD,
                "oscillation": oscillation,
                "cost": effective * config.cost_per_unit_hour(resource) * config.STEP_MINUTES / 60,
            }
        )
    return pd.DataFrame(rows)


def _run_starts(flags: pd.Series) -> int:
    f = flags.astype(int).to_numpy()
    return int(np.sum((f[1:] == 1) & (f[:-1] == 0)) + (f[0] == 1 if len(f) else 0))


def simulate(
    series: dict[str, RegionSeries],
    origins_by_region: dict[str, np.ndarray],
    cubes: dict[str, dict],
    policies: list[PolicySpec],
    hosts: dict[str, str],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (daily metrics per policy/region, policy summary)."""
    daily_rows = []
    for spec in policies:
        for region, s in series.items():
            o = origins_by_region[region]
            fleets = {r: simulate_fleet(s, r, spec, o, cubes.get(region)) for r in config.RESOURCE_TYPES}
            base = fleets["ecs-task"][["ts"]].copy()
            base["violation"] = np.any([f["violation"] for f in fleets.values()], axis=0)
            base["day"] = pd.to_datetime(base["ts"]).dt.floor("D")
            for r, f in fleets.items():
                f["day"] = base["day"]
            inference_per_day = 0.0
            if spec.model:
                inference_per_day = metrics.daily_hosting_cost(hosts[spec.model]) / len(series)
            for day, idx in base.groupby("day").groups.items():
                row = {
                    "policy": spec.key,
                    "policyLabel": spec.label,
                    "timestamp": pd.Timestamp(day).isoformat(),
                    "region": region,
                    "instanceHours": float(fleets["ec2-asg"].loc[idx, "units"].sum() * config.STEP_MINUTES / 60),
                    "taskHours": float(fleets["ecs-task"].loc[idx, "units"].sum() * config.STEP_MINUTES / 60),
                    "modelInferenceCostUsd": round(inference_per_day * len(idx) / config.STEPS_PER_DAY, 2),
                    "infrastructureCostUsd": round(float(sum(f.loc[idx, "cost"].sum() for f in fleets.values())), 2),
                    "slaViolationMinutes": int(base.loc[idx, "violation"].sum() * config.STEP_MINUTES),
                    "overloadEvents": int(sum(_run_starts(f.loc[idx, "violation"]) for f in fleets.values())),
                    "underutilizationEvents": int(sum(_run_starts(f.loc[idx, "underutil"]) for f in fleets.values())),
                    "scalingOscillations": int(sum(f.loc[idx, "oscillation"].sum() for f in fleets.values())),
                    "avgUtilizationPct": round(float(np.mean([f.loc[idx, "util"].mean() for f in fleets.values()]) * 100), 1),
                }
                for r, f in fleets.items():
                    row[f"cost_{r}"] = round(float(f.loc[idx, "cost"].sum()), 2)
                daily_rows.append(row)
    daily = pd.DataFrame(daily_rows)
    for col in ["instanceHours", "taskHours"]:
        daily[col] = daily[col].round(1)
    summary = (
        daily.groupby(["policy", "policyLabel"], sort=False)
        .agg(
            slaViolationMinutes=("slaViolationMinutes", "sum"),
            overloadEvents=("overloadEvents", "sum"),
            underutilizationEvents=("underutilizationEvents", "sum"),
            scalingOscillations=("scalingOscillations", "sum"),
            infrastructureCostUsd=("infrastructureCostUsd", "sum"),
            modelInferenceCostUsd=("modelInferenceCostUsd", "sum"),
            avgUtilizationPct=("avgUtilizationPct", "mean"),
        )
        .reset_index()
    )
    summary["totalCostUsd"] = (summary["infrastructureCostUsd"] + summary["modelInferenceCostUsd"]).round(2)
    summary["avgUtilizationPct"] = summary["avgUtilizationPct"].round(1)
    return daily, summary
