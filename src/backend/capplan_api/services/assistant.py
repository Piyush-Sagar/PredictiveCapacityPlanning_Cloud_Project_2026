"""Capacity assistant (⌘K in the dashboard).

Answers questions about the *plan ahead* (upcoming demand, servers needed,
cost outlook, scheduled events, pending decisions) from live pipeline data.

* With ``OPENROUTER_API_KEY`` set, an LLM is called through OpenRouter's
  OpenAI-compatible chat-completions API with function tools that read the
  same data the dashboard shows. The model is ``OPENROUTER_MODEL``.
* Without a key, or if OpenRouter fails, a built-in answerer routes the
  question to the same tools and writes the answer from templates.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import timedelta

import httpx
import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from capplan_db.models import Account, Alert, Recommendation
from capplan_ml import config
from capplan_ml.capacity import required_units
from capplan_ml.pipeline import load_events

from ..runtime import runtime
from ..serializers import iso
from . import engine

log = logging.getLogger("capplan.assistant")

OPENROUTER_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/") + "/chat/completions"
DEFAULT_MODEL = "inclusionai/ling-3.0-flash-sante:free"
MAX_TOOL_ROUNDS = 6

REGION_NAMES = {
    "us-east": "US East",
    "us-west": "US West",
    "eu-west": "EU West",
    "ap-south": "AP South",
    "sa-east": "SA East",
}


def settings() -> dict:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    return {
        "mode": "openrouter" if key else "offline",
        "model": os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL),
        "key": key,
    }


# --------------------------------------------------------------------------- tools


class Ctx:
    def __init__(self, db: Session, acct: Account):
        self.db, self.acct = db, acct
        st = engine.sim_state(db)
        self.now = engine._utc(st.now)
        self.cursor = st.cursor
        self.view = runtime.view(acct.id, acct.scale)

    def regions(self, region: str | None) -> list[str]:
        return [region] if region in self.acct.regions else list(self.acct.regions)


def _step_time(ctx: Ctx, lead: int) -> str:
    return iso(ctx.now + timedelta(minutes=config.STEP_MINUTES * lead))


def tool_demand_forecast(ctx: Ctx, region: str | None = None, horizon_minutes: int = 60) -> dict:
    h = horizon_minutes if horizon_minutes in config.HORIZONS else 60
    k = config.HORIZON_STEPS[h]
    model = runtime.selection[h]
    rows = []
    for r in ctx.regions(region):
        s = ctx.view.series[r]
        f = engine._predict(s, model, [ctx.cursor])
        cur = float(s.y[ctx.cursor])
        p50, p90 = float(f.p50[0, k - 1]), float(f.p90[0, k - 1])
        peak_i = int(np.argmax(f.p90[0, :k]))
        rows.append(
            {
                "region": r,
                "currentViewersK": round(cur, 1),
                "p50ViewersK": round(p50, 1),
                "p90ViewersK": round(p90, 1),
                "changePct": round((p50 / cur - 1) * 100, 1),
                "peakP90ViewersK": round(float(f.p90[0, peak_i]), 1),
                "peakAt": _step_time(ctx, peak_i + 1),
            }
        )
    return {
        "now": iso(ctx.now),
        "horizonMinutes": h,
        "model": model,
        "units": "thousand concurrent viewers",
        "regions": rows,
        "totalCurrentK": round(sum(x["currentViewersK"] for x in rows), 1),
        "totalP50K": round(sum(x["p50ViewersK"] for x in rows), 1),
        "totalP90K": round(sum(x["p90ViewersK"] for x in rows), 1),
    }


def tool_capacity_plan(ctx: Ctx, region: str | None = None) -> dict:
    regions = ctx.regions(region)
    recs = ctx.db.scalars(
        select(Recommendation).where(Recommendation.account_id == ctx.acct.id, Recommendation.region.in_(regions))
    ).all()
    model60 = runtime.selection[60]
    ahead: dict[str, float] = {}
    for r in regions:
        f = engine._predict(ctx.view.series[r], model60, [ctx.cursor])
        ahead[r] = float(np.max(f.p90[0]))
    pools = []
    for rec in sorted(recs, key=lambda x: (x.region, x.resource_type)):
        pol = engine.capacity_policy(ctx.acct, rec.resource_type)
        in_60 = required_units(ahead[rec.region], rec.throughput_per_unit, pol.safety_margin_pct)
        in_60 = min(max(in_60, pol.min_units), pol.max_units)
        pools.append(
            {
                "region": rec.region,
                "resource": rec.resource_type,
                "currentUnits": rec.current_units,
                "requiredNow": rec.required_units,
                "requiredForNext60MinPeak": in_60,
                "decision": rec.decision_state,
                "budgetCapped": rec.budget_capped,
                "estDailyCostUsd": rec.estimated_cost_usd,
            }
        )
    return {
        "now": iso(ctx.now),
        "formula": "units = ceil(P90 viewers / viewers-per-unit × (1 + safety margin))",
        "viewersPerUnitK": {r: config.throughput_per_unit(r) for r in config.RESOURCE_TYPES},
        "pools": pools,
        "totals": {
            "current": sum(p["currentUnits"] for p in pools),
            "requiredNow": sum(p["requiredNow"] for p in pools),
            "requiredForNext60MinPeak": sum(p["requiredForNext60MinPeak"] for p in pools),
            "estDailyCostUsd": round(sum(p["estDailyCostUsd"] for p in pools), 2),
        },
    }


def tool_cost_outlook(ctx: Ctx) -> dict:
    from ..routers.cost import cost_forecast

    cf = cost_forecast(days=14, db=ctx.db, acct=ctx.acct)
    return {
        "now": cf["asOf"],
        "nextHour": {k: cf["nextHour"][k] for k in ("p50CostUsd", "p90CostUsd", "currentRunRateUsdPerHour")},
        "todaySoFarUsd": cf["todaySoFarUsd"],
        "next14DaysTotalUsd": float(cf["Total"]["Amount"]),
        "nextDays": [
            {"date": x["TimePeriod"]["Start"], "meanUsd": float(x["MeanValue"]), "low80Usd": float(x["PredictionIntervalLowerBound"]), "high80Usd": float(x["PredictionIntervalUpperBound"])}
            for x in cf["ForecastResultsByTime"][:7]
        ],
        "monthEnd": cf["monthEnd"],
        "method": cf["method"],
    }


def tool_upcoming_events(ctx: Ctx, hours: int = 12) -> dict:
    """Scheduled calendar only; unscheduled viral spikes are unknown by design."""
    hours = int(min(max(hours, 1), 48))
    ev = load_events()
    ev["start"] = pd.to_datetime(ev["start"], utc=True, format="mixed")
    ev["end"] = pd.to_datetime(ev["end"], utc=True, format="mixed")
    ev["scheduled"] = ev["scheduled"].astype(str).str.lower().isin(["true", "1"])
    ev = ev[ev["scheduled"] & ev["region"].isin(ctx.acct.regions)].copy()
    now = pd.Timestamp(ctx.now)
    end = now + pd.Timedelta(hours=hours)
    ev = ev[(ev["end"] > now) & (ev["start"] < end)].sort_values("start")
    items = [
        {
            "name": e.name,
            "kind": e.kind,
            "region": e.region,
            "start": iso(e.start.to_pydatetime()),
            "end": iso(e.end.to_pydatetime()),
            "status": "in progress" if e.start <= now else f"in {round((e.start - now).total_seconds() / 3600, 1)} h",
            "expectedLiftPct": round(float(e.lift) * 100),
        }
        for e in ev.itertuples()
    ]
    return {"now": iso(ctx.now), "windowHours": hours, "events": items, "note": "Unscheduled viral spikes are not on the calendar."}


def tool_pending_alerts(ctx: Ctx) -> dict:
    rows = ctx.db.scalars(
        select(Alert).where(Alert.account_id == ctx.acct.id, Alert.status == "pending").order_by(Alert.updated_at.desc()).limit(15)
    ).all()
    return {"count": len(rows), "alerts": [{"severity": a.severity, "type": a.type, "region": a.region, "title": a.title} for a in rows]}


def tool_policy_comparison(ctx: Ctx) -> dict:
    df = runtime.policy_summary.sort_values("totalCostUsd")
    return {
        "systemPolicy": runtime.summary.get("systemPolicy"),
        "testWeek": [runtime.summary.get("testStart"), runtime.summary.get("testEnd")],
        "policies": [
            {"policy": r.policy, "slaViolationMinutes": int(r.slaViolationMinutes), "totalCostUsd": round(float(r.totalCostUsd), 0), "oscillations": int(r.scalingOscillations)}
            for r in df.itertuples()
        ],
    }


def tool_model_performance(ctx: Ctx, horizon_minutes: int = 15) -> dict:
    h = horizon_minutes if horizon_minutes in config.HORIZONS else 15
    b = runtime.bench[runtime.bench.horizonMinutes == h].sort_values("smape")
    return {
        "horizonMinutes": h,
        "selected": runtime.selection[h],
        "models": [
            {"model": r.modelName, "simulated": bool(r.simulated), "smapePct": r.smape, "p90CoveragePct": r.p90CoveragePct, "latencyMs": r.inferenceLatencyMs}
            for r in b.itertuples()
        ],
    }


def tool_scaling_policy(ctx: Ctx) -> dict:
    return engine.account_policy(ctx.acct)


REGION_PARAM = {"type": ["string", "null"], "enum": [*config.REGIONS, None], "description": "Region id, or null for all regions of the account."}

TOOLS = {
    "get_demand_forecast": (
        tool_demand_forecast,
        "Forecast concurrent viewers per region for the next 15, 30 or 60 minutes (P50 most likely, P90 safe upper), with the peak time inside the horizon.",
        {"region": REGION_PARAM, "horizon_minutes": {"type": "integer", "enum": [15, 30, 60]}},
    ),
    "get_capacity_plan": (
        tool_capacity_plan,
        "Servers (units) per region and server type: running now, required now, required for the next-60-minute P90 peak, decision state and daily cost.",
        {"region": REGION_PARAM},
    ),
    "get_cost_outlook": (
        tool_cost_outlook,
        "Cost prediction: next hour P50/P90 cost, spend so far today, next 7-14 days forecast with 80% interval, and month-end projection.",
        {},
    ),
    "get_upcoming_events": (
        tool_upcoming_events,
        "Scheduled content releases and live events (with expected demand lift) in the next N hours for the account's regions.",
        {"hours": {"type": "integer", "description": "Look-ahead window in hours (1-48)."}},
    ),
    "get_pending_alerts": (tool_pending_alerts, "Scaling decisions and risks currently waiting for a human.", {}),
    "get_policy_comparison": (
        tool_policy_comparison,
        "Backtest comparison of scaling strategies (static, reactive, predictive P50/P90 per model): SLA-violation minutes and total cost for the test week.",
        {},
    ),
    "get_model_performance": (
        tool_model_performance,
        "Forecasting model benchmark at a horizon: accuracy (sMAPE), P90 coverage, latency, and which model is selected. Foundation models are simulated.",
        {"horizon_minutes": {"type": "integer", "enum": [15, 30, 60]}},
    ),
    "get_scaling_policy": (tool_scaling_policy, "The account's scaling guardrails: safety margin, hysteresis, cooldown, budget multiplier, decision mode.", {}),
}


def openai_tools() -> list[dict]:
    out = []
    for name, (_, desc, props) in TOOLS.items():
        out.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": desc,
                    "parameters": {"type": "object", "properties": props, "required": [], "additionalProperties": False},
                },
            }
        )
    return out


def run_tool(ctx: Ctx, name: str, args: dict) -> dict:
    fn = TOOLS[name][0]
    allowed = TOOLS[name][2].keys()
    return fn(ctx, **{k: v for k, v in args.items() if k in allowed and v is not None})


# --------------------------------------------------------------------------- OpenRouter


def system_prompt(ctx: Ctx) -> str:
    return f"""You are the Capacity Assistant inside a predictive capacity-planning dashboard for a video streaming platform.
The platform forecasts concurrent viewers 15-60 minutes ahead and provisions servers before demand arrives.
Everything is a local simulation: AWS is emulated and viewer data is a replayed synthetic trace. The four foundation models (Chronos, TimesFM, Moirai, TTM) are simulated; seasonal-naive, XGBoost and LSTM are real.

Current simulated time: {iso(ctx.now)} (UTC). Account: {ctx.acct.display_name} ({ctx.acct.aws_account_id}), regions: {", ".join(ctx.acct.regions)}.

Answer questions about upcoming demand, servers needed, costs, scheduled events, pending decisions and why predictive scaling helps.
- Always call a tool for numbers; never invent figures.
- Viewer numbers are in thousands (k). P50 = most likely, P90 = safe upper estimate the planner provisions for.
- Be concise: a short direct answer first, then at most a few bullets. Use markdown bold for key numbers. Times in UTC.
- If a question is outside this dashboard's scope, say so briefly."""


class ToolsUnsupported(Exception):
    pass


def _openrouter(cfg: dict, messages: list[dict], with_tools: bool = True) -> dict:
    body = {"model": cfg["model"], "messages": messages, "temperature": 0.2}
    if with_tools:
        body.update(tools=openai_tools(), tool_choice="auto")
    resp = httpx.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {cfg['key']}",
            "HTTP-Referer": os.environ.get("APP_URL", "http://localhost:3000"),
            "X-Title": "CapPlan Capacity Assistant",
        },
        json=body,
        timeout=90,
    )
    if with_tools and resp.status_code in (400, 404) and "tool" in resp.text.lower():
        raise ToolsUnsupported(resp.text[:300])
    resp.raise_for_status()
    data = resp.json()
    if data.get("error"):
        msg = str(data["error"].get("message", "OpenRouter error"))
        if with_tools and "tool" in msg.lower():
            raise ToolsUnsupported(msg)
        raise RuntimeError(msg)
    return data


def answer_with_context(ctx: Ctx, cfg: dict, history: list[dict], tool_names: list[str]) -> dict:
    """For models without tool calling: fetch the relevant data up front and ground the answer in it."""
    names = list(dict.fromkeys([*tool_names, "get_demand_forecast", "get_upcoming_events"]))[:4]
    data = {n: run_tool(ctx, n, {}) for n in names}
    grounding = (
        "Live dashboard data for this question (JSON). Use only these numbers; if they don't cover the question, say so.\n"
        + json.dumps(data, default=str)
    )
    messages = [{"role": "system", "content": system_prompt(ctx) + "\n\n" + grounding}, *history]
    out = _openrouter(cfg, messages, with_tools=False)
    msg = out["choices"][0]["message"]
    return {"answer": msg.get("content") or "(no answer)", "mode": "openrouter", "model": out.get("model", cfg["model"]), "toolsUsed": names, "grounding": "context"}


def answer_with_openrouter(ctx: Ctx, cfg: dict, history: list[dict]) -> dict:
    messages = [{"role": "system", "content": system_prompt(ctx)}, *history]
    used: list[str] = []
    for _ in range(MAX_TOOL_ROUNDS):
        data = _openrouter(cfg, messages)
        msg = data["choices"][0]["message"]
        calls = msg.get("tool_calls") or []
        if not calls:
            return {"answer": msg.get("content") or "(no answer)", "mode": "openrouter", "model": data.get("model", cfg["model"]), "toolsUsed": used}
        messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
        for call in calls:
            name = call["function"]["name"]
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
                result = run_tool(ctx, name, args) if name in TOOLS else {"error": f"unknown tool {name}"}
                used.append(name)
            except Exception as exc:  # noqa: BLE001 - report tool failures back to the model
                result = {"error": f"{type(exc).__name__}: {exc}"}
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, default=str)})
    return {"answer": "I needed too many lookups to answer that. Try a narrower question.", "mode": "openrouter", "model": cfg["model"], "toolsUsed": used}


# --------------------------------------------------------------------------- offline answerer

REGION_ALIASES = [
    (r"us[\s-]?east|virginia|new york|east coast", "us-east"),
    (r"us[\s-]?west|california|oregon|west coast", "us-west"),
    (r"eu[\s-]?west|europe|\beu\b|ireland|london", "eu-west"),
    (r"ap[\s-]?south|india|asia|mumbai|\bap\b", "ap-south"),
    (r"sa[\s-]?east|brazil|south america|\bsa\b|são paulo|sao paulo", "sa-east"),
]


def _region(q: str) -> str | None:
    for pat, r in REGION_ALIASES:
        if re.search(pat, q):
            return r
    return None


def _horizon(q: str) -> int:
    if re.search(r"\b15\b|quarter", q):
        return 15
    if re.search(r"\b30\b|half", q):
        return 30
    return 60


def _k(v: float) -> str:
    return f"{v * 1000:,.0f}" if v < 1 else f"{v:,.1f}k"


def _hhmm(ts: str) -> str:
    return ts[11:16] + " UTC"


def offline_answer(ctx: Ctx, question: str) -> dict:
    q = question.lower()
    region = _region(q)
    where = REGION_NAMES.get(region, "all regions")
    used: list[str] = []

    def call(name, **kw):
        used.append(name)
        return run_tool(ctx, name, kw)

    if re.search(r"cost|bill|spend|budget|money|\$|price|expens|month", q):
        c = call("get_cost_outlook")
        nd = c["nextDays"][:3]
        me = c["monthEnd"]
        text = (
            f"**Next hour:** about **${c['nextHour']['p50CostUsd']:,.0f}–${c['nextHour']['p90CostUsd']:,.0f}** (P50–P90), "
            f"vs a current run-rate of ${c['nextHour']['currentRunRateUsdPerHour']:,.0f}/h.\n\n"
            f"- Today so far: **${c['todaySoFarUsd']:,.0f}**\n"
            + "".join(f"- {d['date']}: ~${d['meanUsd']:,.0f} (80% range ${d['low80Usd']:,.0f}–${d['high80Usd']:,.0f})\n" for d in nd)
            + f"- Next 14 days: **${c['next14DaysTotalUsd']:,.0f}**\n"
            f"- Month-end {me['month']}: **${me['meanUsd']:,.0f}** (range ${me['lowerUsd']:,.0f}–${me['upperUsd']:,.0f}; ${me['monthToDateUsd']:,.0f} so far)"
        )
        sugg = ["Which region costs the most?", "How many servers will we need in the next hour?", "Is predictive scaling cheaper than reactive?"]
    elif re.search(r"event|match|release|premiere|schedul|upcoming|tonight|launch|live|game|final", q):
        hours = 24 if re.search(r"tomorrow|24|day", q) else 12
        e = call("get_upcoming_events", hours=hours)
        evs = [x for x in e["events"] if not region or x["region"] == region]
        if not evs:
            text = f"No scheduled releases or live events in {where} in the next {hours} hours. (Unscheduled viral spikes can still happen; they aren't on the calendar.)"
        else:
            lines = "".join(
                f"- **{x['name']}** ({x['kind']}), {REGION_NAMES[x['region']]}: {_hhmm(x['start'])}–{_hhmm(x['end'])}, {x['status']}, expected **+{x['expectedLiftPct']}%** viewers\n"
                for x in evs[:8]
            )
            text = f"**{len(evs)} scheduled event{'s' if len(evs) != 1 else ''}** in the next {hours} h ({where}):\n\n{lines}\nThe planner already sees these on the calendar and scales out ahead of them."
        sugg = ["How many servers will we need for the next peak?", "What will tonight cost?", "Which region peaks next?"]
    elif re.search(r"server|capacity|unit|instance|task|scale|provision|worker|fleet|need", q):
        p = call("get_capacity_plan", region=region)
        t = p["totals"]
        grow = sorted(p["pools"], key=lambda x: x["requiredForNext60MinPeak"] - x["currentUnits"], reverse=True)[:4]
        lines = "".join(
            f"- {REGION_NAMES[x['region']]} · {x['resource']}: {x['currentUnits']} now → **{x['requiredForNext60MinPeak']}** for the next-hour peak ({x['decision']})\n"
            for x in grow
        )
        text = (
            f"**{where}: {t['current']} units running, {t['requiredNow']} needed now, {t['requiredForNext60MinPeak']} needed for the next 60-minute P90 peak.** "
            f"Est. daily cost at the required size: ${t['estDailyCostUsd']:,.0f}.\n\nBiggest upcoming changes:\n\n{lines}\n"
            f"Formula: {p['formula']}."
        )
        sugg = ["What's waiting for my approval?", "Any big events coming up?", "What will the next hour cost?"]
    elif re.search(r"alert|approv|pending|waiting|decision|reject|risk", q):
        a = call("get_pending_alerts")
        if not a["count"]:
            text = "Nothing is waiting for approval right now."
        else:
            lines = "".join(f"- [{x['severity']}] {x['title']}\n" for x in a["alerts"][:8])
            text = f"**{a['count']} pending item{'s' if a['count'] != 1 else ''}:**\n\n{lines}\nOpen the **Alerts** page to approve or reject."
        sugg = ["How many servers will we need in the next hour?", "What will this month cost?"]
    elif re.search(r"model|accura|best|benchmark|chronos|timesfm|moirai|ttm|xgboost|lstm|trust|confiden", q):
        m = call("get_model_performance", horizon_minutes=_horizon(q) if re.search(r"15|30|60|hour|minute", q) else 15)
        top = m["models"][:4]
        lines = "".join(
            f"- {x['model']}{' (simulated)' if x['simulated'] else ''}: sMAPE {x['smapePct']}%, P90 coverage {x['p90CoveragePct']}%, {x['latencyMs']} ms\n"
            for x in top
        )
        text = f"At the **{m['horizonMinutes']}-minute** horizon the live system uses **{m['selected']}**.\n\nMost accurate models:\n\n{lines}"
        sugg = ["Is predictive scaling worth it?", "What's the forecast for the next hour?"]
    elif re.search(r"reactive|predictive|compare|worth|saving|strategy|why|benefit|static", q):
        pc = call("get_policy_comparison")
        rows = {r["policy"]: r for r in pc["policies"]}
        sysp, rea = rows.get(pc["systemPolicy"]), rows.get("reactive")
        text = "Backtest over the test week:\n\n" + "".join(
            f"- {r['policy']}: **${r['totalCostUsd']:,.0f}**, {r['slaViolationMinutes']} SLA minutes\n" for r in pc["policies"][:6]
        )
        if sysp and rea:
            saving = (1 - sysp["totalCostUsd"] / rea["totalCostUsd"]) * 100
            text = (
                f"**Predictive scaling ({pc['systemPolicy']}) was {saving:.1f}% cheaper than reactive** "
                f"(${sysp['totalCostUsd']:,.0f} vs ${rea['totalCostUsd']:,.0f}) with {sysp['slaViolationMinutes']} vs {rea['slaViolationMinutes']} SLA-violation minutes.\n\n"
                + text
            )
        sugg = ["What will this month cost?", "Which model is most accurate?"]
    elif re.search(r"policy|margin|hysteresis|cooldown|guardrail|rule", q):
        p = call("get_scaling_policy")
        text = (
            f"Current guardrails: safety margin **{p['safetyMarginPct'] * 100:.0f}%**, mode **{p['mode']}**, scale in only below −{p['hysteresisPct'] * 100:.0f}% "
            f"for {p['hysteresisPeriods']} periods, scale-in cooldown {p['scaleInCooldownSec']} s, budget ×{p['budgetMultiplier']}. "
            f"Changes ≤{p['autoExecuteMaxChangePct'] * 100:.0f}% run automatically; ≥{p['approvalMinChangePct'] * 100:.0f}% need approval."
        )
        sugg = ["What's waiting for my approval?", "How many servers will we need in the next hour?"]
    elif re.search(r"forecast|viewer|demand|traffic|peak|busy|watch|predict|next|expect|going to|will", q):
        h = _horizon(q)
        f = call("get_demand_forecast", region=region, horizon_minutes=h)
        rows = sorted(f["regions"], key=lambda x: x["changePct"], reverse=True)
        lines = "".join(
            f"- {REGION_NAMES[x['region']]}: {_k(x['currentViewersK'])} now → **{_k(x['p50ViewersK'])}** (P90 {_k(x['p90ViewersK'])}), {x['changePct']:+.1f}%, peak by {_hhmm(x['peakAt'])}\n"
            for x in rows
        )
        text = (
            f"In the next **{h} minutes** ({f['model']}), {where} goes from **{_k(f['totalCurrentK'])}** to about **{_k(f['totalP50K'])}** viewers "
            f"(safe upper estimate {_k(f['totalP90K'])}).\n\n{lines}"
        )
        sugg = ["How many servers will that need?", "Any events coming up tonight?", "What will the next hour cost?"]
    else:
        text = (
            "I can answer questions about the plan ahead, for example:\n\n"
            "- *How many viewers will US East have in the next hour?*\n"
            "- *How many servers will we need for the next peak?*\n"
            "- *What will this month cost?*\n"
            "- *Any big events coming up tonight?*\n"
            "- *What's waiting for my approval?*\n"
            "- *Is predictive scaling worth it?*"
        )
        sugg = ["What's the forecast for the next hour?", "What will this month cost?", "Any events coming up tonight?"]
    return {"answer": text, "mode": "offline", "model": None, "toolsUsed": used, "suggestions": sugg}


# --------------------------------------------------------------------------- entry point


def chat(db: Session, acct: Account, history: list[dict]) -> dict:
    ctx = Ctx(db, acct)
    history = [m for m in history if m.get("role") in ("user", "assistant") and m.get("content")][-12:]
    question = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")
    cfg = settings()
    offline = offline_answer(ctx, question)
    if cfg["mode"] == "offline":
        return offline
    try:
        try:
            out = answer_with_openrouter(ctx, cfg, history)
        except ToolsUnsupported as exc:
            log.info("model %s has no tool calling (%s); using context grounding", cfg["model"], exc)
            out = answer_with_context(ctx, cfg, history, offline["toolsUsed"])
        out["suggestions"] = offline["suggestions"]
        return out
    except Exception as exc:  # noqa: BLE001 - never leave the user without an answer
        log.warning("OpenRouter failed, using offline answer: %s", exc)
        offline["notice"] = f"OpenRouter unavailable ({type(exc).__name__}); answered offline."
        return offline
