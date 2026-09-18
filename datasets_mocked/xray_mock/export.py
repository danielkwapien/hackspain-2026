"""Escritura del dataset mock: CSV, `frames/` y `exports/v1/` (contrato §1).

Todo lo que sale de aqui es DETERMINISTA byte a byte:

- floats escritos con `FLOAT_PRECISION` cifras significativas (nada de ruido de
  representacion), `-0.0` normalizado a `0`;
- `None` -> celda vacia, `bool` -> `True`/`False` (lo que `pandas.read_csv`
  devuelve como `bool`);
- filas siempre ordenadas explicitamente antes de escribir;
- JSON con `sort_keys=True`, separadores fijos y `ensure_ascii=False`;
- ni un `datetime.now()`: `generated_at` es el `--now` del CLI.
"""

from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path

from . import catalog, simulate
from .simulate import PILLARS

#: Cifras SIGNIFICATIVAS con las que se escribe cada float, en CSV y en JSON.
#:
#: No son 6 decimales fijos a proposito: con 6 decimales, `Σ 100·w·P` sobre
#: cinco pilares acumula ~1e-4 de error de representacion y las invariantes del
#: contrato §3 (tolerancia 1e-6) no se pueden comprobar sobre lo escrito; el
#: caso peor es D4, cuya unidad vive en [0, 0,08] y pierde la inversa de la
#: normalizacion. Con 12 cifras significativas el error queda en ~1e-10, el
#: formato sigue siendo deterministico (`%.12g` no depende de la plataforma) y
#: los numeros redondos se escriben cortos (`0.5`, no `0.500000000000`).
FLOAT_PRECISION = 12
FLOAT_FORMAT = f".{FLOAT_PRECISION}g"

# --------------------------------------------------------------------------
# Esquemas (contrato §2.1-§2.8). El orden de columnas es parte del contrato.
# --------------------------------------------------------------------------

COMPANIES_COLUMNS = [
    "company_id", "group_id", "name", "country", "currency", "erp", "created_at",
    "first_activity", "last_activity", "months_hist",
    "has_invoices", "has_debt", "has_debt_repayment", "has_lineofcredit", "branch",
    "n_banking_products", "n_debt_products", "n_invoices", "n_transactions",
    "op_in_12m", "cash_quality",
]

GROUPS_COLUMNS = [
    "group_id", "name", "erp", "n_companies", "countries", "currencies",
    "consolidation_currency", "op_in_12m_eur", "has_intercompany",
]

SCORE_TIMELINE_COLUMNS = (
    ["company_id", "month", "month_index", "months_hist", "warmup", "branch"]
    + [f"pillar_{p}" for p in PILLARS]
    + [f"weight_{p}" for p in PILLARS]
    + ["level", "penalty", "cap_code", "cap", "score", "band",
       "delta_1m", "delta_3m", "delta_6m", "slope_3m", "slope_6m",
       "z_own", "breadth", "run", "p_change", "level_shift", "regime",
       "outlook_3m", "outlook_6m", "outlook_low", "outlook_high", "outlook_label",
       "confidence", "strength_flags", "base"]
)

GROUP_TIMELINE_COLUMNS = [
    "group_id", "month", "score", "band", "regime", "delta_1m", "delta_3m",
    "outlook_6m", "outlook_low", "outlook_high", "confidence",
    "n_companies_scored", "dispersion", "weakest_company", "weakest_score",
    "strongest_company", "intragroup_dependency_max",
]

SIGNALS_COLUMNS = [
    "company_id", "month", "signal_id", "pillar", "value", "value_fmt",
    "u", "u_smooth", "u_ref", "weight", "contribution", "delta_vs_prev",
    "is_available", "quality_flag",
]

DRIVERS_COLUMNS = [
    "company_id", "month", "rank", "signal_id", "pillar", "contribution",
    "delta_vs_prev", "value", "value_fmt", "direction",
]

ALERTS_COLUMNS = [
    "alert_id", "company_id", "group_id", "event", "severity", "direction",
    "month_detected", "month_evident", "lead_time_months", "trigger_signal",
    "score_before", "score_after", "status", "message",
]

NARRATIVES_COLUMNS = [
    "company_id", "month", "headline", "body", "watch_next", "guardrail_passed",
]

SIGNAL_CATALOG_COLUMNS = [
    "signal_id", "pillar", "pillar_name", "name", "unit", "direction",
    "weight_in_pillar", "pillar_weight", "norm", "anchors", "window", "ewma",
    "requires", "scores",
]


# --------------------------------------------------------------------------
# Primitivas deterministas
# --------------------------------------------------------------------------


def fmt_cell(value) -> str:
    """Una celda de CSV, siempre igual para el mismo valor."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "True" if value else "False"
    if isinstance(value, float):
        if value != value:  # NaN
            return ""
        if value == 0.0:
            return "0"  # evita "-0"
        return format(value, FLOAT_FORMAT)
    if isinstance(value, (list, tuple)):
        return "|".join(str(v) for v in value)
    return str(value)


class Table:
    """Escritor CSV incremental: `signals.csv` no cabe comodo en memoria."""

    def __init__(self, path: Path, columns: list[str]):
        self.path = Path(path)
        self.columns = columns
        self.rows = 0
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = self.path.open("w", newline="", encoding="utf-8")
        self._writer = csv.writer(self._fh, lineterminator="\n")
        self._writer.writerow(columns)

    def write(self, row: dict) -> None:
        self._writer.writerow([fmt_cell(row.get(c)) for c in self.columns])
        self.rows += 1

    def write_all(self, rows) -> None:
        for row in rows:
            self.write(row)

    def close(self) -> None:
        self._fh.close()

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        self.close()


def _round(value):
    """Redondeo recursivo para JSON: mismos bytes en cada ejecucion."""
    if isinstance(value, float):
        if value != value:
            return None
        if value == 0.0:
            return 0.0
        return float(format(value, FLOAT_FORMAT))
    if isinstance(value, dict):
        return {k: _round(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_round(v) for v in value]
    return value


def write_json(path: Path, payload) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(_round(payload), fh, ensure_ascii=False, sort_keys=True,
                  separators=(",", ":"))
        fh.write("\n")


# --------------------------------------------------------------------------
# Catalogo de senales
# --------------------------------------------------------------------------


def write_signal_catalog(path: Path) -> int:
    """`signal_catalog.csv`: las 28 que puntuan mas A6, que no puntua."""
    with Table(path, SIGNAL_CATALOG_COLUMNS) as table:
        for sig in list(catalog.SIGNALS) + list(catalog.QUALITY_SIGNALS):
            table.write({
                "signal_id": sig["signal_id"],
                "pillar": sig["pillar"],
                "pillar_name": catalog.PILLAR_NAMES[sig["pillar"]],
                "name": sig["name"],
                "unit": sig["unit"],
                "direction": sig["direction"],
                "weight_in_pillar": sig["weight"],
                "pillar_weight": catalog.PILLAR_WEIGHTS[sig["pillar"]],
                "norm": sig["norm"],
                "anchors": json.dumps(sig["anchors"], separators=(",", ":"))
                if sig["anchors"] else "",
                "window": sig["window"],
                "ewma": sig["ewma"],
                "requires": sig["requires"] or "",
                "scores": sig.get("scores", True),
            })
        return table.rows


# --------------------------------------------------------------------------
# frames/YYYY-MM.json (contrato §2.9)
# --------------------------------------------------------------------------


def build_frame(month, company_rows, group_rows, alerts_this_month,
                sparklines, alerted_ids) -> dict:
    """Estado del universo en un mes: EXACTAMENTE las entidades activas."""
    companies = [
        {
            "company_id": row["company_id"],
            "score": row["score"],
            "delta_1m": row["delta_1m"],
            "band": row["band"],
            "regime": row["regime"],
            "sparkline_12": sparklines[row["company_id"]],
            "alert": row["company_id"] in alerted_ids,
        }
        for row in company_rows
    ]
    groups = [
        {
            "group_id": row["group_id"],
            "score": row["score"],
            "delta_1m": row["delta_1m"],
            "band": row["band"],
            "regime": row["regime"],
            "dispersion": row["dispersion"],
            "weakest_company": row["weakest_company"],
            "alert": any(a["group_id"] == row["group_id"] for a in alerts_this_month),
        }
        for row in group_rows
    ]
    scores = [c["score"] for c in companies]
    moving = sum(
        1 for row in company_rows
        if row["delta_1m"] is not None
        and abs(row["delta_1m"]) >= simulate.MOVING_THRESHOLD
    )
    return {
        "month": month,
        "companies": companies,
        "groups": groups,
        "alerts_this_month": alerts_this_month,
        "stats": {
            "mean_score": sum(scores) / len(scores) if scores else None,
            "n_moving": moving,
            "n_deteriorating": sum(1 for c in companies if c["regime"] == "deteriorating"),
            "n_improving": sum(1 for c in companies if c["regime"] == "improving"),
        },
    }


# --------------------------------------------------------------------------
# exports/v1 (contrato §2.10 = dashboard-v1 + extension `xray`)
# --------------------------------------------------------------------------

CONTRACT_VERSION = "dashboard-v1"
MODEL_VERSION = "mock-v1"
DATA_VERSION = "embat-v2"
CUTOFF_DATE = "2026-09-01"

_TRAJECTORY_DIRECTION = {
    "improving": "improving",
    "recovering": "improving",
    "deteriorating": "deteriorating",
    "shock_pending": "deteriorating",
    "stable": "stable",
    "blip": "stable",
    "warmup": "unknown",
}


def _status(timeline, months_hist) -> str:
    if months_hist < 3 or not timeline:
        return "insufficient_data"
    return "partial" if timeline[-1]["confidence"] < 0.7 else "available"


def _months_in_direction(timeline) -> int:
    ultimo = timeline[-1]["regime"]
    n = 0
    for row in reversed(timeline):
        if row["regime"] != ultimo:
            break
        n += 1
    return n


def company_result(sim, derived, u_ref, name, alerts, narratives,
                   quality_reasons, generated_at) -> dict:
    """`exports/v1/results/COMP_xxxx.json`.

    Las contribuciones y los drivers se reconstruyen con las MISMAS funciones
    que escriben `signals.csv` y `drivers.csv`: el JSON no puede discrepar del
    CSV porque salen del mismo sitio. `contributions` del contrato v1 es la
    descomposicion del score, asi que se queda con las senales DISPONIBLES: las
    que la empresa no calcula aportan 0 y estan en `signals.csv` con
    `is_available = false`, que es donde la UI las distingue de un dato ausente.
    """
    timeline = derived.timeline
    ultimo = timeline[-1] if timeline else None
    por_mes: dict[str, list[dict]] = {}
    for fila in simulate.signal_rows(sim, derived, u_ref):
        if not fila["is_available"]:
            continue
        por_mes.setdefault(fila["month"], []).append(fila)

    months = []
    ultimo_mes = {"contributions": [], "change_vs_prev": {"delta": None, "drivers": []}}
    for t, row in enumerate(timeline):
        mes = row["month"]
        contribuciones = [
            {
                "signal": s["signal_id"],
                "value": s["value"],
                "weight": s["weight"],
                "contribution": s["contribution"],
                "direction": ("better_when_higher"
                              if catalog.SIGNALS_BY_ID[s["signal_id"]]["direction"]
                              == "higher_better" else "better_when_lower"),
            }
            for s in por_mes[mes]
        ]
        cambio = {
            "delta": row["delta_1m"],
            "drivers": [
                {"signal": d["signal_id"], "delta": d["delta_vs_prev"],
                 "contribution": d["contribution"], "value_fmt": d["value_fmt"]}
                for d in simulate.month_drivers(sim, derived, t)
            ],
        }
        months.append({
            "month": mes,
            "score": row["score"],
            "basis": "mock",
            "coverage": {"months_observed": row["month_index"], "reason": None},
            "contributions": contribuciones,
            "change_vs_prev": cambio,
        })
        ultimo_mes = {"contributions": contribuciones, "change_vs_prev": cambio}

    company_id = sim.company_id
    group_id = sim.group_id
    coverage_ratio = sim.covered_weight / 100.0
    narrativa = narratives[-1] if narratives else None
    return {
        "contract_version": CONTRACT_VERSION,
        "entity": {"kind": "company", "id": company_id, "name": name,
                   "group_id": group_id},
        "cutoff_date": CUTOFF_DATE,
        "generated_at": generated_at,
        "model_version": MODEL_VERSION,
        "data_version": DATA_VERSION,
        "data_kind": "mock",
        "status": _status(timeline, ultimo["months_hist"] if ultimo else 0),
        "score": ultimo["score"] if ultimo else None,
        "months": months,
        # Mismo contenido que `months[-1]`, arriba del todo: es lo que pinta la
        # ficha del mes de corte sin recorrer los 24 meses.
        "contributions": ultimo_mes["contributions"],
        "change_vs_prev": ultimo_mes["change_vs_prev"],
        "trajectory": {
            "direction": _TRAJECTORY_DIRECTION[ultimo["regime"]] if ultimo else "unknown",
            "months_in_direction": _months_in_direction(timeline) if timeline else None,
            "regime": ultimo["regime"] if ultimo else None,
        },
        "quality": {"coverage_ratio": coverage_ratio, "reasons": quality_reasons},
        "alerts": [
            {
                "id": a["alert_id"],
                "month": a["month_detected"],
                "kind": "deterioration" if a["direction"] == "down" else "improvement",
                "severity": a["severity"],
                "signal": a["trigger_signal"],
                "message": a["message"],
                "evidence": {
                    "event": a["event"],
                    "month_evident": a["month_evident"],
                    "lead_time_months": a["lead_time_months"],
                    "score_before": a["score_before"],
                    "score_after": a["score_after"],
                    "status": a["status"],
                },
            }
            for a in alerts
        ],
        "forecast": _forecast(ultimo),
        "xray": {
            "band": ultimo["band"] if ultimo else None,
            "branch": ultimo["branch"] if ultimo else None,
            "outlook": {
                "h3": ultimo["outlook_3m"], "h6": ultimo["outlook_6m"],
                "low": ultimo["outlook_low"], "high": ultimo["outlook_high"],
                "label": ultimo["outlook_label"],
            } if ultimo else None,
            "confidence": ultimo["confidence"] if ultimo else None,
            "pillars": {
                p: {"value": ultimo[f"pillar_{p}"], "weight": ultimo[f"weight_{p}"]}
                for p in PILLARS
            } if ultimo else None,
            "penalty": ultimo["penalty"] if ultimo else None,
            "cap": {"code": ultimo["cap_code"], "value": ultimo["cap"]} if ultimo else None,
            "strength_flags": [f for f in (ultimo["strength_flags"].split("|")
                                           if ultimo else []) if f],
            "narrative": narrativa,
        },
    }


def _forecast(ultimo) -> dict | None:
    """Bloque `forecast` de dashboard-v1: separado, nunca mezclado con la serie."""
    if ultimo is None:
        return None
    score = ultimo["score"]
    h6 = ultimo["outlook_6m"]
    low, high = ultimo["outlook_low"], ultimo["outlook_high"]
    puntos = []
    year, month = (int(x) for x in ultimo["month"].split("-"))
    for h in range(1, 7):
        month += 1
        if month > 12:
            month, year = 1, year + 1
        cuota = h / 6.0
        p50 = score + (h6 - score) * cuota
        ancho = (h6 - low) * (cuota ** 0.5)
        puntos.append({
            "month": f"{year:04d}-{month:02d}",
            "p10": max(0.0, p50 - ancho),
            "p50": p50,
            "p90": min(100.0, p50 + (high - h6) * (cuota ** 0.5)),
        })
    return {
        "origin": CUTOFF_DATE,
        "horizon_months": 6,
        "currency": "EUR",
        "basis": "mock",
        "points": puntos,
    }


def group_result(group_id, name, timeline, members, member_last, alerts,
                 member_deltas, generated_at) -> dict:
    """`exports/v1/results/GROUP_xxxx.json` (mismo contrato, `kind = "group"`).

    Un grupo no tiene senales propias en el mock (`contributions` vacio): lo que
    mueve su score son las filiales, asi que los `drivers` del mes son las tres
    filiales con mayor `|delta_1m|`.
    """
    ultimo = timeline[-1] if timeline else None
    months = []
    for row in timeline:
        movidas = sorted(
            member_deltas.get(row["month"], []),
            key=lambda kv: (-abs(kv[1]), kv[0]))[:3]
        months.append({
            "month": row["month"],
            "score": row["score"],
            "basis": "mock",
            "coverage": {"months_observed": row["n_companies_scored"], "reason": None},
            "contributions": [],
            "change_vs_prev": {
                "delta": row["delta_1m"],
                "drivers": [{"signal": cid, "delta": d} for cid, d in movidas],
            },
        })
    return {
        "contract_version": CONTRACT_VERSION,
        "entity": {"kind": "group", "id": group_id, "name": name},
        "cutoff_date": CUTOFF_DATE,
        "generated_at": generated_at,
        "model_version": MODEL_VERSION,
        "data_version": DATA_VERSION,
        "data_kind": "mock",
        "status": "available" if timeline else "insufficient_data",
        "score": ultimo["score"] if ultimo else None,
        "months": months,
        "trajectory": {
            "direction": _TRAJECTORY_DIRECTION[ultimo["regime"]] if ultimo else "unknown",
            "months_in_direction": _months_in_direction(timeline) if timeline else None,
            "regime": ultimo["regime"] if ultimo else None,
        },
        "quality": {
            "coverage_ratio": (ultimo["n_companies_scored"] / len(members))
            if ultimo and members else None,
            "reasons": [],
        },
        "alerts": [
            {
                "id": a["alert_id"], "month": a["month_detected"],
                "kind": "deterioration" if a["direction"] == "down" else "improvement",
                "severity": a["severity"], "signal": a["trigger_signal"],
                "message": a["message"],
                "evidence": {"event": a["event"], "company_id": a["company_id"],
                             "month_evident": a["month_evident"],
                             "lead_time_months": a["lead_time_months"]},
            }
            for a in alerts
        ],
        "forecast": None,
        "xray": {
            "band": ultimo["band"] if ultimo else None,
            "outlook": {
                "h6": ultimo["outlook_6m"], "low": ultimo["outlook_low"],
                "high": ultimo["outlook_high"],
            } if ultimo else None,
            "confidence": ultimo["confidence"] if ultimo else None,
            "dispersion": ultimo["dispersion"] if ultimo else None,
            "weakest_company": ultimo["weakest_company"] if ultimo else None,
            "weakest_score": ultimo["weakest_score"] if ultimo else None,
            "strongest_company": ultimo["strongest_company"] if ultimo else None,
            "n_companies": len(members),
            "companies": member_last,
        },
    }


def copy_inventory(inventory: Path, out: Path, company_ids: list[str],
                   group_ids: list[str]) -> dict:
    """Copia el inventario REAL de `app/exports/v1` (no se regenera: §3 del spec).

    `companies/<id>.json` se copian tal cual. `companies.json` y `groups.json`
    se filtran a las entidades seleccionadas cuando se usa `--limit`, para que
    la API sirva un inventario coherente con el resto del mock.
    """
    inventory = Path(inventory)
    copiados = 0
    destino = Path(out) / "companies"
    destino.mkdir(parents=True, exist_ok=True)
    seleccion = set(company_ids)
    for company_id in company_ids:
        origen = inventory / "companies" / f"{company_id}.json"
        if origen.exists():
            shutil.copyfile(origen, destino / f"{company_id}.json")
            copiados += 1

    resumen = {"companies_json": 0, "groups_json": 0, "companies_files": copiados}
    fuente = inventory / "companies.json"
    if fuente.exists():
        datos = [c for c in json.loads(fuente.read_text(encoding="utf-8"))
                 if c.get("company_id") in seleccion]
        write_json(Path(out) / "companies.json", datos)
        resumen["companies_json"] = len(datos)
    fuente = inventory / "groups.json"
    if fuente.exists():
        grupos = set(group_ids)
        datos = [g for g in json.loads(fuente.read_text(encoding="utf-8"))
                 if g.get("group_id") in grupos]
        write_json(Path(out) / "groups.json", datos)
        resumen["groups_json"] = len(datos)
    return resumen
