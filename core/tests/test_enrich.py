"""Enriquecimiento batch: formato de valores, ventana de 12 meses y etiquetas."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from enrich import enrich_entity, strength_flags  # noqa: E402
from publication_rows import format_signal_value  # noqa: E402


def month(**overrides) -> dict:
    values: dict = {
        "month": "2026-01",
        "coverage": 0.8,
        "months_hist": 12,
        "cap_code": None,
        "raw_signals": [
            {"signal_id": signal_id, "value": value}
            for signal_id, value in (
                ("buffer_days", 9.0),
                ("neg_cash_share", 0.0),
                ("ap_pct_paid_late", 0.4),
                ("ar_overdue_ratio", None),
                ("loc_utilisation", 0.95),
                ("debt_service_ratio", 0.2),
            )
        ],
    }
    values.update(overrides)
    return values


def test_value_format_uses_unit_and_precision() -> None:
    assert format_signal_value("buffer_days", 27.4) == "27 dias"
    assert format_signal_value("ap_pct_paid_late", 0.2) == "20 %"
    assert format_signal_value("op_in_growth", 0.1234) == "+12,3 %"
    assert format_signal_value("net_ocf_ratio", -0.15) == "-0,15"
    assert format_signal_value("buffer_days", None) is None
    assert format_signal_value("desconocida", 1.0) is None


def test_strength_flags_only_fire_on_observable_conditions() -> None:
    assert strength_flags(month()) == [
        "THIN_CASH_BUFFER",
        "LATE_SUPPLIER_PAYMENTS",
        "CREDIT_LINE_TIGHT",
    ]
    assert strength_flags(month(coverage=0.2, months_hist=3, cap_code="CAP_NEGCASH")) == [
        "THIN_CASH_BUFFER",
        "LATE_SUPPLIER_PAYMENTS",
        "CREDIT_LINE_TIGHT",
        "LOW_COVERAGE",
        "INSUFFICIENT_HISTORY",
        "CAPPED",
    ]
    # Un valor nulo no dispara nada: ausencia no es cero.
    assert strength_flags(month(cap_code=None, raw_signals=[
        {"signal_id": "buffer_days", "value": None},
        {"signal_id": "ap_pct_paid_late", "value": None},
    ])) == []


def test_op_in_window_covers_published_months_and_keeps_currency() -> None:
    entity = {
        "entity": {"kind": "company", "id": "COMP_0001"},
        "months": [month(month=label) for label in ("2025-12", "2026-01", "2026-02")],
    }
    flows = {"COMP_0001": {"op_in": {"2025-12": 100.0, "2026-02": 50.0}, "currency": "EUR"}}

    enrich_entity(entity, flows)

    assert [item["op_in_12m"] for item in entity["months"]] == [100.0, 100.0, 150.0]
    assert [item["op_in_12m_currency"] for item in entity["months"]] == ["EUR"] * 3
    assert all(item["value_fmt"] for item in entity["months"][0]["raw_signals"] if item["value"] is not None)


def test_entity_without_flows_stays_null() -> None:
    entity = {"entity": {"kind": "company", "id": "COMP_9999"}, "months": [month()]}

    enrich_entity(entity, {})

    assert entity["months"][0]["op_in_12m"] is None
    assert entity["months"][0]["op_in_12m_currency"] is None
