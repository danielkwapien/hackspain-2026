"""Enriquecimiento en lote de la publicacion XR-033, sin re-ejecutar el scoring.

Toma el JSON que ya produjo `core/pipeline_embat.py` y le añade, por entidad y
mes, tres campos calculados en batch con las definiciones ya documentadas del
reto (no con formulas nuevas del motor):

- `value_fmt`: el valor de cada señal en unidades reales (`27 dias`, `12,3 %`),
  formateado con `publication_rows.SIGNAL_FORMATS`.
- `op_in_12m` / `op_in_12m_currency` / `op_in_12m_eur`: suma movil de los doce
  meses publicados de los cobros operativos, con la taxonomia de categorias de
  ENGINE §3.4 (`OP_IN_CATEGORIES`) y, para la conversion a EUR, la
  tabla constante de §3.3 (`FX_TO_EUR`, unidades por EUR; divisa sin tabla =
  paridad). `op_in_12m` va en la moneda de la entidad —el grano grupo no tiene
  una sola, asi que alli viaja nulo— y `op_in_12m_eur` es la cifra consolidada.
  Las transferencias espejo intragrupo no se restan aqui: la categoria
  `transfer` no es cobro operativo (§3.4), asi que nunca entra en la suma y no
  hay doble conteo que netear.
- `strength_flags`: etiquetas de fortaleza explicitas de ENGINE §4.6, solo las
  condiciones (a) y (b) y (c) que el motor publica. (d) y (e) dependen de
  señales que el motor aun no calcula y no se emiten.

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

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))

from publication_rows import format_signal_value  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "core" / "outputs" / "scores_embat.json"
DEFAULT_OUTPUT = ROOT / "core" / "outputs" / "scores_embat_enriched.json"

START_MONTH = "2024-09-01"
END_MONTH = "2026-09-01"
WINDOW_MONTHS = 12
PATTERN = str(ROOT / "datasets" / "transactions_*.csv.gz")
COMPANIES = str(ROOT / "datasets" / "companies.csv")

# ENGINE §3.4: taxonomia fija de cobros operativos.
OP_IN_CATEGORIES = (
    "collection",
    "bulk_collection",
    "pos_settlement",
    "cash_settlement",
    "cash_settlements",
    "payment_refund",
    "tax_refund",
)

# ENGINE §3.3: tabla FX constante, unidades de divisa por EUR. Nunca se usa el
# `exchange_rate` fila a fila; una divisa sin tabla asume paridad.
FX_TO_EUR = {
    "EUR": 1.0,
    "USD": 1.16,
    "GBP": 0.84,
    "MXN": 20.8,
    "CLP": 1048.0,
    "COP": 4272.0,
}
FX_FALLBACK = 1.0


def fx_case() -> str:
    """Tipo de cambio por divisa como CASE de SQL (la tabla es nuestra y constante)."""
    branches = " ".join(f"WHEN '{code}' THEN {rate}" for code, rate in FX_TO_EUR.items())
    return f"CASE currency {branches} ELSE {FX_FALLBACK} END"


def monthly_income(entity_kind: str) -> duckdb.DuckDBPyConnection:
    """Cobros operativos por entidad y mes, en su divisa y en EUR."""
    connection = duckdb.connect()
    entity = "c.group_id" if entity_kind == "group" else "c.company_id"
    categories = ", ".join(f"'{category}'" for category in OP_IN_CATEGORIES)
    connection.execute(f"""
        CREATE TABLE flow AS
        SELECT {entity} AS entity_id,
               strftime(date_trunc('month', t.date), '%Y-%m') AS month,
               round(sum(t.amount), 2) AS op_in,
               round(sum(t.amount / ({fx_case()})), 2) AS op_in_eur,
               mode(c.currency) AS currency
        FROM read_csv('{PATTERN}', header = true, auto_detect = true) t
        JOIN read_csv('{COMPANIES}', header = true) c USING (company_id)
        WHERE t.date >= DATE '{START_MONTH}' AND t.date < DATE '{END_MONTH}'
          AND coalesce(nullif(t.category, '-'), 'uncategorised') IN ({categories})
        GROUP BY 1, 2
    """)
    return connection


def flows_index(entity_kind: str) -> dict[str, dict]:
    """`{entidad: {"op_in": {mes: importe}, "op_in_eur": {...}, "currency": ...}}`."""
    connection = monthly_income(entity_kind)
    try:
        rows = connection.sql("SELECT * FROM flow").fetchall()
    finally:
        connection.close()
    index: dict[str, dict] = {}
    for entity_id, month, op_in, op_in_eur, currency in rows:
        entry = index.setdefault(str(entity_id), {"op_in": {}, "op_in_eur": {}, "currency": currency})
        entry["op_in"][str(month)] = float(op_in)
        entry["op_in_eur"][str(month)] = float(op_in_eur)
    return index


def signal_values(month: dict) -> dict[str, float | None]:
    return {signal["signal_id"]: signal["value"] for signal in month["raw_signals"]}


def strength_flags(months: list[dict], index: int) -> list[str]:
    """Etiquetas de fortaleza de ENGINE §4.6 computables con lo publicado.

    (a) `GROWTH_NO_DSO`: crecimiento de cobros (`op_in_growth`) positivo con la
        mora de clientes (`ar_overdue_ratio`) plana o bajando frente a tres meses
        antes — es la lectura publicada de «C2 plano o bajando» (§4.6a).
    (b) `PAYS_ON_TIME`: `ap_pct_paid_late` ≤ 0,10 los últimos seis meses.
    (c) `BUFFER_LOW_UTIL`: `buffer_days` ≥ 60 con `loc_utilisation` ≤ 0,30.
    (d) `DELEVERAGING` y (e) `SAVINGS` no se emiten: dependen de señales (D2, D6,
        L5) que el motor todavía no calcula.
    """
    current = signal_values(months[index])
    flags: list[str] = []
    if index >= 3:
        overdue = current.get("ar_overdue_ratio")
        previous = signal_values(months[index - 3]).get("ar_overdue_ratio")
        growth = current.get("op_in_growth")
        if growth is not None and growth > 0 and (overdue is None or previous is None or overdue <= previous):
            flags.append("GROWTH_NO_DSO")
    if index >= 5:
        series = [signal_values(months[position]).get("ap_pct_paid_late") for position in range(index - 5, index + 1)]
        if all(value is not None and value <= 0.10 for value in series):
            flags.append("PAYS_ON_TIME")
    buffer_days = current.get("buffer_days")
    utilisation = current.get("loc_utilisation")
    if buffer_days is not None and buffer_days >= 60.0 and utilisation is not None and utilisation <= 0.30:
        flags.append("BUFFER_LOW_UTIL")
    return flags


def enrich_entity(entity: dict, flows: dict[str, dict], by_currency: bool) -> None:
    """Añade los campos del lote a los meses de una entidad (in situ)."""
    entity_id = entity["entity"]["id"]
    entry = flows.get(entity_id)
    own: deque[float] = deque(maxlen=WINDOW_MONTHS)
    eur: deque[float] = deque(maxlen=WINDOW_MONTHS)
    months = entity["months"]
    for index, month in enumerate(months):
        for signal in month["raw_signals"]:
            signal["value_fmt"] = format_signal_value(signal["signal_id"], signal["value"])
        if entry is None:
            month["op_in_12m"] = None
            month["op_in_12m_currency"] = None
            month["op_in_12m_eur"] = None
        else:
            own.append(float(entry["op_in"].get(month["month"], 0.0)))
            eur.append(float(entry["op_in_eur"].get(month["month"], 0.0)))
            # El grano grupo mezcla divisas: solo publica la cifra consolidada en EUR.
            month["op_in_12m"] = round(sum(own), 2) if by_currency else None
            month["op_in_12m_currency"] = entry["currency"] if by_currency else None
            month["op_in_12m_eur"] = round(sum(eur), 2)
        month["strength_flags"] = strength_flags(months, index)


def enrich_payload(payload: dict) -> dict:
    group_flows = flows_index("group")
    company_flows = flows_index("company")
    for entity in payload["groups"]:
        enrich_entity(entity, group_flows, by_currency=False)
    for entity in payload["companies"]:
        enrich_entity(entity, company_flows, by_currency=True)
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
    print(json.dumps({"input": str(args.input), "output": str(args.output),
                      "groups": len(payload["groups"]), "companies": len(payload["companies"])},
                     sort_keys=True))


if __name__ == "__main__":
    main()
