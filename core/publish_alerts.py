"""Publica la bandeja de alertas con las cuatro causas nuevas (XR-037, I2).

    .venv/bin/python core/publish_alerts.py --database md:hackspain_2026
    .venv/bin/python core/publish_alerts.py --database /tmp/local.duckdb

Lee lo que el motor ya dejo publicado (`company_scores`, `group_scores`,
`company_counterparty_summary` y las alertas actuales) y deja DOS tablas nuevas:
`company_alerts_v2` y `group_alerts_v2`, con el mismo DDL que `ALERT_COLUMNS`.

No toca `company_alerts` ni `group_alerts`, ni ninguna de las diez tablas del
reto, ni ninguna de las trece que publica `core/publish.py`. Republicar con
`core/publish.py` para meter alertas reescribiria scores, senales, drivers,
catalogo y exports enteros; escribir al lado cuesta dos tablas y no arriesga
nada. La API apunta a las tablas nuevas cambiando una constante, y si algo sale
mal se vuelve a las viejas sin recuperar nada.

Que hay dentro
--------------

Las filas de `buffer_days` se copian TAL CUAL de las tablas originales: son la
unica causa que hay hoy (11.824 de empresa y 2.371 de grupo) y las escribe el
motor, no este script. Encima se anaden cuatro causas calculadas en SQL sobre
columnas ya publicadas:

- `band_drop`: la banda del mes es peor que la del anterior. `urgent` si cae a
  `stress`, `review` si no.
- `cap_applied`: `cap_code` deja de ser nulo. `urgent` por definicion: son los
  dos hechos duros del motor.
- `concentration`: `top1_weight >= 0,40` en un lado del libro de contrapartes.
  Solo empresas y solo el mes de corte, que es el unico que publica XR-036.
- `score_drop`: `delta_1m <= -8`. Con -5 salen 3.384 filas de empresa y se come
  la bandeja; por eso el script imprime el recuento por causa al publicar, para
  mover el umbral con el dato delante y no a ojo.

Tres decisiones que cambian el resultado
----------------------------------------

1. **`cap_applied` es la TRANSICION, no el mes capado.** Hay 1.491 filas
   empresa-mes con `cap_code`, pero solo 263 en las que el mes anterior estaba
   limpio (196 empresas, que es el numero medido). Una alerta por cada mes que
   sigue capado repetiria la misma noticia hasta doce veces para la misma
   sociedad. El primer mes del historico cuenta como transicion: no sabemos que
   habia antes y el techo esta puesto.

2. **La banda se compara por orden, no por texto.** `stress < watch < healthy <
   solid`. Sin ese orden, `healthy -> solid` (176 filas) pasaria por bajada.

3. **`concentration` exige score del mismo mes.** El JOIN con `company_scores`
   no es decorativo: de ahi salen `score_after`, `direction` y las dos columnas
   NOT NULL de linaje (`params_version`, `source_md5`). Hoy las 856 filas lo
   tienen; una sociedad sin score ese mes no entra en la bandeja, que es donde
   tampoco se podria pintar.

El corte por defecto sale de `engine_exports.cutoff_date`, igual que el de
contrapartes, para que la alerta de concentracion y el score hablen del mismo
mes.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "core"))

from publication_schema import ALERT_COLUMNS, ALERT_DDL  # noqa: E402

SOURCE_TABLES = ("company_alerts", "group_alerts")
TABLES = ("company_alerts_v2", "group_alerts_v2")

# Orden de las bandas, de peor a mejor. Es lo que convierte "cambio de banda" en
# "bajada de banda".
BAND_RANK = {"stress": 1, "watch": 2, "healthy": 3, "solid": 4}

# Como se nombra cada banda en el mensaje, el vocabulario del informe.
BAND_LABEL = {"stress": "Tensión", "watch": "Vigilar", "healthy": "Sana", "solid": "Sólida"}

# Los dos unicos codigos de techo que hay en la base, con su significado.
CAP_MESSAGE = {"CAP_NEGCASH": "Caja negativa persistente",
               "CAP_LOCFULL": "Líneas de crédito agotadas"}
CAP_MESSAGE_FALLBACK = "Techo del motor activado"

# Umbrales de las dos reglas con numero. El de `score_drop` es el que el informe
# pide revisar con el recuento delante.
SCORE_DROP = -8.0
CONCENTRATION = 0.40

# Sufijo del `alert_id`, que sigue el formato {entity_id}:{month}:{slug}.
SLUGS = {"buffer_days": "buffer", "band_drop": "band", "cap_applied": "cap",
         "score_drop": "drop", "concentration": "conc"}


class PublicationError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class Summary:
    month: str
    company_rows: int
    group_rows: int
    by_cause: dict[str, dict[str, int]]
    untouched: dict[str, int]


def _token_from_env_file() -> str | None:
    env_path = ROOT / "app" / "api" / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() in {"MOTHERDUCK_TOKEN", "motherduck_token"}:
            return value.strip().strip("\"'")
    return None


def connect(database: str) -> duckdb.DuckDBPyConnection:
    if not database.startswith("md:"):
        return duckdb.connect(database)
    token = os.environ.get("MOTHERDUCK_TOKEN") or os.environ.get("motherduck_token")
    token = token or _token_from_env_file()
    if token is None:
        raise PublicationError("MOTHERDUCK_TOKEN is required for cloud publication")
    return duckdb.connect(database, config={"motherduck_token": token})


def resolve_month(connection: duckdb.DuckDBPyConnection, explicit: str | None) -> str:
    """El mes de corte del motor: el unico que tiene contrapartes publicadas."""
    if explicit is not None:
        return explicit[:7]
    try:
        row = connection.sql("SELECT cutoff_date::VARCHAR FROM engine_exports LIMIT 1").fetchone()
    except duckdb.Error as error:
        raise PublicationError(
            "engine_exports is not readable and no --cutoff was given"
        ) from error
    if row is None or row[0] is None:
        raise PublicationError("engine_exports is empty and no --cutoff was given")
    return str(row[0])[:7]


def _case(column: str, mapping: dict[str, object], default: str = "NULL") -> str:
    arms = " ".join(
        f"WHEN '{key}' THEN " + (f"'{value}'" if isinstance(value, str) else str(value))
        for key, value in mapping.items()
    )
    return f"CASE {column} {arms} ELSE {default} END"


def _scored(kind: str) -> str:
    """Cada mes con el anterior al lado: es lo unico que las tres reglas piden.

    La entidad es `company_id` en empresas y `group_id` en grupos; las dos tablas
    traen las dos columnas, con la que no aplica a nulo.
    """
    return f"""
      SELECT entity_kind, group_id, company_id,
             coalesce(company_id, group_id) AS entity_id,
             month, band, cap_code, score, delta_1m, direction,
             params_version, source_md5,
             lag(band) OVER w AS prev_band,
             lag(cap_code) OVER w AS prev_cap,
             lag(score) OVER w AS prev_score
      FROM {kind}_scores
      WINDOW w AS (PARTITION BY coalesce(company_id, group_id) ORDER BY month)
    """


def band_drop_sql(kind: str) -> str:
    rank = _case("band", BAND_RANK)
    prev_rank = _case("prev_band", BAND_RANK)
    label = _case("band", BAND_LABEL, default="band")
    prev_label = _case("prev_band", BAND_LABEL, default="prev_band")
    return f"""
    WITH s AS ({_scored(kind)})
    SELECT entity_id || ':' || month || ':{SLUGS["band_drop"]}',
           entity_kind, group_id, company_id, month,
           CASE WHEN band = 'stress' THEN 'urgent' ELSE 'review' END,
           'band_drop', direction, prev_score, score, NULL,
           'Baja de ' || {prev_label} || ' a ' || {label},
           to_json({{'cause': 'band_drop', 'from': prev_band, 'to': band,
                     'score_before': prev_score, 'score_after': score}}),
           params_version, source_md5, now()
    FROM s
    WHERE band IS NOT NULL AND prev_band IS NOT NULL AND {rank} < {prev_rank}
    """


def cap_applied_sql(kind: str) -> str:
    message = _case("cap_code", CAP_MESSAGE, default=f"'{CAP_MESSAGE_FALLBACK}'")
    return f"""
    WITH s AS ({_scored(kind)})
    SELECT entity_id || ':' || month || ':{SLUGS["cap_applied"]}',
           entity_kind, group_id, company_id, month,
           'urgent', 'cap_applied', direction, prev_score, score, cap_code,
           {message},
           to_json({{'cause': 'cap_applied', 'cap_code': cap_code,
                     'score_before': prev_score, 'score_after': score}}),
           params_version, source_md5, now()
    FROM s
    WHERE cap_code IS NOT NULL AND prev_cap IS NULL
    """


def score_drop_sql(kind: str) -> str:
    return f"""
    WITH s AS ({_scored(kind)})
    SELECT entity_id || ':' || month || ':{SLUGS["score_drop"]}',
           entity_kind, group_id, company_id, month,
           'review', 'score_drop', direction, prev_score, score, NULL,
           'El score cae ' || replace(printf('%.1f', abs(delta_1m)), '.', ',')
             || ' puntos en un mes',
           to_json({{'cause': 'score_drop', 'delta_1m': delta_1m,
                     'threshold': {SCORE_DROP}, 'score_after': score}}),
           params_version, source_md5, now()
    FROM s
    WHERE delta_1m <= {SCORE_DROP}
    """


def concentration_sql(month: str) -> str:
    """Solo empresas: el resumen de contrapartes no agrega por grupo.

    Un mismo mes puede traer las dos caras del libro, cobros y pagos, y son dos
    riesgos distintos: el `alert_id` lleva el lado para que no se pisen.
    """
    side = ("CASE s.side WHEN 'ar' THEN 'cobros depende de un solo cliente'"
            " ELSE 'pagos depende de un solo proveedor' END")
    return f"""
    SELECT s.company_id || ':' || s.month || ':{SLUGS["concentration"]}_' || s.side,
           'company', s.group_id, s.company_id, s.month,
           'review', 'concentration', c.direction, NULL, c.score, NULL,
           'El ' || printf('%.0f', s.top1_weight * 100) || ' % de los ' || {side},
           to_json({{'cause': 'concentration', 'side': s.side,
                     'top1_weight': s.top1_weight, 'threshold': {CONCENTRATION},
                     'n_counterparties': s.n_counterparties}}),
           c.params_version, c.source_md5, now()
    FROM company_counterparty_summary s
    JOIN company_scores c ON c.company_id = s.company_id AND c.month = s.month
    WHERE s.top1_weight >= {CONCENTRATION} AND s.month = '{month}'
    """


def copy_sql(kind: str) -> str:
    """Las alertas del motor entran sin tocarlas: son suyas, no de este script."""
    return f"SELECT {', '.join(ALERT_COLUMNS)} FROM {kind}_alerts"


def alerts_sql(kind: str, month: str) -> str:
    parts = [copy_sql(kind), band_drop_sql(kind), cap_applied_sql(kind), score_drop_sql(kind)]
    if kind == "company":
        parts.append(concentration_sql(month))
    return "\nUNION ALL\n".join(f"SELECT * FROM ({part})" for part in parts)


def _counts(connection: duckdb.DuckDBPyConnection, tables: tuple[str, ...]) -> dict[str, int]:
    return {table: connection.sql(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in tables}


def publish(connection: duckdb.DuckDBPyConnection, month: str) -> Summary:
    """Reemplaza las dos tablas en una transaccion: o entran las dos o ninguna."""
    before = _counts(connection, SOURCE_TABLES)
    connection.execute("BEGIN TRANSACTION")
    try:
        for kind, table in (("company", "company_alerts_v2"), ("group", "group_alerts_v2")):
            connection.execute(f"CREATE OR REPLACE TABLE {table} ({ALERT_DDL})")
            connection.execute(f"INSERT INTO {table} {alerts_sql(kind, month)}")
        connection.execute("COMMIT")
    except duckdb.Error:
        connection.execute("ROLLBACK")
        raise
    return verify(connection, month, before)


def verify(connection: duckdb.DuckDBPyConnection, month: str,
           before: dict[str, int]) -> Summary:
    """Relectura independiente, con las dos invariantes que sostienen la tabla.

    La primera es que las originales siguen donde estaban: este script escribe
    al lado, y si alguna vez deja de hacerlo hay que enterarse aqui y no por la
    pantalla. La segunda es que no hay dos alertas con el mismo `alert_id`: la
    API las sirve por clave y una repetida saldria dos veces en la bandeja.
    """
    after = _counts(connection, SOURCE_TABLES)
    if after != before:
        raise PublicationError(f"source alert tables changed: {before} -> {after}")
    by_cause: dict[str, dict[str, int]] = {}
    for table in TABLES:
        rows = connection.sql(
            f"SELECT cause, count(*) FROM {table} GROUP BY 1 ORDER BY 1").fetchall()
        by_cause[table] = {str(cause): int(count) for cause, count in rows}
        duplicates = connection.sql(
            f"SELECT count(*) FROM (SELECT alert_id FROM {table}"
            " GROUP BY 1 HAVING count(*) > 1)").fetchone()[0]
        if duplicates:
            raise PublicationError(f"{duplicates} repeated alert_id in {table}")
    totals = _counts(connection, TABLES)
    return Summary(month, totals["company_alerts_v2"], totals["group_alerts_v2"],
                   by_cause, after)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish XR-037 alert tables.")
    parser.add_argument("--database", required=True)
    parser.add_argument("--cutoff", default=None,
                        help="YYYY-MM-DD. Por defecto, el corte de engine_exports.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    with connect(args.database) as connection:
        month = resolve_month(connection, args.cutoff)
        summary = publish(connection, month)
        print(json.dumps(asdict(summary), sort_keys=True, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
