"""Capacity translation and guardrails.

    required = ceil(P90 demand / per-unit throughput x (1 + safety margin))

clamped to [min, max], then passed through hysteresis (scale-in only after N
consecutive periods sufficiently below current), cooldowns and a budget cap.
The same controller drives the offline policy simulator and the live loop.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

from . import config


@dataclass
class CapacityPolicy:
    safety_margin_pct: float = config.DEFAULT_SAFETY_MARGIN_PCT
    min_units: int = 2
    max_units: int = 400
    hysteresis_pct: float = 0.10  # scale in only if required < current x (1 - pct)
    hysteresis_periods: int = 2  # ... for this many consecutive 5-min periods
    scale_out_cooldown_s: int = 0
    scale_in_cooldown_s: int = 600
    budget_threshold_usd: float = config.DEFAULT_BUDGET_THRESHOLD_USD  # daily run-rate cap
    cost_per_unit_hour: float = config.DEFAULT_COST_PER_UNIT_HOUR_USD
    auto_execute_max_change: float = 0.15
    approval_min_change: float = 0.5
    mode: str = "auto"  # "auto" | "approve-all" | "recommend-only"

    def to_dict(self) -> dict:
        return asdict(self)


def required_units(p90: float, throughput: float, margin: float) -> int:
    return max(1, math.ceil(p90 / throughput * (1 + margin)))


def daily_cost(units: int, cost_per_unit_hour: float) -> float:
    return round(units * cost_per_unit_hour * 24, 2)


@dataclass
class Decision:
    raw_required: int  # before guardrails
    required: int  # after min/max, hysteresis and budget
    current: int
    hysteresis_active: bool
    cooldown_remaining_s: int
    budget_capped: bool
    estimated_daily_cost: float
    decision_state: str  # "recommend" | "approve" | "auto-execute"

    @property
    def change(self) -> int:
        return self.required - self.current


class CapacityController:
    def __init__(self, policy: CapacityPolicy, throughput: float, current: int):
        self.policy = policy
        self.throughput = throughput
        self.current = current
        self.below_count = 0
        self.last_scale_in_s = -10**9
        self.last_scale_out_s = -10**9

    def state(self) -> dict:
        return {
            "current": self.current,
            "below_count": self.below_count,
            "last_scale_in_s": self.last_scale_in_s,
            "last_scale_out_s": self.last_scale_out_s,
        }

    def load_state(self, st: dict) -> None:
        self.current = int(st.get("current", self.current))
        self.below_count = int(st.get("below_count", 0))
        self.last_scale_in_s = int(st.get("last_scale_in_s", -10**9))
        self.last_scale_out_s = int(st.get("last_scale_out_s", -10**9))

    def decide(self, p90: float, now_s: int) -> Decision:
        p = self.policy
        raw = required_units(p90, self.throughput, p.safety_margin_pct)
        target = min(max(raw, p.min_units), p.max_units)

        budget_units = int(p.budget_threshold_usd / (p.cost_per_unit_hour * 24))
        budget_capped = target > budget_units
        if budget_capped:
            target = max(budget_units, p.min_units)

        hysteresis = False
        cooldown = 0
        if target < self.current:
            if target < self.current * (1 - p.hysteresis_pct):
                self.below_count += 1
            else:
                self.below_count = 0
            in_cd = p.scale_in_cooldown_s - (now_s - self.last_scale_in_s)
            if self.below_count < p.hysteresis_periods or target >= self.current * (1 - p.hysteresis_pct):
                hysteresis = True
                target = self.current
            elif in_cd > 0:
                cooldown = int(in_cd)
                target = self.current
        else:
            self.below_count = 0
            if target > self.current:
                out_cd = p.scale_out_cooldown_s - (now_s - self.last_scale_out_s)
                if out_cd > 0:
                    cooldown = int(out_cd)
                    target = self.current

        est = daily_cost(target, p.cost_per_unit_hour)
        magnitude = abs(target - self.current) / max(self.current, 1)
        if p.mode == "recommend-only":
            state = "recommend"
        elif p.mode == "approve-all" and target != self.current:
            state = "approve"
        elif budget_capped or magnitude > p.approval_min_change:
            state = "approve"
        elif magnitude <= p.auto_execute_max_change or target == self.current:
            state = "auto-execute"
        else:
            # Moderate change: auto-execute scale-out (SLA protection), recommend scale-in.
            state = "auto-execute" if target > self.current else "recommend"

        return Decision(
            raw_required=raw,
            required=target,
            current=self.current,
            hysteresis_active=hysteresis,
            cooldown_remaining_s=cooldown,
            budget_capped=budget_capped,
            estimated_daily_cost=est,
            decision_state=state,
        )

    def apply(self, units: int, now_s: int) -> None:
        if units > self.current:
            self.last_scale_out_s = now_s
        elif units < self.current:
            self.last_scale_in_s = now_s
            self.below_count = 0
        self.current = units


def policy_for(resource_type: str, **overrides) -> CapacityPolicy:
    base = CapacityPolicy(
        budget_threshold_usd=config.budget_threshold(resource_type),
        cost_per_unit_hour=config.cost_per_unit_hour(resource_type),
    )
    for k, v in overrides.items():
        setattr(base, k, v)
    return base
