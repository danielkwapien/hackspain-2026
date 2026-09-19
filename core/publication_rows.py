from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from engine import config
from engine_contract import API_SIGNAL_IDS, PILLAR_CODES
from publication_schema import (
    ALERT_COLUMNS,
    CATALOG_COLUMNS,
    DRIVER_COLUMNS,
    EXPORT_COLUMNS,
    SCORE_COLUMNS,
    SIGNAL_COLUMNS,
    STRATEGIC_COLUMNS,
)
from publication_frames import build_frame_rows
from signals import specs_by_pillar

type JsonValue = str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]


class PublicationIdentityError(ValueError):
    def __init__(self, entity_id: str, month: str, reason: str) -> None:
        super().__init__(f"{entity_id}/{month}: {reason}")

V2_SIGNAL_IDS = tuple(
    [f"L{index}" for index in range(1, 6)]
    + [f"P{index}" for index in range(1, 7)]
    + [f"C{index}" for index in range(1, 7)]
    + [f"D{index}" for index in range(1, 7)]
    + [f"A{index}" for index in range(1, 7)]
)

SIGNAL_META = {
    "buffer_days": ("days", "higher_better", "3m"),
    "neg_cash_share": ("ratio", "lower_better", "3m"),
    "cash_trend": ("ratio", "higher_better", "3m_vs_previous_3m"),
    "ap_pct_paid_late": ("ratio", "lower_better", "3m"),
    "ap_days_late": ("days", "lower_better", "3m"),
    "ss_regularity": ("ratio", "higher_better", "6m"),
    "tax_regularity": ("ratio", "higher_better", "12m"),
    "ar_overdue_ratio": ("ratio", "lower_better", "as_of"),
    "ar_pct_paid_late": ("ratio", "lower_better", "3m"),
    "collection_ratio": ("ratio", "higher_better", "3m"),
    "loc_utilisation": ("ratio", "lower_better", "snapshot"),
    "debt_service_ratio": ("ratio", "lower_better", "3m"),
    "feeint_share": ("ratio", "lower_better", "3m"),
    "op_in_growth": ("ratio", "higher_better", "3m_vs_previous_3m"),
    "inflow_cv": ("ratio", "lower_better", "3m"),
    "net_ocf_ratio": ("ratio", "higher_better", "3m"),
}

# Definicion de formato de cada senal: como se escribe su valor en unidades
# reales. `scale` pasa la fraccion publicada a la unidad mostrada (0.123 → 12,3 %),
# `decimals` fija la precision, `suffix` la unidad y `signed` obliga a mostrar el
# signo en los positivos (crecimientos y tendencias). El catalogo publica esta
# misma definicion en su columna `format`; `enrich.py` la aplica en lote para
# rellenar `value_fmt`.
SIGNAL_FORMATS = {
    "buffer_days": {"unit": "days", "decimals": 0, "scale": 1.0, "suffix": "dias", "signed": False},
    "neg_cash_share": {"unit": "percent", "decimals": 0, "scale": 100.0, "suffix": "%", "signed": False},
    "cash_trend": {"unit": "percent", "decimals": 1, "scale": 100.0, "suffix": "%", "signed": True},
    "ap_pct_paid_late": {"unit": "percent", "decimals": 0, "scale": 100.0, "suffix": "%", "signed": False},
    "ap_days_late": {"unit": "days", "decimals": 1, "scale": 1.0, "suffix": "dias", "signed": False},
    "ss_regularity": {"unit": "percent", "decimals": 0, "scale": 100.0, "suffix": "%", "signed": False},
    "tax_regularity": {"unit": "percent", "decimals": 0, "scale": 100.0, "suffix": "%", "signed": False},
    "ar_overdue_ratio": {"unit": "percent", "decimals": 1, "scale": 100.0, "suffix": "%", "signed": False},
    "ar_pct_paid_late": {"unit": "percent", "decimals": 0, "scale": 100.0, "suffix": "%", "signed": False},
    "collection_ratio": {"unit": "percent", "decimals": 1, "scale": 100.0, "suffix": "%", "signed": False},
    "loc_utilisation": {"unit": "percent", "decimals": 0, "scale": 100.0, "suffix": "%", "signed": False},
    "debt_service_ratio": {"unit": "times", "decimals": 2, "scale": 1.0, "suffix": "x", "signed": False},
    "feeint_share": {"unit": "percent", "decimals": 1, "scale": 100.0, "suffix": "%", "signed": False},
    "op_in_growth": {"unit": "percent", "decimals": 1, "scale": 100.0, "suffix": "%", "signed": True},
    "inflow_cv": {"unit": "index", "decimals": 2, "scale": 1.0, "suffix": "", "signed": False},
    "net_ocf_ratio": {"unit": "index", "decimals": 2, "scale": 1.0, "suffix": "", "signed": True},
}

# Etiquetas de fortaleza explicitas de ENGINE §4.6 (positivas: reconocen a la
# empresa solida, no son avisos de riesgo). El lote emite solo las condiciones que
# el motor publica: (a) crecimiento sin tension de cobros, (b) pago puntual y
# (c) colchon profundo con linea ociosa. (d) `DELEVERAGING` y (e) `SAVINGS`
# dependen de señales (D2, D6, L5) que el motor aun no calcula y no se emiten: la
# regla exacta vive en `core/enrich.py` y el contrato la documenta.
STRENGTH_FLAGS = (
    "GROWTH_NO_DSO",
    "PAYS_ON_TIME",
    "BUFFER_LOW_UTIL",
)


def _decimal(value: float, decimals: int) -> str:
    """Numero con coma decimal y punto de millares (convencion es-ES)."""
    return f"{value:,.{decimals}f}".replace(",", "@").replace(".", ",").replace("@", ".")


def format_signal_value(signal_id: str, value: float | None) -> str | None:
    """`value_fmt` de una senal: su valor en unidades reales, o `None` sin dato."""
    spec = SIGNAL_FORMATS.get(signal_id)
    if value is None or spec is None:
        return None
    scaled = float(value) * float(spec["scale"])
    number = _decimal(scaled, int(spec["decimals"]))
    if spec["signed"] and scaled > 0:
        number = f"+{number}"
    suffix = str(spec["suffix"])
    return f"{number} {suffix}" if suffix else number


def signal_format(signal_id: str) -> dict:
    """Definicion publicada en el catalogo; sin entrada, sin formato declarado."""
    return dict(SIGNAL_FORMATS[signal_id])



@dataclass(frozen=True, slots=True)
class PublicationRows:
    tables: dict[str, list[tuple]]
    group_rows: int
    company_rows: int
    source_md5: str
    group_payload_sha256: str
    company_payload_sha256: str


def _json(value: JsonValue) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _metadata(payload: dict, source_md5: str) -> tuple[str, str, str]:
    return payload["params_version"], source_md5, payload["generated_at"]


def _validate_month(entity_id: str, month: dict) -> None:
    level, cap, score = month.get("level"), month.get("cap"), month.get("score")
    if level is None:
        if score is not None:
            raise PublicationIdentityError(entity_id, month["month"], "score without level")
        return
    expected = round(min(float(level), float(cap)), 2)
    if score is None or abs(float(score) - expected) > 1e-9:
        raise PublicationIdentityError(entity_id, month["month"], "score != min(level, cap)")
    expected_adjustment = round(float(level) - min(float(level), float(cap)), 2)
    if abs(float(month["cap_adjustment"]) - expected_adjustment) > 1e-9:
        raise PublicationIdentityError(entity_id, month["month"], "invalid cap adjustment")


def _score_row(entity: dict, month: dict, payload: dict, source_md5: str) -> tuple:
    entity_id = entity["entity"]["id"]
    kind = entity["entity"]["kind"]
    _validate_month(entity_id, month)
    group_id = entity_id if kind == "group" else entity.get("group_id")
    company_id = entity_id if kind == "company" else None
    pillars = month["pillars"]
    trajectory = month["trajectory"]
    values = {
        "entity_kind": kind, "group_id": group_id, "company_id": company_id,
        "month": month["month"], "month_index": month["month_index"],
        "months_hist": month["months_hist"], "warmup": month["warmup"],
        "branch": month["branch"],
        **{f"pillar_{code.lower()}": pillars[code]["value"] for code in "LPCDA"},
        **{f"weight_{code.lower()}": pillars[code]["weight"] for code in "LPCDA"},
        "source_level": month["source_level"], "penalty": month["penalty"],
        "level": month["level"], "cap": month["cap"], "cap_code": month["cap_code"],
        "cap_adjustment": month["cap_adjustment"], "score": month["score"],
        "band": month["band"],
        "delta_1m": trajectory["delta_1m"], "delta_3m": trajectory["delta_3m"],
        "delta_6m": trajectory["delta_6m"], "slope_3m": trajectory["slope_3m"],
        "slope_6m": trajectory["slope_6m"], "z_own": trajectory["z_own"],
        "run": trajectory["months_in_direction"], "level_shift": trajectory.get("level_shift"),
        "regime": trajectory["regime"], "direction": trajectory["direction"],
        "outlook_3m": month["outlook_3m"], "outlook_6m": month["outlook_6m"],
        "outlook_low": month["outlook_low"], "outlook_high": month["outlook_high"],
        "confidence": month["confidence"], "coverage": month["coverage"],
        "op_in_12m": month.get("op_in_12m"), "op_in_12m_currency": month.get("op_in_12m_currency"),
        "op_in_12m_eur": month.get("op_in_12m_eur"),
        "strength_flags": _json(month.get("strength_flags") or []),
        "drivers": _json(month["drivers"]), "narrative": _json(month["narrative"]),
        "strategic_signals": _json(month["signals"]), "trace": _json(month["trace"]),
        "payload": _json(month), "model_version": payload["model_version"],
        "params_version": payload["params_version"], "source_md5": source_md5,
        "generated_at": payload["generated_at"],
    }
    return tuple(values[column] for column in SCORE_COLUMNS)


def _entity_rows(entity: dict, payload: dict, source_md5: str) -> dict[str, list[tuple]]:
    kind = entity["entity"]["kind"]
    entity_id = entity["entity"]["id"]
    group_id = entity_id if kind == "group" else entity.get("group_id")
    company_id = entity_id if kind == "company" else None
    metadata = _metadata(payload, source_md5)
    prefix = "group" if kind == "group" else "company"
    tables = {f"{prefix}_scores": [], f"{prefix}_signal_values": [],
              f"{prefix}_strategic_signals": [], f"{prefix}_drivers": [],
              f"{prefix}_alerts": []}
    for month in entity["months"]:
        tables[f"{prefix}_scores"].append(_score_row(entity, month, payload, source_md5))
        for signal in month["raw_signals"]:
            values = (kind, group_id, company_id, month["month"], signal["signal_id"],
                      signal["api_signal_id"], signal["pillar"], signal["label"], signal["value"],
                      signal["value_fmt"], signal["points"], signal["u"], signal["u_smooth"],
                      signal["u_ref"], signal["weight"], signal["contribution"],
                      signal["delta_vs_prev"], signal["is_available"], signal["quality_flag"],
                      _json(signal), *metadata)
            tables[f"{prefix}_signal_values"].append(values)
        modifier_deltas = {step["name"]: step.get("delta") for step in month["trace"]
                           if step.get("stage") == "modifier"}
        for name, signal in month["signals"].items():
            delta = modifier_deltas.get(name)
            values = (kind, group_id, company_id, month["month"], name, signal.get("value"),
                      signal.get("confidence"), signal.get("coverage"), signal.get("direction"),
                      delta, delta is not None, _json(signal.get("evidence")), _json(signal), *metadata)
            tables[f"{prefix}_strategic_signals"].append(values)
        for driver in month["drivers"]:
            values = (kind, group_id, company_id, month["month"], driver["rank"],
                      driver["signal_id"], driver["pillar"], driver["contribution"],
                      driver["delta_vs_prev"], driver["value"], driver["value_fmt"],
                      driver["direction"], driver["kind"], driver["message"], _json(driver), *metadata)
            tables[f"{prefix}_drivers"].append(values)
        warning = month["early_warning"]
        if warning["alert"]:
            alert_id = f"{entity_id}:{month['month']}:buffer"
            values = (alert_id, kind, group_id, company_id, month["month"], warning["band"],
                      "buffer_days", warning["trend"], None, month["score"],
                      month["drivers"][0]["signal_id"] if month["drivers"] else None,
                      warning["reason"], _json(warning), *metadata)
            tables[f"{prefix}_alerts"].append(values)
    return tables


def _catalog_rows(payload: dict, source_md5: str) -> list[tuple]:
    metadata = _metadata(payload, source_md5)
    rows = []
    mapped = set(API_SIGNAL_IDS.values())
    for pillar, signals in specs_by_pillar().items():
        for signal_id, spec in signals.items():
            unit, direction, window = SIGNAL_META[signal_id]
            entry = {
                "signal_id": signal_id, "api_signal_id": API_SIGNAL_IDS.get(signal_id),
                "pillar": PILLAR_CODES[pillar], "label": spec["label"], "unit": unit,
                "direction": direction, "weight_in_pillar": float(spec["weight"]),
                "pillar_weight": 100.0 * config.PILLAR_WEIGHTS[pillar],
                "anchors": [[raw, points / 100.0] for raw, points in spec["anchors"]],
                "window": window, "requires": [], "scores": True, "available": True,
                "format": SIGNAL_FORMATS.get(signal_id),
            }
            values = (*[_json(entry[column]) if column in {"anchors", "requires", "format"}
                        else entry[column] if column != "payload" else _json(entry)
                        for column in CATALOG_COLUMNS[:-3]], *metadata)
            rows.append(values)
    for signal_id in V2_SIGNAL_IDS:
        if signal_id in mapped:
            continue
        pillar = signal_id[0]
        entry = {"signal_id": signal_id, "api_signal_id": signal_id, "pillar": pillar,
                 "label": None, "unit": None, "direction": None, "weight_in_pillar": 0.0,
                 "pillar_weight": 100.0 * config.PILLAR_WEIGHTS[next(
                     name for name, code in PILLAR_CODES.items() if code == pillar)],
                 "anchors": None, "window": None, "requires": [], "scores": False,
                 "available": False}
        values = (signal_id, signal_id, pillar, None, None, None, 0.0, entry["pillar_weight"],
                  _json(None), None, _json([]), False, False, _json(None), _json(entry), *metadata)
        rows.append(values)
    return rows


def build_publication_rows(payload: dict, source_md5: str) -> PublicationRows:
    tables: dict[str, list[tuple]] = {
        "group_scores": [], "company_scores": [], "group_signal_values": [],
        "company_signal_values": [], "group_strategic_signals": [],
        "company_strategic_signals": [], "group_drivers": [], "company_drivers": [],
        "group_alerts": [], "company_alerts": [], "signal_catalog": [], "engine_exports": [],
        "engine_frames": [],
    }
    for entity in [*payload["groups"], *payload["companies"]]:
        for table, rows in _entity_rows(entity, payload, source_md5).items():
            tables[table].extend(rows)
    tables["signal_catalog"] = _catalog_rows(payload, source_md5)
    tables["engine_frames"] = build_frame_rows(payload, source_md5)
    group_months = [month["month"] for entity in payload["groups"] for month in entity["months"]]
    group_sha = hashlib.sha256(_json(payload["groups"]).encode()).hexdigest()
    company_sha = hashlib.sha256(_json(payload["companies"]).encode()).hexdigest()
    metadata = {"parameters": payload.get("parameters"), "table_counts": {
        table: len(rows) for table, rows in tables.items() if table != "engine_exports"},
        "group_payload_sha256": group_sha, "company_payload_sha256": company_sha}
    export = (payload["model_version"], payload["params_version"], payload["data_version"],
              payload["cutoff_date"], min(group_months), max(group_months), len(payload["groups"]),
              len(tables["group_scores"]), len(payload["companies"]),
              len(tables["company_scores"]), len(set(group_months)), payload["generated_at"],
              source_md5, _json(metadata))
    tables["engine_exports"] = [export]
    return PublicationRows(tables, len(tables["group_scores"]), len(tables["company_scores"]),
                           source_md5, group_sha, company_sha)
