"""Pruebas del contrato entre señales estratégicas, scoring y JSON."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

CORE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CORE))

from scoring_embat import Factor  # noqa: E402
from signals.group_signals import attach_group_signals, calculate_group_signals  # noqa: E402


def sample_frames() -> tuple[pd.DataFrame, pd.DataFrame]:
    months = pd.date_range("2026-01-01", periods=7, freq="MS")
    factors = {
        "liquidity": Factor(70.0, {}), "payment": Factor(65.0, {}),
        "collections": Factor(60.0, {}), "debt": Factor(75.0, {}),
        "activity": Factor(68.0, {}),
    }
    scored = pd.DataFrame({
        "group_id": ["group-1"] * 7,
        "m": months,
        "score": [50.0, 52.0, 54.0, 58.0, 62.0, 66.0, 70.0],
        "coverage": [1.0] * 7,
        "confidence": [0.9] * 7,
        "penalty": [0.0] * 7,
        "factors": [factors] * 7,
        "effective": [{"liquidity": 1.0}] * 7,
        "months_hist": list(range(3, 10)),
        "buffer_days": [30.0] * 7,
    })
    panel = pd.DataFrame({
        "group_id": ["group-1"] * 7,
        "m": months,
        "cash_eom": [100.0] * 7,
        "ar_open": [40.0] * 7,
        "ar_overdue": [10.0] * 7,
        "ap_open": [60.0] * 7,
        "debt_rep_3m": [10.0] * 7,
        "op_in_3m": [150_000.0] * 7,
        "group_currency": ["EUR"] * 7,
        "ar_late3": [5.0] * 7,
        "ar_paid3": [100.0] * 7,
        "ar_iss3": [110.0] * 7,
    })
    return panel, scored


def test_five_group_signals_share_the_same_monthly_contract() -> None:
    panel, scored = sample_frames()
    signals = calculate_group_signals(panel, scored)
    assert set(signals["name"]) == {
        "current_health", "trajectory_pressure", "data_driven_peer_learning",
        "sector_benchmark_rank", "network_counterparty_health",
    }
    assert len(signals) == 35
    assert signals["value"].dropna().between(0, 100).all()
    assert signals["confidence"].dropna().between(0, 1).all()
    assert signals["coverage"].dropna().between(0, 1).all()


def test_trajectory_uses_only_information_available_at_each_month() -> None:
    panel, scored = sample_frames()
    before = calculate_group_signals(panel, scored)
    changed = scored.copy()
    changed.loc[changed.index[-1], "score"] = 0.0
    after = calculate_group_signals(panel, changed)

    cutoff = scored["m"].iloc[-2]
    previous_before = before[before["m"] <= cutoff].reset_index(drop=True)
    previous_after = after[after["m"] <= cutoff].reset_index(drop=True)
    pd.testing.assert_frame_equal(previous_before, previous_after)


def test_signals_are_exposed_without_changing_the_official_score() -> None:
    panel, scored = sample_frames()
    enriched = attach_group_signals(panel, scored)
    original_scores = scored["score"].tolist()
    assert enriched["score"].tolist() == original_scores
    assert set(enriched.iloc[-1]["strategic_signals"]) == {
        "current_health", "trajectory_pressure", "data_driven_peer_learning",
        "sector_benchmark_rank", "network_counterparty_health",
    }
