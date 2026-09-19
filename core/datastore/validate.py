"""Comprobaciones de integridad sobre el dataset cargado.

Se ejecutan antes de puntuar nada. La idea no es rechazar datos imperfectos
-el dataset del reto tiene fechas imposibles y columnas vacias a proposito-
sino distinguir lo que YA SABEMOS que trae de lo que seria una sorpresa.

Una sorpresa en el test oculto (una columna que falta, claves que no cruzan,
un fichero vacio) tiene que parar el pipeline con un mensaje claro, no
convertirse en un score equivocado.
"""

from __future__ import annotations

from dataclasses import dataclass

from .catalog import TABLES


@dataclass(frozen=True)
class Finding:
    level: str          # "error" detiene el pipeline; "warning" se informa
    table: str
    message: str

    def __str__(self) -> str:
        mark = "ERROR  " if self.level == "error" else "aviso  "
        return f"{mark} {self.table:22s} {self.message}"


def check_presence(store) -> list[Finding]:
    findings = []
    for name, table in TABLES.items():
        if not store.files_for(table):
            level = "error" if table.required else "warning"
            findings.append(Finding(level, name, f"no hay fichero que case con {table.pattern!r}"))
    return findings


def check_columns(store) -> list[Finding]:
    findings = []
    for name, table in TABLES.items():
        if not store.files_for(table):
            continue
        present = {row[0] for row in store.con.sql(f"DESCRIBE {store.register(name)}").fetchall()}
        missing = set(table.columns) - present
        if missing:
            findings.append(Finding("error", name, f"faltan columnas: {sorted(missing)}"))
    return findings


def check_not_empty(store) -> list[Finding]:
    findings = []
    for name, table in TABLES.items():
        if not store.files_for(table):
            continue
        if store.count(name) == 0:
            findings.append(Finding("error", name, "el fichero no tiene filas"))
    return findings


def check_primary_keys(store) -> list[Finding]:
    findings = []
    for name, table in TABLES.items():
        if not table.primary_key or not store.files_for(table):
            continue
        key = ", ".join(table.primary_key)
        total, distinct = store.con.sql(
            f"SELECT count(*), count(DISTINCT ({key})) FROM {store.register(name)}").fetchone()
        if total != distinct:
            findings.append(Finding("error", name,
                                    f"clave {table.primary_key} duplicada: {total} filas, {distinct} valores"))
    return findings


def check_foreign_keys(store) -> list[Finding]:
    """Las claves tienen que cruzar: un movimiento sin empresa no se puede puntuar."""
    findings = []
    relations = [
        ("companies", "group_id", "groups", "group_id"),
        ("banking_products", "company_id", "companies", "company_id"),
        ("debt_products", "company_id", "companies", "company_id"),
        ("balances", "company_id", "companies", "company_id"),
        ("transactions", "company_id", "companies", "company_id"),
        ("invoices", "company_id", "companies", "company_id"),
    ]
    for child, column, parent, target in relations:
        if not (store.files_for(TABLES[child]) and store.files_for(TABLES[parent])):
            continue
        orphans = store.con.sql(
            f"SELECT count(*) FROM {store.register(child)} c "
            f"WHERE c.{column} IS NOT NULL AND NOT EXISTS ("
            f"  SELECT 1 FROM {store.register(parent)} p WHERE p.{target} = c.{column})").fetchone()[0]
        if orphans:
            findings.append(Finding("error", child,
                                    f"{orphans} filas con {column} que no existe en {parent}"))
    return findings


def check_known_quirks(store) -> list[Finding]:
    """Rarezas conocidas del dataset. Se informan para que nadie las redescubra."""
    findings = []
    if store.files_for(TABLES["balances"]):
        empty = [column for column in ("available", "granted", "liquidity", "countable")
                 if store.con.sql(
                     f"SELECT count({column}) FROM {store.register('balances')}").fetchone()[0] == 0]
        if empty:
            findings.append(Finding("warning", "balances",
                                    f"columnas enteramente vacias: {empty} (esperado)"))
    if store.files_for(TABLES["invoices"]):
        bad = store.con.sql(
            f"SELECT count(*) FROM {store.register('invoices')} "
            f"WHERE due_date < DATE '2024-01-01' OR due_date > DATE '2028-01-01'").fetchone()[0]
        if bad:
            findings.append(Finding("warning", "invoices",
                                    f"{bad} filas con due_date fuera de rango plausible (esperado)"))
        unpaid_with_date = store.con.sql(
            f"SELECT count(*) FROM {store.register('invoices')} "
            f"WHERE status <> 'paid' AND payment_date IS NOT NULL").fetchone()[0]
        if unpaid_with_date:
            findings.append(Finding("warning", "invoices",
                                    f"{unpaid_with_date} facturas no pagadas traen payment_date "
                                    f"(usar solo con status='paid')"))
    if store.files_for(TABLES["transactions"]):
        uncategorised = store.con.sql(
            f"SELECT count(*) FROM {store.register('transactions')} "
            f"WHERE category IS NULL OR category = '-'").fetchone()[0]
        total = store.count("transactions")
        if uncategorised:
            findings.append(Finding("warning", "transactions",
                                    f"{100 * uncategorised / total:.1f}% sin categoria "
                                    f"(usar denominador explicito)"))
    return findings


CHECKS = (check_presence, check_columns, check_not_empty, check_primary_keys,
          check_foreign_keys, check_known_quirks)


def validate(store, strict: bool = True) -> list[Finding]:
    """Ejecuta todas las comprobaciones. Con strict, un error levanta excepcion."""
    findings: list[Finding] = []
    for check in CHECKS:
        findings.extend(check(store))
        if check is check_presence and any(f.level == "error" for f in findings):
            break  # sin ficheros no tiene sentido seguir comprobando
    errors = [f for f in findings if f.level == "error"]
    if strict and errors:
        detail = "\n".join(str(f) for f in errors)
        raise ValueError(f"El dataset de {store.root} no es utilizable:\n{detail}")
    return findings
