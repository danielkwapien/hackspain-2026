"""Cache Parquet de las tablas del dataset.

Los CSV comprimidos se reparsean enteros en cada ejecucion, y cada iteracion
de la formula paga ese coste. Parquet es columnar y tipado, asi que una
consulta que toca cuatro columnas de `transactions` no descomprime las doce.

La cache se invalida sola: la huella de los ficheros de origen (nombre, tamano
y fecha de modificacion) se guarda junto al Parquet, y si cambia se regenera.
Vive fuera del repositorio y se puede borrar sin perder nada.
"""

from __future__ import annotations

import json
from pathlib import Path

from .catalog import TABLES, Table

CACHE_DIRNAME = ".cache"


def fingerprint(files: list[Path]) -> list[dict[str, object]]:
    """Identidad de los ficheros de origen, para saber si la cache sirve."""
    return [
        {"name": path.name, "size": path.stat().st_size, "mtime": int(path.stat().st_mtime)}
        for path in sorted(files)
    ]


class ParquetCache:
    """Materializa cada tabla una vez y la reutiliza mientras el origen no cambie."""

    def __init__(self, store, directory: str | Path | None = None) -> None:
        self.store = store
        self.dir = Path(directory) if directory else Path(__file__).resolve().parents[1] / CACHE_DIRNAME
        self.dir.mkdir(parents=True, exist_ok=True)

    def _paths(self, name: str) -> tuple[Path, Path]:
        return self.dir / f"{name}.parquet", self.dir / f"{name}.json"

    def is_fresh(self, name: str) -> bool:
        parquet, meta = self._paths(name)
        if not parquet.exists() or not meta.exists():
            return False
        try:
            recorded = json.loads(meta.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return False
        current = fingerprint(self.store.files_for(TABLES[name]))
        return recorded.get("source") == current and recorded.get("root") == str(self.store.root)

    def materialise(self, name: str, force: bool = False) -> Path:
        """Escribe la tabla a Parquet si hace falta y devuelve su ruta."""
        parquet, meta = self._paths(name)
        table: Table = TABLES[name]
        files = self.store.files_for(table)
        if not files:
            raise FileNotFoundError(f"No hay ficheros para `{name}` en {self.store.root}")
        if not force and self.is_fresh(name):
            return parquet
        view = self.store.register(name)
        tmp = parquet.with_suffix(".parquet.tmp")
        self.store.con.execute(
            f"COPY (SELECT * FROM {view}) TO '{tmp}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        tmp.replace(parquet)  # atomico: nunca queda un Parquet a medias
        meta.write_text(json.dumps(
            {"table": name, "root": str(self.store.root), "source": fingerprint(files)},
            indent=2) + "\n", encoding="utf-8")
        return parquet

    def register(self, name: str, force: bool = False) -> str:
        """Sustituye la vista sobre CSV por una vista sobre el Parquet."""
        parquet = self.materialise(name, force=force)
        self.store.con.execute(
            f"CREATE OR REPLACE VIEW {name} AS SELECT * FROM read_parquet('{parquet}')")
        self.store._registered.add(name)
        return name

    def warm(self, names: list[str] | None = None, force: bool = False) -> dict[str, Path]:
        """Materializa varias tablas de golpe."""
        targets = names or [n for n in TABLES if self.store.files_for(TABLES[n])]
        return {name: self.materialise(name, force=force) for name in targets}

    def clear(self) -> int:
        removed = 0
        for path in list(self.dir.glob("*.parquet")) + list(self.dir.glob("*.json")):
            path.unlink()
            removed += 1
        return removed
