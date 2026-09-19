"""Enriquecimiento en lote de la publicacion XR-033, sin re-ejecutar el scoring.

Toma el JSON que ya produjo `core/pipeline_embat.py` y le añade, por entidad y
mes, tres campos calculados en batch con las mismas fuentes y reglas que el
motor ya usa:

- `value_fmt`: el valor de cada señal en unidades reales (`27 dias`, `12,3 %`),
  formateado con la definicion de `publication_rows.SIGNAL_FORMATS`.
- `op_in_12m` + `op_in_12m_currency`: suma movil de los ultimos 12 meses
  publicados de los cobros operativos (`op_in`) que el propio pipeline calcula
  por entidad y mes con ventana as-of, excluyendo las transferencias espejo
  intragrupo (neteo intercompany solo en el grano de grupo, igual que
  `build_base`). Un mes sin movimientos dentro de la ventana suma 0 real; solo
  una entidad sin ningun flujo observado queda en nulo.
- `strength_flags`: etiquetas observables y documentadas
  (`publication_rows.STRENGTH_FLAGS`), nunca un juicio inventado.

Nada cambia el score, las penalizaciones ni los parametros: el JSON enriquecido
es la misma publicacion con campos aditivos, y su MD5 cambia de forma trazable.

Uso:
    .venv/bin/python core/enrich.py \
        --input core/outputs/scores_embat.json \
        --output core/outputs/scores_embat_enriched.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline_embat import build_base, connect, monthly_flows  # noqa: E402
from publication_rows import SIGNAL_FORMATS, STRENGTH_FLAGS, format_signal_value  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "core" / "outputs" / "scores_embat.json"
DEFAULT_OUTPUT = ROOT / "core" / "outputs" / "scores_embat_enriched.json"

WINDOW_MONTHS = 12


def entity_flows(entity_kind: str) -> pd.DataFrame:
    """`op_in` mensual por entidad del grano pedido, con la moneda dominante."""
    connection = connect()
    try:
        build_base(connection, entity_kind)  # type: ignore[arg-type]
        flows = monthly_flows(connection)
        currency = connection.sql("""
            SELECT cmap.group_id, mode(companies.currency) AS entity_currency
            FROM cmap JOIN companies USING (company_id) GROUP BY 1
        """).df()
    finally:
        connection.close()
    flows["m"] = pd.to_datetime(flows["m"]).dt.strftime("%Y-%m")
    return flows.merge(currency, on="group_id", how="left")


def flows_index(entity_kind: str) -> dict[str, dict]:
    """`{entidad: {"op_in": {mes: importe}, "currency": ...}}`, sin imputar meses."""
    frame = entity_flows(entity_kind)
    index: dict[str, dict] = {}
    for row in frame.itertuples(index=False):
        currency = None if pd.isna(row.entity_currency) else str(row.entity_currency)
        entry = index.setdefault(str(row.group_id), {"op_in": {}, "currency": currency})
        entry["op_in"][str(row.m)] = float(row.op_in)
    return index


def signal_values(month: dict) -> dict[str, float | None]:
    return {signal["signal_id"]: signal["value"] for signal in month["raw_signals"]}


def strength_flags(month: dict) -> list[str]:
    """Etiquetas observables del mes, en el orden declarado en el contrato."""
    values = signal_values(month)
    values["coverage"] = month["coverage"]
    values["months_hist"] = month["months_hist"]
    flags: list[str] = []
    for flag, field, threshold, rule in STRENGTH_FLAGS:
        value = values.get(field)
        if rule == "not_null":
            if month["cap_code"] is not None:
                flags.append(flag)
        elif value is None:
            continue
        elif rule == "lt" and float(value) < float(threshold):
            flags.append(flag)
        elif rule == "ge" and float(value) >= float(threshold):
            flags.append(flag)
    return flags


def enrich_entity(entity: dict, flows: dict[str, dict]) -> None:
    entity_id = entity["entity"]["id"]
    entry = flows.get(entity_id)
    window: deque[float] = deque(maxlen=WINDOW_MONTHS)
    for month in entity["months"]:
        for signal in month["raw_signals"]:
            signal["value_fmt"] = format_signal_value(signal["signal_id"], signal["value"])
        if entry is None:
            month["op_in_12m"] = None
            month["op_in_12m_currency"] = None
        else:
            window.append(float(entry["op_in"].get(month["month"], 0.0)))
            month["op_in_12m"] = round(sum(window), 2)
            month["op_in_12m_currency"] = entry["currency"]
        month["strength_flags"] = strength_flags(month)


def enrich_payload(payload: dict) -> dict:
    group_flows = flows_index("group")
    company_flows = flows_index("company")
    for entity in payload["groups"]:
        enrich_entity(entity, group_flows)
    for entity in payload["companies"]:
        enrich_entity(entity, company_flows)
    return payload


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enriquecimiento batch de la publicacion XR-033.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    payload = json.loads(args.input.read_text())
    enrich_payload(payload)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    groups = len(payload["groups"])
    companies = len(payload["companies"])
    print(json.dumps({"input": str(args.input), "output": str(args.output),
                      "groups": groups, "companies": companies}, sort_keys=True))


if __name__ == "__main__":
    main()
