"""Capa de acceso a datos: un catalogo declarado y una raiz configurable."""

from .cache import ParquetCache
from .catalog import REQUIRED_TABLES, TABLES, Table
from .store import DEFAULT_ROOT, ENV_VAR, DatasetError, DataStore, resolve_root

__all__ = ["ParquetCache", "TABLES", "Table", "REQUIRED_TABLES", "DataStore", "DatasetError",
           "resolve_root", "DEFAULT_ROOT", "ENV_VAR"]
