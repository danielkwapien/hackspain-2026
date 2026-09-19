"""Enriquecimiento batch: formato de valores, ventana de 12 meses y fortaleza."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from enrich import enrich_entity, strength_flags  # noqa: E402
from publication_rows import format_signal_value  # noqa: E402


def month(label: str = "2026-01", **overrides) -> dict:
    values: dict = {
        "month": label,
        "coverage": 0.8,
        "months_hist": 12,
        "cap_code": None,
        "raw_signals": [
            {"signal_id": signal_id, "value": value}
            for signal_id, value in (
                ("buffer_days", 90.0),
                ("loc_utilisation", 0.10),
                ("ap_pct_paid_late", 0.05),
                ("op_in_growth", 0.10),
                ("ar_overdue_ratio", 0.05),
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


def test_strength_flags_are_the_published_positive_conditions() -> None:
    history = [month(f"2025-{index:02d}") for index in range(1, 8)]

    # (a) crece con mora plana o bajando, (b) paga puntual seis meses,
    # (c) colchon >= 60 dias con linea <= 30 %.
    assert strength_flags(history, 6) == ["GROWTH_NO_DSO", "PAYS_ON_TIME", "BUFFER_LOW_UTIL"]

    # Con la mora subiendo no hay fortaleza de crecimiento.
    rising = list(history)
    rising[6] = month("2025-07")
    for signal in rising[6]["raw_signals"]:
        if signal["signal_id"] == "ar_overdue_ratio":
            signal["value"] = 0.30
    assert strength_flags(rising, 6) == ["PAYS_ON_TIME", "BUFFER_LOW_UTIL"]

    # Un valor nulo no dispara nada: ausencia no es fortaleza.
    empty = [month(f"2025-{index:02d}", raw_signals=[]) for index in range(1, 8)]
    assert strength_flags(empty, 6) == []


def test_op_in_window_covers_published_months_and_keeps_currency() -> None:
    entity = {
        "entity": {"kind": "company", "id": "COMP_0001"},
        "months": [month(label) for label in ("2025-12", "2026-01", "2026-02")],
    }
    flows = {
        "COMP_0001": {
            "op_in": {"2025-12": 100.0, "2026-02": 50.0},
            "op_in_eur": {"2025-12": 80.0, "2026-02": 40.0},
            "currency": "GBP",
        }
    }

    enrich_entity(entity, flows, by_currency=True)

    assert [item["op_in_12m"] for item in entity["months"]] == [100.0, 100.0, 150.0]
    assert [item["op_in_12m_eur"] for item in entity["months"]] == [80.0, 80.0, 120.0]
    assert [item["op_in_12m_currency"] for item in entity["months"]] == ["GBP"] * 3
    assert all(item["value_fmt"] for item in entity["months"][0]["raw_signals"] if item["value"] is not None)


def test_group_grain_only_publishes_the_eur_consolidation() -> None:
    entity = {"entity": {"kind": "group", "id": "GROUP_0001"}, "months": [month()]}
    flows = {
        "GROUP_0001": {"op_in": {"2026-01": 999.0}, "op_in_eur": {"2026-01": 800.0}, "currency": None}
    }

    enrich_entity(entity, flows, by_currency=False)

    assert entity["months"][0]["op_in_12m"] is None
    assert entity["months"][0]["op_in_12m_currency"] is None
    assert entity["months"][0]["op_in_12m_eur"] == 800.0


def test_entity_without_flows_stays_null() -> None:
    entity = {"entity": {"kind": "company", "id": "COMP_9999"}, "months": [month()]}

    enrich_entity(entity, {}, by_currency=True)

    assert entity["months"][0]["op_in_12m"] is None
    assert entity["months"][0]["op_in_12m_currency"] is None
    assert entity["months"][0]["op_in_12m_eur"] is None
