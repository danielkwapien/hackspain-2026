#!/usr/bin/env python3
"""Inventario batch del dataset Embat -> exports/v1 (contrato dashboard-v1).

Proceso de un solo disparo: lee los CSV del dataset, cuenta y describe lo que hay y escribe
JSON compacto y determinista en `--out`. No sirve peticiones, no convierte moneda, no puntúa.

Ejemplo:
    uv run python dataset_inventory.py \
        --data-dir /Users/danik/projects/hackspain-2026-data/embat-v2/output \
        --out /Users/danik/orca/workspaces/hackspain-2026/dashboard-v1/app/exports/v1 \
        --now 2026-09-18T12:00:00Z
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import polars as pl

CONTRACT_VERSION = "dashboard-v1"
DATASET_VERSION = "embat-v2"
CUTOFF_DATE = "2026-09-01"
WINDOW_START = "2024-09-01"
WINDOW_END = "2026-09-01"
PERIODS_TOTAL = 25
PARTIAL_MONTH = CUTOFF_DATE[:7]

CSV_FILES = (
    "groups.csv",
    "companies.csv",
    "banking_products.csv",
    "debt_products.csv",
    "debt_schedule_config.csv",
    "transactions.csv",
    "invoices.csv",
    "balances.csv",
)

EXPECTED_ROWS = {
    "groups.csv": 250,
    "companies.csv": 1286,
    "transactions.csv": 2_556_437,
    "invoices.csv": 897_894,
}

COUNTRY_ALIASES = {
    "españa": "ES",
    "espanya": "ES",
    "espana": "ES",
    "spain": "ES",
    "portugal": "PT",
}

# status de factura -> cubo publicado (n_paid / n_overdue / n_pending / n_cancel)
INVOICE_STATUS_BUCKETS = {
    "paid": "n_paid",
    "overdue": "n_overdue",
    "pending": "n_pending",
    "payment_in_progress": "n_pending",
    "paymentOrder": "n_pending",
    "shipped": "n_pending",
    "cancel": "n_cancel",
}

DIRECTION_NOTE = (
    "Sin separación emitida/recibida verificada: invoices.csv mezcla document_type "
    "(invoice, note, paymentDocument, deposit, invoiceGroup, refund, deliveryNote, purchaseOrder, "
    "other y cheque). Los recuentos por estado y los importes pendientes son agregados sin dirección."
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cents(expr: pl.Expr) -> pl.Expr:
    """Importes a céntimos enteros: toda suma se hace en enteros, nunca en float."""
    return (expr.cast(pl.Float64) * 100).round().cast(pl.Int64)


def _plural(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def money(value: int | None) -> float | None:
    if value is None:
        return None
    return round(value / 100, 2)


def money_opt(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value), 2)


def iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(microsecond=0).isoformat()
    return value.isoformat()


def day(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    return value.isoformat()


def normalize_country(raw: str | None) -> str | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    return COUNTRY_ALIASES.get(text.lower(), text.upper())


def read_csv(data_dir: Path, name: str, **kwargs) -> pl.DataFrame:
    return pl.read_csv(data_dir / name, try_parse_dates=True, **kwargs)


def write_json(out_root: Path, relpath: str, payload: object) -> int:
    """Escribe JSON compacto dentro de --out. Nunca sale del directorio de salida."""
    target = (out_root / relpath).resolve()
    if not target.is_relative_to(out_root.resolve()):
        raise RuntimeError(f"ruta de escritura fuera de --out: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    target.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def build_manifest(
    *,
    data_dir: Path,
    generated_at: str,
    file_stats: list[dict],
    counts: dict,
    quality_notes: list[str],
) -> dict:
    return {
        "contract_version": CONTRACT_VERSION,
        "dataset_version": DATASET_VERSION,
        "cutoff_date": CUTOFF_DATE,
        "window": {"start": WINDOW_START, "end": WINDOW_END},
        "generated_at": generated_at,
        "source": {"data_dir": str(data_dir), "files": file_stats},
        "counts": counts,
        "quality_notes": quality_notes,
    }


def compute(args: argparse.Namespace) -> dict:
    data_dir: Path = args.data_dir
    out_root: Path = args.out
    missing = [name for name in CSV_FILES if not (data_dir / name).is_file()]
    if missing:
        raise SystemExit(f"faltan ficheros en --data-dir {data_dir}: {', '.join(missing)}")
    if not (data_dir / "data_dictionary.md").is_file():
        raise SystemExit(f"falta data_dictionary.md en --data-dir {data_dir}")

    out_root.mkdir(parents=True, exist_ok=True)

    groups = read_csv(data_dir, "groups.csv")
    companies = read_csv(data_dir, "companies.csv")
    banking = read_csv(data_dir, "banking_products.csv")
    debt = read_csv(data_dir, "debt_products.csv")
    schedule = read_csv(data_dir, "debt_schedule_config.csv")
    balances = read_csv(data_dir, "balances.csv")
    transactions = read_csv(
        data_dir,
        "transactions.csv",
        columns=["company_id", "product_id", "date", "amount", "status"],
        schema_overrides={"amount": pl.Float64},
    )
    invoices = read_csv(
        data_dir,
        "invoices.csv",
        columns=[
            "company_id",
            "document_type",
            "issuance_date",
            "amount",
            "pending_amount",
            "currency",
            "status",
        ],
        schema_overrides={"amount": pl.Float64, "pending_amount": pl.Float64},
    )

    rows_by_file = {
        "groups.csv": groups.height,
        "companies.csv": companies.height,
        "banking_products.csv": banking.height,
        "debt_products.csv": debt.height,
        "debt_schedule_config.csv": schedule.height,
        "transactions.csv": transactions.height,
        "invoices.csv": invoices.height,
        "balances.csv": balances.height,
    }
    file_stats = [
        {
            "name": name,
            "sha256": sha256_file(data_dir / name),
            "rows": rows_by_file[name],
            "bytes": (data_dir / name).stat().st_size,
        }
        for name in CSV_FILES
    ]

    # ---------------------------------------------------------------- productos
    product_currency = pl.concat(
        [
            banking.select("product_id", "currency"),
            debt.select("product_id", "currency"),
        ]
    ).unique(subset=["product_id"], keep="first")

    balances = balances.join(product_currency, on="product_id", how="left").with_columns(
        pl.col("currency").fill_null("UNKNOWN"),
        pl.col("date").cast(pl.Date),
    )

    # ---------------------------------------------------------------- movimientos
    transactions = transactions.with_columns(
        cents(pl.col("amount")).alias("amount_c"),
        pl.col("date").dt.strftime("%Y-%m").alias("month"),
    ).join(product_currency, on="product_id", how="left").with_columns(
        pl.col("currency").fill_null("UNKNOWN")
    )

    booked = transactions.filter(pl.col("status") == "booked")
    pending = transactions.filter(pl.col("status") == "pending")

    n_status_null = transactions.filter(pl.col("status").is_null()).height
    status_counts = {
        row["status"] if row["status"] is not None else "": row["n"]
        for row in transactions.group_by("status").agg(pl.len().alias("n")).iter_rows(named=True)
    }

    activity = (
        booked.group_by(["company_id", "month", "currency"])
        .agg(
            pl.col("amount_c").filter(pl.col("amount_c") > 0).sum().alias("inflow_c"),
            pl.col("amount_c").filter(pl.col("amount_c") < 0).sum().alias("outflow_c"),
            pl.col("amount_c").sum().alias("net_c"),
            pl.len().alias("n_tx"),
        )
        .join(
            pending.group_by(["company_id", "month", "currency"]).agg(
                pl.len().alias("n_tx_pending")
            ),
            on=["company_id", "month", "currency"],
            how="full",
            coalesce=True,
        )
    )

    tx_coverage = booked.group_by("company_id").agg(
        pl.col("month").n_unique().alias("months_with_activity"),
        pl.col("date").min().alias("first_activity"),
        pl.col("date").max().alias("last_activity"),
    )
    tx_counts = transactions.group_by("company_id").agg(
        pl.len().alias("transactions"),
        (pl.col("status") == "pending").sum().alias("transactions_pending"),
    )
    tx_currencies = (
        transactions.group_by(["company_id", "currency"])
        .agg(pl.len().alias("n_tx"))
        .sort(["company_id", "currency"])
    )

    unknown_currency_tx = transactions.filter(pl.col("currency") == "UNKNOWN").height

    # ---------------------------------------------------------------- facturas
    invoices = invoices.with_columns(
        cents(pl.col("pending_amount")).alias("pending_c"),
        pl.col("issuance_date").dt.strftime("%Y-%m").alias("month"),
    )
    inv_monthly_frame = (
        invoices.group_by(["company_id", "month", "currency"])
        .agg(
            pl.len().alias("n"),
            (pl.col("status") == "paid").sum().alias("n_paid"),
            (pl.col("status") == "overdue").sum().alias("n_overdue"),
            pl.col("status").is_in(
                ["pending", "payment_in_progress", "paymentOrder", "shipped"]
            ).sum().alias("n_pending"),
            (pl.col("status") == "cancel").sum().alias("n_cancel"),
            pl.col("pending_c").sum().alias("pending_sum_c"),
        )
        .sort(["company_id", "month", "currency"])
    )
    inv_counts = invoices.group_by("company_id").agg(pl.len().alias("invoices"))
    unmapped_invoice_status = sorted(
        {
            row["status"]
            for row in invoices.select("status").unique().iter_rows(named=True)
            if row["status"] not in INVOICE_STATUS_BUCKETS
        }
    )
    invoice_doc_types = {
        row["document_type"]: row["n"]
        for row in invoices.group_by("document_type").agg(pl.len().alias("n")).iter_rows(named=True)
    }

    # ---------------------------------------------------------------- saldos
    banking_ids = banking["product_id"].to_list()
    snapshot_totals = (
        balances.filter(pl.col("product_id").is_in(banking_ids))
        .with_columns(cents(pl.col("balance")).alias("balance_c"))
        .group_by(["company_id", "currency"])
        .agg(pl.col("balance_c").sum().alias("total_c"))
        .sort(["company_id", "currency"])
    )
    banking_balances = (
        balances.filter(pl.col("product_id").is_in(banking_ids))
        .group_by("company_id")
        .agg(pl.len().alias("n_banking_with_balance"))
    )
    balance_dates = (
        balances.group_by("company_id")
        .agg(pl.col("date").unique().sort().alias("dates"))
        .sort("company_id")
    )
    n_balance_products = balances["product_id"].n_unique()
    products_without_balance = (
        len(banking_ids) + debt.height - n_balance_products
    )

    # ---------------------------------------------------------------- índices
    company_rows: dict[str, dict] = {}
    for row in companies.iter_rows(named=True):
        company_rows[row["company_id"]] = {
            "company_id": row["company_id"],
            "group_id": row["group_id"],
            "country": normalize_country(row["country"]),
            "currency": row["currency"],
            "erp": row["erp"],
            "created_at": iso(row["created_at"]),
        }

    group_rows: dict[str, dict] = {}
    for row in groups.iter_rows(named=True):
        group_rows[row["group_id"]] = {
            "group_id": row["group_id"],
            "erp": row["erp"],
            "n_companies_in_sample": int(row["n_companies_in_sample"]),
        }

    coverage: dict[str, dict] = {}
    for row in tx_coverage.iter_rows(named=True):
        coverage[row["company_id"]] = {
            "months_with_activity": int(row["months_with_activity"]),
            "first_activity": day(row["first_activity"]),
            "last_activity": day(row["last_activity"]),
        }
    for cid, data in coverage.items():
        data.update(
            {
                "periods_total": PERIODS_TOTAL,
                "counts": {
                    "banking_products": 0,
                    "debt_products": 0,
                    "invoices": 0,
                    "transactions": 0,
                    "transactions_pending": 0,
                },
                "snapshot": {},
                "currencies": [],
            }
        )

    def _cov(cid: str) -> dict:
        return coverage.setdefault(
            cid,
            {
                "months_with_activity": 0,
                "first_activity": None,
                "last_activity": None,
                "periods_total": PERIODS_TOTAL,
                "counts": {
                    "banking_products": 0,
                    "debt_products": 0,
                    "invoices": 0,
                    "transactions": 0,
                    "transactions_pending": 0,
                },
                "snapshot": {},
                "currencies": [],
            },
        )

    for row in tx_counts.iter_rows(named=True):
        _cov(row["company_id"])["counts"]["transactions"] = int(row["transactions"])
        _cov(row["company_id"])["counts"]["transactions_pending"] = int(
            row["transactions_pending"]
        )
    for row in inv_counts.iter_rows(named=True):
        _cov(row["company_id"])["counts"]["invoices"] = int(row["invoices"])

    banking_counts = banking.group_by("company_id").agg(pl.len().alias("n"))
    for row in banking_counts.iter_rows(named=True):
        _cov(row["company_id"])["counts"]["banking_products"] = int(row["n"])
    debt_counts = debt.group_by("company_id").agg(pl.len().alias("n"))
    for row in debt_counts.iter_rows(named=True):
        _cov(row["company_id"])["counts"]["debt_products"] = int(row["n"])

    for row in tx_currencies.iter_rows(named=True):
        _cov(row["company_id"])["currencies"].append(
            {"code": row["currency"], "n_tx": int(row["n_tx"])}
        )

    dates_by_company = {
        row["company_id"]: [d.isoformat() for d in row["dates"]]
        for row in balance_dates.iter_rows(named=True)
    }
    totals_by_company: dict[str, list[dict]] = {}
    for row in snapshot_totals.iter_rows(named=True):
        totals_by_company.setdefault(row["company_id"], []).append(
            {"currency": row["currency"], "total": money(row["total_c"])}
        )
    n_bal_by_company = {
        row["company_id"]: int(row["n_banking_with_balance"])
        for row in banking_balances.iter_rows(named=True)
    }

    # ---------------------------------------------------------------- grupos
    groups_payload = []
    companies_by_group: dict[str, list[str]] = {}
    for cid, company in company_rows.items():
        companies_by_group.setdefault(company["group_id"], []).append(cid)

    for gid in sorted(group_rows):
        group = group_rows[gid]
        members = sorted(companies_by_group.get(gid, []))
        currencies: dict[str, int] = {}
        countries: dict[str, int] = {}
        months: list[int] = []
        snapshot_dates: set[str] = set()
        for cid in members:
            company = company_rows[cid]
            currencies[company["currency"]] = currencies.get(company["currency"], 0) + 1
            if company["country"]:
                countries[company["country"]] = countries.get(company["country"], 0) + 1
            months.append(_cov(cid)["months_with_activity"])
            snapshot_dates.update(dates_by_company.get(cid, []))
        groups_payload.append(
            {
                "group_id": gid,
                "erp": group["erp"],
                "n_companies_in_sample": group["n_companies_in_sample"],
                "n_companies_present": len(members),
                "currencies": [
                    {"code": code, "n": n} for code, n in sorted(currencies.items())
                ],
                "countries": [{"code": code, "n": n} for code, n in sorted(countries.items())],
                "coverage": {
                    "months_with_activity_min": min(months) if months else None,
                    "months_with_activity_max": max(months) if months else None,
                },
                "snapshot_dates": sorted(snapshot_dates),
            }
        )

    # ---------------------------------------------------------------- sociedades (índice)
    companies_payload = []
    for cid in sorted(company_rows):
        company = company_rows[cid]
        cov = _cov(cid)
        snapshot = {
            "dates": dates_by_company.get(cid, []),
            "balance_total_by_currency": totals_by_company.get(cid, []),
            "n_products_with_balance": n_bal_by_company.get(cid, 0),
        }
        companies_payload.append(
            {
                **company,
                "coverage": {
                    "months_with_activity": cov["months_with_activity"],
                    "periods_total": cov["periods_total"],
                    "first_activity": cov["first_activity"],
                    "last_activity": cov["last_activity"],
                    "counts": cov["counts"],
                    "snapshot": snapshot,
                    "currencies": cov["currencies"],
                },
            }
        )

    # ---------------------------------------------------------------- detalle por sociedad
    banking_by_company: dict[str, list[dict]] = {}
    for row in banking.sort(["company_id", "product_id"]).iter_rows(named=True):
        banking_by_company.setdefault(row["company_id"], []).append(row)
    debt_by_company: dict[str, list[dict]] = {}
    for row in debt.sort(["company_id", "product_id"]).iter_rows(named=True):
        debt_by_company.setdefault(row["company_id"], []).append(row)
    schedule_by_company: dict[str, list[dict]] = {}
    for row in schedule.sort(["company_id", "product_id"]).iter_rows(named=True):
        schedule_by_company.setdefault(row["company_id"], []).append(row)
    balances_by_company: dict[str, list[dict]] = {}
    balance_date_by_product: dict[str, str] = {}
    for row in balances.sort(["company_id", "product_id"]).iter_rows(named=True):
        balances_by_company.setdefault(row["company_id"], []).append(row)
        balance_date_by_product[row["product_id"]] = row["date"].isoformat()
    activity_by_company: dict[str, list[dict]] = {}
    for row in activity.sort(["company_id", "month", "currency"]).iter_rows(named=True):
        activity_by_company.setdefault(row["company_id"], []).append(row)
    invoices_by_company: dict[str, list[dict]] = {}
    for row in inv_monthly_frame.iter_rows(named=True):
        invoices_by_company.setdefault(row["company_id"], []).append(row)

    detail_bytes = 0
    companies_dir = out_root / "companies"
    if companies_dir.exists():
        shutil.rmtree(companies_dir)
    companies_dir.mkdir(parents=True)

    for cid in sorted(company_rows):
        cov = _cov(cid)
        banking_items = []
        for row in banking_by_company.get(cid, []):
            banking_items.append(
                {
                    "product_id": row["product_id"],
                    "label": row["label"],
                    "type": row["type"],
                    "bank_name": row["bank_name"],
                    "service": row["service"],
                    "currency": row["currency"],
                    "created_at": iso(row["created_at"]),
                    "has_balance": row["product_id"] in balance_date_by_product,
                    "balance_date": balance_date_by_product.get(row["product_id"]),
                }
            )
        debt_items = [
            {
                "product_id": row["product_id"],
                "label": row["label"],
                "type": row["type"],
                "bank_name": row["bank_name"],
                "currency": row["currency"],
                "granted": money_opt(row["granted"]),
                "outstanding": money_opt(row["outstanding"]),
                "liquidity": money_opt(row["liquidity"]),
            }
            for row in debt_by_company.get(cid, [])
        ]
        schedule_items = [
            {
                "product_id": row["product_id"],
                "currency": row["currency"],
                "amortising_frequency": row["amortising_frequency"],
                "total_periods": int(row["total_periods"]) if row["total_periods"] is not None else None,
                "next_payment_date": day(row["next_payment_date"]),
                "last_payment_date": day(row["last_payment_date"]),
                "annual_interest_rate_or_spread": (
                    round(float(row["annual_interest_rate_or_spread"]), 6)
                    if row["annual_interest_rate_or_spread"] is not None
                    else None
                ),
                "interest_type": row["interest_type"],
                "outstanding_balance": money_opt(row["outstanding_balance"]),
            }
            for row in schedule_by_company.get(cid, [])
        ]
        balance_items = [
            {
                "product_id": row["product_id"],
                "date": row["date"].isoformat(),
                "balance": money_opt(row["balance"]),
                "available": money_opt(row["available"]),
                "liquidity": money_opt(row["liquidity"]),
                "countable": money_opt(row["countable"]),
            }
            for row in balances_by_company.get(cid, [])
        ]
        monthly_activity = [
            {
                "month": row["month"],
                "currency": row["currency"],
                "n_tx": int(row["n_tx"]) if row["n_tx"] is not None else 0,
                "inflow": money(row["inflow_c"]) if row["inflow_c"] is not None else 0.0,
                "outflow": money(row["outflow_c"]) if row["outflow_c"] is not None else 0.0,
                "net": money(row["net_c"]) if row["net_c"] is not None else 0.0,
                "n_tx_pending": int(row["n_tx_pending"]) if row["n_tx_pending"] is not None else 0,
                "partial": row["month"] == PARTIAL_MONTH,
            }
            for row in activity_by_company.get(cid, [])
        ]
        monthly_invoices = [
            {
                "month": row["month"],
                "currency": row["currency"],
                "n": int(row["n"]),
                "n_paid": int(row["n_paid"]),
                "n_overdue": int(row["n_overdue"]),
                "n_pending": int(row["n_pending"]),
                "n_cancel": int(row["n_cancel"]),
                "pending_amount_sum": money(row["pending_sum_c"]),
            }
            for row in invoices_by_company.get(cid, [])
        ]
        detail = {
            "contract_version": CONTRACT_VERSION,
            "identification": company_rows[cid],
            "coverage": {
                "months_with_activity": cov["months_with_activity"],
                "periods_total": cov["periods_total"],
                "first_activity": cov["first_activity"],
                "last_activity": cov["last_activity"],
                "counts": cov["counts"],
                "snapshot": {
                    "dates": dates_by_company.get(cid, []),
                    "balance_total_by_currency": totals_by_company.get(cid, []),
                    "n_products_with_balance": n_bal_by_company.get(cid, 0),
                },
                "currencies": cov["currencies"],
            },
            "products": {"banking": banking_items, "debt": debt_items},
            "schedule": {
                "n_with_schedule": len(schedule_items),
                "n_debt_products": cov["counts"]["debt_products"],
                "items": schedule_items,
            },
            "balances": balance_items,
            "monthly_activity": monthly_activity,
            "monthly_invoices": {"direction_note": DIRECTION_NOTE, "items": monthly_invoices},
        }
        detail_bytes += write_json(out_root, f"companies/{cid}.json", detail)

    # ---------------------------------------------------------------- notes + manifest
    snapshot_dates_all = sorted({d for dates in dates_by_company.values() for d in dates})
    non_cutoff_dates = [d for d in snapshot_dates_all if d != CUTOFF_DATE]
    n_prior_snapshot_products = balances.filter(
        pl.col("date") != pl.lit(CUTOFF_DATE).str.to_date()
    ).height
    quality_notes = [
        (
            f"El corte {PARTIAL_MONTH} es un mes parcial: contiene solo datos del día "
            f"{CUTOFF_DATE} (último día de la ventana {WINDOW_START} a {WINDOW_END}); las series "
            f"mensuales marcan ese mes con partial=true y no es comparable con un mes completo."
        ),
        (
            f"balances.csv: fecha efectiva {CUTOFF_DATE} salvo "
            f"{_plural(n_prior_snapshot_products, 'producto', 'productos')} con el día anterior más "
            f"próximo con snapshot ({', '.join(non_cutoff_dates)}). "
            f"La fecha efectiva se expone por producto en products.banking[].balance_date y balances[].date."
        ),
        (
            f"debt_schedule_config.csv: solo {schedule.height} de {debt.height} productos de deuda tienen "
            f"cuadro de amortización (cobertura parcial de las condiciones). No se extrapola ningún "
            f"calendario para el resto."
        ),
        (
            f"invoices.csv: sin separación emitida/recibida verificada. document_type presente: "
            f"{', '.join(f'{k} ({v})' for k, v in sorted(invoice_doc_types.items(), key=lambda kv: (-kv[1], kv[0])))}. "
            f"Los recuentos por estado y los importes pendientes no llevan dirección."
        ),
        (
            "debt_products.granted/outstanding: valores actuales de la extracción (no series históricas) "
            "y con signo negativo en el dataset. Se publican tal cual, sin transformar ni agregar."
        ),
        (
            "exchange_rate (transactions/invoices): sentido y moneda base sin verificar. No se convierte "
            "ni se consolida ninguna moneda: todas las agregaciones son por moneda."
        ),
        (
            "transactions.status: "
            + ", ".join(
                f"{k or '(vacío)'}={v}"
                for k, v in sorted(status_counts.items(), key=lambda kv: (-kv[1], kv[0] or ""))
            )
            + ". Los flujos (inflow/outflow/net) se calculan solo con status=booked; los pending se "
            f"cuentan aparte (n_tx_pending) y las {n_status_null} filas sin estado no entran en ninguna serie."
        ),
        (
            "snapshot.balance_total_by_currency suma únicamente productos bancarios (caja observada) por "
            "moneda. Las posiciones de deuda no se agregan aquí: se exponen por producto con su outstanding."
        ),
        (
            f"counts.transactions incluye todos los estados de transactions.csv (booked, pending y filas "
            f"sin estado); counts.transactions_pending cuenta solo status=pending."
        ),
        (
            f"Cobertura de producto: {n_balance_products} productos tienen fila en balances.csv de "
            f"{len(banking_ids) + debt.height} productos totales ({products_without_balance} sin snapshot)."
        ),
        (
            f"País: {companies.height - sum(1 for c in company_rows.values() if c['country'])} de "
            f"{companies.height} sociedades no traen país; se normalizan variantes (ES/ESPAÑA/España/"
            f"ESPANYA/Espanya -> ES, Portugal -> PT) y el resto se deja en mayúsculas."
        ),
    ]
    if unknown_currency_tx:
        quality_notes.append(
            f"{unknown_currency_tx} movimientos apuntan a un product_id sin moneda conocida en "
            f"banking_products/debt_products; se publican con currency=UNKNOWN."
        )
    if unmapped_invoice_status:
        quality_notes.append(
            f"Estados de factura fuera de los cubos publicados: {unmapped_invoice_status}."
        )

    counts = {
        "n_groups": groups.height,
        "n_companies": companies.height,
        "rows_by_file": rows_by_file,
        "n_transactions_booked": status_counts.get("booked", 0),
        "n_transactions_pending": status_counts.get("pending", 0),
        "n_transactions_without_status": n_status_null,
        "n_invoices": invoices.height,
        "n_banking_products": banking.height,
        "n_debt_products": debt.height,
        "n_debt_products_with_schedule": schedule.height,
        "n_balance_rows": balances.height,
        "snapshot_dates": snapshot_dates_all,
    }

    manifest = build_manifest(
        data_dir=data_dir,
        generated_at=args.now_iso,
        file_stats=file_stats,
        counts=counts,
        quality_notes=quality_notes,
    )

    write_json(out_root, "groups.json", groups_payload)
    write_json(out_root, "companies.json", companies_payload)
    write_json(out_root, "manifest.json", manifest)
    results_readme = out_root / "results" / "README.md"
    results_readme.parent.mkdir(parents=True, exist_ok=True)
    results_readme.write_text(RESULTS_README, encoding="utf-8")

    deviations = [
        f"{name}: {rows_by_file[name]} (esperado {expected})"
        for name, expected in EXPECTED_ROWS.items()
        if rows_by_file[name] != expected
    ]
    total_bytes = sum(
        path.stat().st_size for path in out_root.rglob("*") if path.is_file()
    )
    return {
        "rows_by_file": rows_by_file,
        "deviations": deviations,
        "n_companies_detail": len(company_rows),
        "detail_bytes": detail_bytes,
        "total_bytes": total_bytes,
        "quality_notes": len(quality_notes),
        "companies_payload": len(companies_payload),
        "groups_payload": len(groups_payload),
    }


RESULTS_README = """# app/exports/v1/results — resultados del motor analítico (vacío)

Aquí publicará el pipeline analítico (`data-analysis/`) un fichero por entidad,
`results/<entity_id>.json`, con el contrato de la §3 de `docs/dani/contrato-dashboard-v1.md`
(versión de contrato `dashboard-v1`) cuando exista motor de score.

Reglas de consumo en `app/api`:

- Si existe `results/<companyId>.json` con `status: "available" | "partial" | "insufficient_data"`,
  la API lo expone como `engine` en el detalle de sociedad y funde su resumen en el listado.
- Si no existe el fichero, `engine = { "status": "pending_engine", "score": null, ... }`. La UI
  muestra «Pendiente de cálculo».
- `insufficient_data` no lleva número; `partial` lo lleva con aviso de cobertura.

Este directorio está vacío a propósito: no se generan resultados sintéticos ni de relleno.
"""


def parse_now(raw: str | None) -> str:
    if raw is None:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.replace(microsecond=0).isoformat()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("/Users/danik/projects/hackspain-2026-data/embat-v2/output"),
        help="Directorio con los CSV del dataset (solo lectura)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "exports" / "v1",
        help="Directorio de salida (se escribe solo aquí)",
    )
    parser.add_argument(
        "--now",
        default=None,
        help="ISO timestamp para generated_at (determinismo, p. ej. 2026-09-18T12:00:00Z)",
    )
    parser.add_argument(
        "--strict-counts",
        action="store_true",
        help="Devuelve 1 si los recuentos no cuadran con el dataset esperado (250/1286/2556437/897894)",
    )
    args = parser.parse_args(argv)
    args.data_dir = args.data_dir.expanduser().resolve()
    args.out = args.out.expanduser().resolve()
    args.now_iso = parse_now(args.now)

    if args.data_dir == args.out or args.data_dir.is_relative_to(args.out):
        raise SystemExit("--out no puede ser igual ni contener a --data-dir")

    started = time.monotonic()
    result = compute(args)
    elapsed = time.monotonic() - started

    print(f"exports/v1 generado en {args.out}")
    print(f"generated_at: {args.now_iso} · duración: {elapsed:.1f}s")
    print(f"recuentos: {json.dumps(result['rows_by_file'], ensure_ascii=False)}")
    print(f"sociedades (detalle): {result['n_companies_detail']} · grupos: {result['groups_payload']}")
    print(f"detalle por sociedad: {result['detail_bytes'] / 1e6:.2f} MB")
    print(f"total exports/v1: {result['total_bytes'] / 1e6:.2f} MB")
    print(f"notas de calidad: {result['quality_notes']}")
    if result["deviations"]:
        print("desviaciones en recuentos respecto al dataset esperado:")
        for line in result["deviations"]:
            print(f"  - {line}")
        return 1 if args.strict_counts else 0
    print("recuentos verificados: 250 grupos / 1.286 sociedades / 2.556.437 movimientos / 897.894 facturas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
