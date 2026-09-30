from capplan_ml.capacity import CapacityController, CapacityPolicy, required_units


def test_required_units_formula():
    # ceil(P90 / throughput × (1 + margin)) = ceil(100 / 8 × 1.2) = ceil(15.0) = 15
    assert required_units(100, 8, 0.2) == 15
    assert required_units(101, 8, 0.2) == 16
    assert required_units(0.1, 8, 0.2) == 1


def _ctrl(**kw):
    pol = CapacityPolicy(min_units=2, max_units=100, budget_threshold_usd=10_000, cost_per_unit_hour=1.0, **kw)
    return CapacityController(pol, throughput=10, current=20)


def test_scale_out_is_immediate_and_clamped():
    c = _ctrl()
    d = c.decide(2000, now_s=0)  # needs 240 → clamped to 100
    assert d.raw_required == 240 and d.required == 100


def test_hysteresis_blocks_first_scale_in_then_allows():
    c = _ctrl(hysteresis_periods=2, scale_in_cooldown_s=0)
    d1 = c.decide(80, now_s=0)  # needs 10 < 20 × 0.9
    assert d1.hysteresis_active and d1.required == 20
    d2 = c.decide(80, now_s=300)
    assert not d2.hysteresis_active and d2.required == 10


def test_small_dip_inside_band_never_scales_in():
    c = _ctrl(hysteresis_pct=0.1, hysteresis_periods=1, scale_in_cooldown_s=0)
    for t in range(5):
        d = c.decide(160, now_s=t * 300)  # needs 20 × 0.96 → 20; then 19.2 → 20
        assert d.required == 20


def test_scale_in_cooldown():
    c = _ctrl(hysteresis_periods=1, scale_in_cooldown_s=600)
    c.apply(15, now_s=0)  # a scale-in just happened
    d = c.decide(50, now_s=300)
    assert d.required == 15 and d.cooldown_remaining_s == 300


def test_budget_cap_forces_approval():
    pol = CapacityPolicy(min_units=1, max_units=1000, budget_threshold_usd=240, cost_per_unit_hour=1.0)
    c = CapacityController(pol, throughput=10, current=5)
    d = c.decide(500, now_s=0)  # wants 60 units, budget allows 10/day
    assert d.budget_capped and d.required == 10 and d.decision_state == "approve"


def test_decision_states():
    c = _ctrl()
    assert c.decide(170, now_s=0).decision_state == "auto-execute"  # 20 → 21 (5%)
    c = _ctrl()
    assert c.decide(500, now_s=0).decision_state == "approve"  # 20 → 60 (200%)
    c = _ctrl(mode="recommend-only")
    assert c.decide(500, now_s=0).decision_state == "recommend"
