"""Publica las tablas de contrapartes (XR-036).

    .venv/bin/python core/publish_counterparties.py --database md:hackspain_2026
    .venv/bin/python core/publish_counterparties.py --database /tmp/local.duckdb

Lee las facturas que ya estan en la base y deja dos tablas derivadas:
`company_counterparties` y `company_counterparty_summary`. No toca ninguna tabla
del reto ni ninguna de las que publica `core/publish.py`.

El corte por defecto es el del motor (`engine_exports.cutoff_date`), para que la
tabla de contrapartes y el score de la ficha hablen del mismo mes. Si esa tabla
no esta, hay que decir el corte a mano: adivinarlo pondria la evidencia y el
numero en meses distintos sin avisar.

Se publica SOLO el mes de corte. Las doce mensualidades viajan dentro de cada
fila en `sparkline_12`, que es lo que la pantalla necesita; materializar los 24
meses multiplicaria por 24 unas 124.000 filas sin que nadie las pidiera.
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

from counterparties import (  # noqa: E402
    COUNTERPARTY_DDL,
    SUMMARY_DDL,
    Window,
    counterparty_sql,
    summary_sql,
)

TABLES = ("company_counterparties", "company_counterparty_summary")


class PublicationError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class Summary:
    month: str
    counterparty_rows: int
    summary_rows: int
    companies: int


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


def resolve_cutoff(connection: duckdb.DuckDBPyConnection, explicit: str | None) -> str:
    """El corte del motor, para que evidencia y score hablen del mismo mes."""
    if explicit is not None:
        return explicit
    try:
        row = connection.sql("SELECT cutoff_date::VARCHAR FROM engine_exports LIMIT 1").fetchone()
    except duckdb.Error as error:
        raise PublicationError(
            "engine_exports is not readable and no --cutoff was given"
        ) from error
    if row is None or row[0] is None:
        raise PublicationError("engine_exports is empty and no --cutoff was given")
    return str(row[0])[:10]


def publish(connection: duckdb.DuckDBPyConnection, window: Window) -> Summary:
    """Reemplaza las dos tablas en una transaccion: o entran las dos o ninguna."""
    connection.execute("BEGIN TRANSACTION")
    try:
        connection.execute(f"CREATE OR REPLACE TABLE company_counterparties ({COUNTERPARTY_DDL})")
        connection.execute(
            f"INSERT INTO company_counterparties {counterparty_sql(window)}"
        )
        connection.execute(
            f"CREATE OR REPLACE TABLE company_counterparty_summary ({SUMMARY_DDL})"
        )
        connection.execute(
            f"INSERT INTO company_counterparty_summary {summary_sql(window)}"
        )
        connection.execute("COMMIT")
    except duckdb.Error:
        connection.execute("ROLLBACK")
        raise
    return verify(connection, window)


def verify(connection: duckdb.DuckDBPyConnection, window: Window) -> Summary:
    """Relectura independiente, con la invariante que sostiene la tabla.

    Si los pesos de un lado no suman 1, la columna de concentracion miente, y es
    justo la columna por la que se ordena. Se comprueba aqui y no solo en los
    tests porque la publicacion real corre sobre datos que los tests no ven.
    """
    rows = connection.sql("SELECT count(*) FROM company_counterparties").fetchone()[0]
    summaries = connection.sql("SELECT count(*) FROM company_counterparty_summary").fetchone()[0]
    companies = connection.sql(
        "SELECT count(DISTINCT company_id) FROM company_counterparties"
    ).fetchone()[0]
    drift = connection.sql("""
        SELECT count(*) FROM (
          SELECT company_id, side, sum(weight) w FROM company_counterparties
          GROUP BY 1, 2 HAVING abs(sum(weight) - 1.0) > 0.001)
    """).fetchone()[0]
    if drift:
        raise PublicationError(f"{drift} company/side groups whose weights do not sum to 1")
    return Summary(window.month, rows, summaries, companies)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish XR-036 counterparty tables.")
    parser.add_argument("--database", required=True)
    parser.add_argument("--cutoff", default=None,
                        help="YYYY-MM-DD. Por defecto, el corte de engine_exports.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    with connect(args.database) as connection:
        window = Window.ending(resolve_cutoff(connection, args.cutoff))
        print(json.dumps(asdict(publish(connection, window)), sort_keys=True))


if __name__ == "__main__":
    main()
