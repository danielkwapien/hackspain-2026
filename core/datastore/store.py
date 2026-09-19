"""Acceso unico al dataset, con raiz configurable.

El test oculto se entrega en el mismo formato y con menos grupos, pero no
necesariamente en `datasets/`. Que la ruta sea un parametro y no una constante
es lo que hace que el pipeline se pueda ejecutar sobre los datos de la
organizacion sin tocar codigo:

    EMBAT_DATA_ROOT=/ruta/al/test .venv/bin/python core/pipeline_embat.py
    .venv/bin/python core/pipeline_embat.py --data-root /ruta/al/test
"""

from __future__ import annotations

import os
from pathlib import Path

import duckdb

from .catalog import TABLES, Table

# Opciones de parseo fijadas a proposito en vez de dejarlas autodetectar.
# `description` y `concept` llevan comillas dobladas dentro del campo
# ("Cuenta real ""formacion 649.1"" 90") y saltos de linea. Con autodeteccion,
# DuckDB elige el escape segun la muestra que le toque y el mismo fichero
# puede leerse bien o romper segun que columnas se pidan.
READ_OPTIONS = "header=true, quote='\"', escape='\"', union_by_name=true"

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROOT = REPO_ROOT / "datasets"
ENV_VAR = "EMBAT_DATA_ROOT"


class DatasetError(RuntimeError):
    """El dataset no esta donde se espera o no tiene la forma esperada."""


def resolve_root(explicit: str | Path | None = None) -> Path:
    """Explicito > variable de entorno > `datasets/` del repositorio."""
    for candidate in (explicit, os.environ.get(ENV_VAR), DEFAULT_ROOT):
        if candidate:
            return Path(candidate).expanduser().resolve()
    return DEFAULT_ROOT


class DataStore:
    """Registra cada tabla del catalogo como vista DuckDB sobre la raiz dada."""

    def __init__(self, root: str | Path | None = None,
                 connection: duckdb.DuckDBPyConnection | None = None) -> None:
        self.root = resolve_root(root)
        if not self.root.is_dir():
            raise DatasetError(
                f"No existe el directorio de datos: {self.root}\n"
                f"Indica otro con --data-root o con {ENV_VAR}=<ruta>.")
        self.con = connection or duckdb.connect()
        self._registered: set[str] = set()

    # ------------------------------------------------------------- ficheros
    def files_for(self, table: Table) -> list[Path]:
        found = sorted(self.root.glob(table.pattern))
        # invoices.csv* tambien casaria con invoices.csv.gz y con el .csv en claro;
        # si estan los dos, el comprimido es el que esta en el repositorio.
        if len(found) > 1 and not table.multi_file:
            found = found[:1]
        return found

    def missing_tables(self) -> list[str]:
        return [name for name, table in TABLES.items()
                if table.required and not self.files_for(table)]

    def describe(self) -> str:
        lines = [f"raiz: {self.root}"]
        for name, table in TABLES.items():
            files = self.files_for(table)
            detail = ", ".join(f.name for f in files) if files else "AUSENTE"
            lines.append(f"  {name:22s} {detail}")
        return "\n".join(lines)

    # -------------------------------------------------------------- lectura
    @staticmethod
    def _sql_literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    def _source_literal(self, files: list[Path]) -> str:
        paths = [self._sql_literal(str(path)) for path in files]
        return paths[0] if len(paths) == 1 else "[" + ", ".join(paths) + "]"

    def register(self, name: str) -> str:
        """Deja `name` disponible como vista en la conexion y devuelve el nombre."""
        if name in self._registered:
            return name
        table = TABLES[name]
        files = self.files_for(table)
        if not files:
            raise DatasetError(f"No hay ficheros para `{name}` en {self.root} "
                               f"(patron {table.pattern!r}).")
        columns = ", ".join(f"'{col}': '{kind}'" for col, kind in table.columns.items())
        self.con.execute(
            f"CREATE OR REPLACE VIEW {name} AS SELECT * FROM read_csv("
            f"{self._source_literal(files)}, {READ_OPTIONS}, "
            f"columns={{{columns}}})")
        self._registered.add(name)
        return name

    def register_all(self) -> duckdb.DuckDBPyConnection:
        for name in TABLES:
            if self.files_for(TABLES[name]):
                self.register(name)
        return self.con

    def table(self, name: str) -> duckdb.DuckDBPyRelation:
        return self.con.sql(f"SELECT * FROM {self.register(name)}")

    def count(self, name: str) -> int:
        return int(self.con.sql(f"SELECT count(*) FROM {self.register(name)}").fetchone()[0])
