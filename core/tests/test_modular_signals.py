"""Contrato mínimo del catálogo modular de señales."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

CORE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CORE))

from signals import ACTIVE_SIGNALS, calculate_signals, specs_by_pillar  # noqa: E402


def sample_panel() -> pd.DataFrame:
    """Una fila suficiente para ejecutar las 16 señales actuales."""
    return pd.DataFrame({
        "cash_eom": [100.0], "op_out_mean3": [50.0], "neg_cash_share": [0.0],
        "cash_prev3": [80.0], "cash_mean3": [100.0], "ap_late3": [10.0],
        "ap_paid3": [100.0], "ap_dlw3": [7.0], "ss_6m": [5.0],
        "active_6m": [6.0], "ss_hist": [5.0], "tax_12m": [3.0], "tax_hist": [3.0],
        "ar_overdue": [20.0], "ar_open": [100.0], "ar_late3": [10.0],
        "ar_paid3": [100.0], "ar_iss3": [110.0], "loc_utilisation": [0.5],
        "debt_rep_3m": [10.0], "feeint_3m": [2.0], "op_in_3m": [120.0],
        "op_out_3m": [100.0], "op_in_prev3": [100.0], "inflow_std3": [10.0],
        "inflow_mean3": [100.0],
    })


def test_current_catalog_has_unique_names_and_five_pillars() -> None:
    names = [signal.name for signal in ACTIVE_SIGNALS]
    assert len(names) == len(set(names)) == 16
    assert set(specs_by_pillar()) == {"liquidity", "payment", "collections", "debt", "activity"}


def test_every_active_signal_returns_one_value_per_panel_row() -> None:
    panel = sample_panel()
    values = calculate_signals(panel)
    assert values.index.equals(panel.index)
    assert list(values.columns) == [signal.name for signal in ACTIVE_SIGNALS]
    assert values.notna().all().all()


def test_representative_formulas_keep_the_previous_semantics() -> None:
    values = calculate_signals(sample_panel()).iloc[0]
    assert values["buffer_days"] == 60.0
    assert values["ap_pct_paid_late"] == 0.1
    assert values["ar_overdue_ratio"] == 0.2
    assert values["debt_service_ratio"] == 0.1
    assert abs(values["op_in_growth"] - 0.2) < 1e-12
