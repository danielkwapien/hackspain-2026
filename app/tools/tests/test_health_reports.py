"""Tests de `gen_health_reports.py`: el prompt y la validación del informe.

No llaman a la API de Claude ni a la API local: `build_prompt` y `validate_report` son puras
y se ejercitan con la ficha mínima de `SHEET`. Las cifras del prompt tienen que salir de
`value_fmt` (regla §7.3 de las narrativas): el test comprueba que están, no cómo se redactan.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

TOOLS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS_DIR))

from gen_health_reports import build_prompt, validate_report  # noqa: E402

SHEET = {
    "as_of": "2026-08",
    "company": {"company_id": "COMP_0009", "name": "Suministros Doriga S.L.U.", "group_id": "GROUP_0225"},
    "score": 91.1,
    "band": "solid",
    "regime": "stable",
    "confidence": 0.95,
    "delta_3m": -1.6,
    "outlook": {"h3": 89.8, "h6": 88.3, "low": 78.8, "high": 97.7, "label": "negative"},
    "drivers": [
        {
            "rank": 1,
            "signal_id": "L1",
            "pillar": "L",
            "contribution": 3.48,
            "value": 119.0,
            "value_fmt": "119 dias de colchon de caja",
            "direction": "neutral",
        },
        {
            "rank": 2,
            "signal_id": "P1",
            "pillar": "P",
            "contribution": 2.53,
            "value": 0.0,
            "value_fmt": "0 % de las facturas propias pagadas tarde",
            "direction": "neutral",
        },
    ],
    "narrative": {"headline": "Estable en 91 (solida)", "body": "", "watch_next": ""},
}

SIGNALS = {
    "as_of": "2026-08",
    "pillars": [
        {
            "pillar": "L",
            "signals": [
                {"signal_id": "L1", "value_fmt": "119 dias de colchon de caja", "is_available": True},
                {"signal_id": "L3", "value_fmt": None, "is_available": False},
            ],
        }
    ],
}

TIMELINE = [
    {"month": "2026-07", "score": 90.5, "band": "solid", "regime": "stable"},
    {"month": "2026-08", "score": 91.1, "band": "solid", "regime": "stable"},
]

ALERTS = {"items": [], "total": 0}

VALID_REPORT = {
    "risk_level": "low",
    "summary": "Cierra en banda solida con 119 dias de colchon de caja.",
    "sections": [
        {"title": "Resumen", "body": "Estable en 91 (solida)."},
        {"title": "Liquidez y caja", "body": "119 dias de colchon de caja."},
        {"title": "Pagos y cobros", "body": "0 % de las facturas propias pagadas tarde."},
        {"title": "Deuda", "body": "Sin senales de deuda entre los impulsores."},
        {"title": "Actividad", "body": "Sin senales de actividad entre los impulsores."},
    ],
    "watch_next": ["Vigilar el outlook a seis meses.", "Comprobar el colchon de caja."],
}


def test_el_prompt_incluye_nombre_score_y_value_fmt_de_los_drivers() -> None:
    prompt = build_prompt(SHEET, SIGNALS, TIMELINE, ALERTS)

    assert isinstance(prompt, str)
    assert "Suministros Doriga S.L.U." in prompt
    assert "COMP_0009" in prompt
    # El score va como cifra, con coma o con punto: lo que no puede es faltar.
    assert "91,1" in prompt or "91.1" in prompt
    for driver in SHEET["drivers"]:
        assert driver["value_fmt"] in prompt


def test_la_validacion_rechaza_un_informe_sin_sections_o_con_risk_level_fuera_de_dominio() -> None:
    validate_report(VALID_REPORT)

    sin_sections = {key: value for key, value in VALID_REPORT.items() if key != "sections"}
    with pytest.raises(ValueError):
        validate_report(sin_sections)

    with pytest.raises(ValueError):
        validate_report({**VALID_REPORT, "risk_level": "extreme"})
