"""Genera el baseline estático de todas las empresas sin parámetros de entrada.

Ejecución: python3 core/pipeline.py
"""

from __future__ import annotations

import csv
import gzip
import json
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from statistics import median

from scoring import (
    FACTOR_WEIGHTS,
    MODEL_VERSION,
    Factor,
    arrears_factor,
    band_for,
    build_drivers,
    combine_factors,
    debt_utilisation_factor,
    liquidity_factor,
    supplier_payment_factor,
)


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "datasets"
OUTPUT_DIR = ROOT / "core" / "outputs"
CUTOFF = date(2026, 9, 1)
CASH_PRODUCT_TYPES = {"checking", "saving"}
REVOLVING_DEBT_TYPES = {"lineofcredit", "factoring", "confirming"}
OPEN_INVOICE_STATUSES = {"overdue", "pending", "payment_in_progress", "paymentOrder", "shipped"}


def number(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except ValueError:
        return None


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError:
        return None


def read_csv(name: str):
    path = DATA_DIR / name
    with path.open(newline="", encoding="utf-8") as handle:
        yield from csv.DictReader(handle)


def load_companies() -> dict[str, dict[str, str]]:
    return {row["company_id"]: row for row in read_csv("companies.csv")}


def aggregate_positions(companies: dict[str, dict[str, str]]) -> tuple[dict, dict, dict]:
    banking = {row["product_id"]: row for row in read_csv("banking_products.csv")}
    debt_products = {row["product_id"]: row for row in read_csv("debt_products.csv")}
    cash = defaultdict(float)
    debt = defaultdict(float)
    revolving = defaultdict(lambda: {"granted": 0.0, "outstanding": 0.0})

    for row in debt_products.values():
        company_id = row["company_id"]
        company = companies.get(company_id)
        if not company or row["currency"] != company["currency"]:
            continue
        outstanding = abs(number(row["outstanding"]) or 0.0)
        debt[company_id] += outstanding
        if row["type"] in REVOLVING_DEBT_TYPES:
            revolving[company_id]["granted"] += abs(number(row["granted"]) or 0.0)
            revolving[company_id]["outstanding"] += outstanding

    for row in read_csv("balances.csv"):
        company_id = row["company_id"]
        company = companies.get(company_id)
        product = banking.get(row["product_id"])
        row_date = parse_date(row["date"])
        if (
            not company
            or not product
            or product["type"] not in CASH_PRODUCT_TYPES
            or product["currency"] != company["currency"]
            or row_date is None
            or row_date > CUTOFF
        ):
            continue
        balance = number(row["available"])
        if balance is None:
            balance = number(row["balance"])
        cash[company_id] += balance or 0.0

    return cash, debt, revolving


def aggregate_invoices(companies: dict[str, dict[str, str]]) -> dict[str, dict[str, object]]:
    aggregates = defaultdict(lambda: {
        "supplier_documents": 0,
        "customer_documents": 0,
        "supplier_open": 0.0,
        "supplier_overdue": 0.0,
        "customer_open": 0.0,
        "customer_overdue": 0.0,
        "supplier_paid": 0.0,
        "supplier_paid_late": 0.0,
        "payment_days": [],
        "days_late": [],
        "excluded_currency_rows": 0,
        "invalid_date_rows": 0,
    })
    with gzip.open(DATA_DIR / "invoices.csv.gz", "rt", newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            company_id = row["company_id"]
            company = companies.get(company_id)
            if not company:
                continue
            agg = aggregates[company_id]
            if row["currency"] != company["currency"]:
                agg["excluded_currency_rows"] += 1
                continue
            issued = parse_date(row["issuance_date"])
            if issued is None or issued > CUTOFF:
                agg["invalid_date_rows"] += 1
                continue
            amount_raw = number(row["amount"])
            if amount_raw is None or amount_raw == 0:
                continue
            side = "supplier" if amount_raw < 0 else "customer"
            agg[f"{side}_documents"] += 1
            amount = abs(amount_raw)
            pending = abs(number(row["pending_amount"]) or 0.0)
            status = row["status"]
            if status in OPEN_INVOICE_STATUSES:
                agg[f"{side}_open"] += pending
                if status == "overdue":
                    agg[f"{side}_overdue"] += pending

            if side != "supplier" or status != "paid":
                continue
            due = parse_date(row["due_date"])
            paid = parse_date(row["payment_date"])
            if due is None or paid is None or paid > CUTOFF or paid < issued:
                agg["invalid_date_rows"] += 1
                continue
            payment_days = (paid - issued).days
            if payment_days > 730:
                agg["invalid_date_rows"] += 1
                continue
            days_late = max((paid - due).days, 0)
            agg["supplier_paid"] += amount
            if days_late > 0:
                agg["supplier_paid_late"] += amount
            agg["payment_days"].append(payment_days)
            agg["days_late"].append(days_late)
    return aggregates


def factor_payload(factor: Factor, weight: float, effective_weight: float | None) -> dict[str, object]:
    return {
        "score": factor.score,
        "weight": weight,
        "effective_weight": effective_weight,
        "metrics": factor.metrics,
        "reason": factor.reason,
    }


def build_result(company: dict[str, str], cash: dict, debt: dict, revolving: dict, invoices: dict) -> dict:
    company_id = company["company_id"]
    inv = invoices.get(company_id, {})
    payment_days = inv.get("payment_days", [])
    days_late = inv.get("days_late", [])
    rev = revolving.get(company_id, {"granted": 0.0, "outstanding": 0.0})
    factors = {
        "liquidity": liquidity_factor(cash.get(company_id, 0.0), debt.get(company_id, 0.0)),
        "debt_utilisation": debt_utilisation_factor(rev["granted"], rev["outstanding"]),
        "arrears": arrears_factor(
            float(inv.get("supplier_open", 0.0)),
            float(inv.get("supplier_overdue", 0.0)),
            int(inv.get("supplier_documents", 0)),
            float(inv.get("customer_open", 0.0)),
            float(inv.get("customer_overdue", 0.0)),
            int(inv.get("customer_documents", 0)),
        ),
        "supplier_payment": supplier_payment_factor(
            float(inv.get("supplier_paid", 0.0)),
            float(inv.get("supplier_paid_late", 0.0)),
            round(float(median(payment_days)), 2) if payment_days else None,
            round(float(median(days_late)), 2) if days_late else None,
        ),
    }
    score, coverage, effective = combine_factors(factors)
    status = "insufficient_data" if score is None else ("available" if coverage == 1.0 else "partial")
    reasons = [f"{name}: {factor.reason}" for name, factor in factors.items() if factor.score is None]
    warnings = []
    if int(inv.get("excluded_currency_rows", 0)):
        warnings.append("Se excluyeron facturas fuera de la moneda funcional.")
    if int(inv.get("invalid_date_rows", 0)):
        warnings.append("Se excluyeron facturas con fechas no utilizables al corte.")

    return {
        "contract_version": "dashboard-v1",
        "entity": {"kind": "company", "id": company_id},
        "cutoff_date": CUTOFF.isoformat(),
        "model_version": MODEL_VERSION,
        "data_version": "embat-v2",
        "status": status,
        "score": score,
        "band": band_for(score),
        "months": ([{"month": "2026-09", "score": score, "basis": "observed_snapshot"}] if score is not None else []),
        "trajectory": {"direction": "unknown", "months_in_direction": None, "regime": "static_baseline"},
        "quality": {
            "coverage_ratio": coverage,
            "reasons": reasons,
            "warnings": warnings,
            "excluded_currency_rows": int(inv.get("excluded_currency_rows", 0)),
            "invalid_date_rows": int(inv.get("invalid_date_rows", 0)),
        },
        "factors": {
            name: factor_payload(factor, FACTOR_WEIGHTS[name], effective.get(name))
            for name, factor in factors.items()
        },
        "drivers": build_drivers(factors, effective),
        "alerts": [],
        "forecast": None,
    }


def main() -> None:
    print(f"Leyendo inputs de {DATA_DIR}")
    companies = load_companies()
    cash, debt, revolving = aggregate_positions(companies)
    invoices = aggregate_invoices(companies)
    results = [build_result(company, cash, debt, revolving, invoices) for company in companies.values()]
    results.sort(key=lambda result: result["entity"]["id"])

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    aggregate = {
        "schema_version": "score-results-v1",
        "model_version": MODEL_VERSION,
        "data_version": "embat-v2",
        "cutoff_date": CUTOFF.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(results),
        "companies": results,
    }
    (OUTPUT_DIR / "scores.json").write_text(
        json.dumps(aggregate, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    available = sum(result["score"] is not None for result in results)
    print(f"Generado {OUTPUT_DIR / 'scores.json'} con {len(results)} empresas ({available} con score)")


if __name__ == "__main__":
    main()
