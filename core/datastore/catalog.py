"""Declaracion de las tablas del dataset: ficheros, columnas y tipos.

Un solo sitio donde esta escrito que hay en el dataset. Los tipos se declaran
en vez de dejar que DuckDB los infiera: la inferencia por muestreo se equivoca
en varias columnas de estos ficheros (importes que parecen enteros, fechas
imposibles, campos vacios al principio del fichero), y un tipo mal inferido no
falla, sino que produce numeros equivocados en silencio.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Table:
    """Una tabla del dataset y como se lee."""

    name: str
    pattern: str                      # glob relativo a la raiz de datos
    columns: dict[str, str]           # nombre -> tipo DuckDB
    primary_key: tuple[str, ...] = ()
    required: bool = True             # si falta, el dataset no es utilizable
    multi_file: bool = False          # varios ficheros que se concatenan
    notes: str = ""
    # columnas que pueden venir enteramente vacias sin que sea un error
    nullable_all: tuple[str, ...] = field(default_factory=tuple)

    @property
    def date_columns(self) -> tuple[str, ...]:
        return tuple(name for name, kind in self.columns.items() if kind == "TIMESTAMP")


TABLES: dict[str, Table] = {
    "groups": Table(
        name="groups",
        pattern="groups.csv",
        primary_key=("group_id",),
        columns={
            "group_id": "VARCHAR",
            "erp": "VARCHAR",
            "n_companies_in_sample": "INTEGER",
        },
        notes="Un grupo por fila. Es la unidad que se puntua.",
    ),
    "companies": Table(
        name="companies",
        pattern="companies.csv",
        primary_key=("company_id",),
        columns={
            "company_id": "VARCHAR",
            "group_id": "VARCHAR",
            "country": "VARCHAR",
            "currency": "VARCHAR",
            "erp": "VARCHAR",
            "created_at": "TIMESTAMP",
        },
        notes="company_id cruza todos los demas ficheros. `country` viene vacio en el 82%.",
    ),
    "banking_products": Table(
        name="banking_products",
        pattern="banking_products.csv",
        primary_key=("product_id",),
        columns={
            "product_id": "VARCHAR",
            "company_id": "VARCHAR",
            "label": "VARCHAR",
            "type": "VARCHAR",
            "bank_name": "VARCHAR",
            "service": "VARCHAR",
            "currency": "VARCHAR",
            "created_at": "TIMESTAMP",
        },
        notes="checking, card, investment, wallet, tpv, risk, expensesPlatform, lineofcomex, saving.",
    ),
    "debt_products": Table(
        name="debt_products",
        pattern="debt_products.csv",
        primary_key=("product_id",),
        columns={
            "product_id": "VARCHAR",
            "company_id": "VARCHAR",
            "label": "VARCHAR",
            "type": "VARCHAR",
            "bank_name": "VARCHAR",
            "service": "VARCHAR",
            "currency": "VARCHAR",
            "created_at": "TIMESTAMP",
            "granted": "DOUBLE",
            "outstanding": "DOUBLE",
            "liquidity": "DOUBLE",
        },
        notes="granted y outstanding vienen NEGATIVOS. liquidity solo en parte de las lineas.",
    ),
    "debt_schedule_config": Table(
        name="debt_schedule_config",
        pattern="debt_schedule_config.csv",
        primary_key=("product_id",),
        columns={
            "product_id": "VARCHAR",
            "company_id": "VARCHAR",
            "settlement_product_id": "VARCHAR",
            "currency": "VARCHAR",
            "amortization_type": "VARCHAR",
            "interest_calc_method": "VARCHAR",
            "amortising_frequency": "VARCHAR",
            "granted_balance": "DOUBLE",
            "outstanding_balance": "DOUBLE",
            "total_periods": "INTEGER",
            "next_payment_date": "TIMESTAMP",
            "last_payment_date": "TIMESTAMP",
            "annual_interest_rate_or_spread": "DOUBLE",
            "interest_type": "VARCHAR",
        },
        notes="Solo 87 filas para 2.239 productos de deuda: demasiado fino para un DSCR general.",
    ),
    "balances": Table(
        name="balances",
        pattern="balances.csv",
        primary_key=("product_id",),
        columns={
            "product_id": "VARCHAR",
            "company_id": "VARCHAR",
            "date": "TIMESTAMP",
            "balance": "DOUBLE",
            "available": "DOUBLE",
            "granted": "DOUBLE",
            "liquidity": "DOUBLE",
            "countable": "DOUBLE",
        },
        nullable_all=("available", "granted", "liquidity", "countable"),
        notes="Foto a 2026-09-01. Solo `balance` viene informado; el resto esta vacio.",
    ),
    "invoices": Table(
        name="invoices",
        pattern="invoices.csv*",
        multi_file=True,
        primary_key=("operation_id",),
        columns={
            "operation_id": "VARCHAR",
            "company_id": "VARCHAR",
            "document_type": "VARCHAR",
            "issuance_date": "TIMESTAMP",
            "due_date": "TIMESTAMP",
            "payment_date": "TIMESTAMP",
            "amount": "DOUBLE",
            "pending_amount": "DOUBLE",
            "currency": "VARCHAR",
            "accounting_currency": "VARCHAR",
            "exchange_rate": "DOUBLE",
            "status": "VARCHAR",
            "concept": "VARCHAR",
            "counterparty_id": "VARCHAR",
        },
        notes="Signo: negativo = a pagar, positivo = a cobrar. payment_date viene rellena "
              "tambien en facturas no pagadas y trae fechas imposibles.",
    ),
    "transactions": Table(
        name="transactions",
        pattern="transactions*.csv*",
        multi_file=True,
        primary_key=("transaction_id",),
        columns={
            "transaction_id": "VARCHAR",
            "company_id": "VARCHAR",
            "product_id": "VARCHAR",
            "date": "TIMESTAMP",
            "value_date": "TIMESTAMP",
            "amount": "DOUBLE",
            "exchange_rate": "DOUBLE",
            "status": "VARCHAR",
            "accounting_status": "VARCHAR",
            "category": "VARCHAR",
            "description": "VARCHAR",
            "counterparty_id": "VARCHAR",
        },
        notes="Puede venir en un fichero o partido por fechas. El 90% no trae counterparty_id "
              "y el 25% viene sin categoria ('-').",
    ),
}

REQUIRED_TABLES = tuple(name for name, table in TABLES.items() if table.required)
