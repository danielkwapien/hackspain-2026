"""Tests de `dataset_inventory.py` contra un mini dataset sintético propio.

No dependen del dataset real ni de ficheros CSV versionados: el dataset mínimo se escribe en un
directorio temporal desde los literales de `MINI_DATASET` y ejercita céntimos, estados, monedas,
país, mes parcial y cobertura.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS_DIR = Path(__file__).resolve().parents[1]
TOOL = TOOLS_DIR / "dataset_inventory.py"
NOW = "2026-09-18T12:00:00Z"

MINI_DATASET: dict[str, str] = {
    "groups.csv": (
        "group_id,erp,n_companies_in_sample\n"
        "GROUP_0001,Netsuite,2\n"
        "GROUP_0002,,1\n"
    ),
    "companies.csv": (
        "company_id,group_id,country,currency,erp,created_at\n"
        "COMP_0001,GROUP_0001,ESPAÑA,EUR,businessCentral,2024-05-02 10:00:00\n"
        "COMP_0002,GROUP_0001,ES,EUR,,2024-07-02 10:00:00\n"
        "COMP_0003,GROUP_0002,Portugal,USD,netsuite,2025-01-15 09:30:00\n"
        "COMP_0004,GROUP_0002,ESPANYA,EUR,,2025-06-01 08:00:00\n"
    ),
    "banking_products.csv": (
        "product_id,company_id,label,type,bank_name,service,currency,created_at\n"
        "PRODUCT_0001,COMP_0001,CHECKING_01,checking,Banco Uno,uno_emp,EUR,2024-05-03 10:00:00\n"
        "PRODUCT_0002,COMP_0001,SAVING_01,saving,Banco Uno,uno_emp,EUR,2024-06-01 10:00:00\n"
        "PRODUCT_0003,COMP_0002,CHECKING_01,checking,Banco Dos,dos_emp,USD,2024-07-03 10:00:00\n"
    ),
    "debt_products.csv": (
        "product_id,company_id,label,type,bank_name,service,currency,created_at,granted,outstanding,liquidity\n"
        "PRODUCT_0004,COMP_0001,LOAN_01,loan,Banco Uno,uno_emp,EUR,2024-08-01 10:00:00,-100000.0,-40000.0,\n"
        "PRODUCT_0005,COMP_0002,LINE_01,lineofcredit,Banco Dos,dos_emp,USD,2024-09-01 10:00:00,-50000.0,-10000.0,40000.0\n"
    ),
    "debt_schedule_config.csv": (
        "product_id,company_id,settlement_product_id,currency,amortization_type,interest_calc_method,"
        "amortising_frequency,granted_balance,outstanding_balance,total_periods,next_payment_date,"
        "last_payment_date,annual_interest_rate_or_spread,interest_type\n"
        "PRODUCT_0004,COMP_0001,PRODUCT_0001,EUR,constant quote,30/360,monthly,100000.0,40000.0,24,"
        "2026-10-01,2026-09-01,0.04,fixed\n"
    ),
    "transactions.csv": (
        "transaction_id,company_id,product_id,date,value_date,amount,exchange_rate,status,"
        "accounting_status,category,description,counterparty_id\n"
        "T001,COMP_0001,PRODUCT_0001,2024-09-05 00:00:00,2024-09-05 00:00:00,100.10,1.0,booked,,collection,cobro cliente,C001\n"
        "T002,COMP_0001,PRODUCT_0001,2024-09-20 00:00:00,2024-09-20 00:00:00,-50.05,1.0,booked,,payment,pago proveedor,C002\n"
        "T003,COMP_0001,PRODUCT_0002,2026-09-01 08:00:00,2026-09-01 08:00:00,0.10,1.0,booked,,interest_charge,intereses,\n"
        "T004,COMP_0001,PRODUCT_0002,2026-09-01 09:00:00,2026-09-01 09:00:00,-0.20,1.0,booked,,fee,comisiones,\n"
        "T005,COMP_0001,PRODUCT_0001,2026-09-01 10:00:00,2026-09-01 10:00:00,25.00,1.0,pending,,collection,pendiente de cobro,C003\n"
        "T006,COMP_0001,PRODUCT_0001,2026-09-01 11:00:00,2026-09-01 11:00:00,7.77,1.0,,,other,sin estado,\n"
        "T007,COMP_0002,PRODUCT_0003,2026-08-15 00:00:00,2026-08-15 00:00:00,-10.00,1.0,booked,,payment,pago en usd,C004\n"
        "T008,COMP_0003,PRODUCT_9999,2026-02-10 00:00:00,2026-02-10 00:00:00,5.00,1.0,booked,,other,producto desconocido,\n"
    ),
    "invoices.csv": (
        "operation_id,company_id,document_type,issuance_date,due_date,payment_date,amount,"
        "pending_amount,currency,accounting_currency,exchange_rate,status,concept,counterparty_id\n"
        "I001,COMP_0001,invoice,2026-03-10 00:00:00,2026-04-10 00:00:00,2026-04-05 00:00:00,121.00,0.00,EUR,EUR,1.0,paid,factura,C001\n"
        "I002,COMP_0001,invoice,2026-03-20 00:00:00,2026-04-20 00:00:00,,242.00,242.00,EUR,EUR,1.0,overdue,factura vencida,C002\n"
        "I003,COMP_0001,note,2026-03-25 00:00:00,2026-04-25 00:00:00,,12.50,12.50,EUR,EUR,1.0,payment_in_progress,nota,C003\n"
        "I004,COMP_0001,refund,2026-04-02 00:00:00,2026-05-02 00:00:00,,0.00,0.00,EUR,EUR,1.0,cancel,abono,C004\n"
    ),
    "balances.csv": (
        "product_id,company_id,date,balance,available,granted,liquidity,countable\n"
        "PRODUCT_0001,COMP_0001,2026-09-01 00:00:00,1000.10,,,1000.10,1000.10\n"
        "PRODUCT_0002,COMP_0001,2026-08-25 00:00:00,250.05,,,,250.05\n"
        "PRODUCT_0004,COMP_0001,2026-09-01 00:00:00,-40000.00,,,,\n"
        "PRODUCT_0003,COMP_0002,2026-09-01 00:00:00,-5.00,,,,\n"
    ),
    "data_dictionary.md": (
        "# Mini diccionario (fixture de test)\n\n"
        "Dataset sintético mínimo para los tests de `dataset_inventory.py`. No es el dataset real.\n"
    ),
}


def run_inventory(out: Path, data_dir: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [
            sys.executable,
            str(TOOL),
            "--data-dir",
            str(data_dir),
            "--out",
            str(out),
            "--now",
            NOW,
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def tree_hashes(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


@pytest.fixture(scope="module")
def mini_dataset(tmp_path_factory: pytest.TempPathFactory) -> Path:
    data_dir = tmp_path_factory.mktemp("mini-dataset")
    for name, content in MINI_DATASET.items():
        (data_dir / name).write_text(content, encoding="utf-8")
    return data_dir


@pytest.fixture(scope="module")
def exports(mini_dataset: Path, tmp_path_factory: pytest.TempPathFactory) -> Path:
    out = tmp_path_factory.mktemp("exports-mini")
    proc = run_inventory(out, mini_dataset)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    return out


def test_manifest_and_registries(exports: Path, mini_dataset: Path) -> None:
    manifest = read_json(exports / "manifest.json")
    assert manifest["contract_version"] == "dashboard-v1"
    assert manifest["dataset_version"] == "embat-v2"
    assert manifest["cutoff_date"] == "2026-09-01"
    assert manifest["window"] == {"start": "2024-09-01", "end": "2026-09-01"}
    assert manifest["generated_at"] == "2026-09-18T12:00:00+00:00"
    assert manifest["counts"]["n_groups"] == 2
    assert manifest["counts"]["n_companies"] == 4
    assert manifest["counts"]["rows_by_file"]["transactions.csv"] == 8
    assert manifest["counts"]["n_transactions_booked"] == 6
    assert manifest["counts"]["n_transactions_pending"] == 1
    assert manifest["counts"]["n_transactions_without_status"] == 1
    assert manifest["counts"]["n_debt_products_with_schedule"] == 1

    files = {item["name"]: item for item in manifest["source"]["files"]}
    assert len(files) == 8
    assert files["invoices.csv"]["rows"] == 4
    assert len(files["transactions.csv"]["sha256"]) == 64
    assert files["transactions.csv"]["bytes"] == (mini_dataset / "transactions.csv").stat().st_size

    notes = "\n".join(manifest["quality_notes"])
    for expected in (
        "mes parcial",
        "cuadro",
        "sin separación emitida/recibida verificada",
        "signo negativo",
        "sin verificar",
        "status=booked",
        "UNKNOWN",
    ):
        assert expected in notes, expected

    groups = {item["group_id"]: item for item in read_json(exports / "groups.json")}
    assert groups["GROUP_0001"]["n_companies_in_sample"] == 2
    assert groups["GROUP_0001"]["n_companies_present"] == 2
    assert groups["GROUP_0001"]["countries"] == [{"code": "ES", "n": 2}]
    assert groups["GROUP_0001"]["snapshot_dates"] == ["2026-08-25", "2026-09-01"]
    assert groups["GROUP_0002"]["countries"] == [{"code": "ES", "n": 1}, {"code": "PT", "n": 1}]
    assert groups["GROUP_0002"]["coverage"] == {
        "months_with_activity_min": 0,
        "months_with_activity_max": 1,
    }

    companies = {item["company_id"]: item for item in read_json(exports / "companies.json")}
    assert [item["company_id"] for item in read_json(exports / "companies.json")] == [
        "COMP_0001",
        "COMP_0002",
        "COMP_0003",
        "COMP_0004",
    ]
    assert companies["COMP_0001"]["country"] == "ES"
    assert companies["COMP_0003"]["country"] == "PT"
    assert companies["COMP_0001"]["coverage"]["months_with_activity"] == 2
    assert companies["COMP_0001"]["coverage"]["first_activity"] == "2024-09-05"
    assert companies["COMP_0001"]["coverage"]["last_activity"] == "2026-09-01"
    assert companies["COMP_0001"]["coverage"]["counts"] == {
        "banking_products": 2,
        "debt_products": 1,
        "invoices": 4,
        "transactions": 6,
        "transactions_pending": 1,
    }
    assert companies["COMP_0003"]["coverage"]["counts"]["transactions"] == 1
    assert companies["COMP_0003"]["coverage"]["currencies"] == [{"code": "UNKNOWN", "n_tx": 1}]
    assert companies["COMP_0004"]["coverage"]["counts"]["transactions"] == 0
    assert companies["COMP_0004"]["country"] == "ES"


def test_monthly_activity_cents_and_partial_flag(exports: Path) -> None:
    detail = read_json(exports / "companies" / "COMP_0001.json")
    activity = {(row["month"], row["currency"]): row for row in detail["monthly_activity"]}
    assert set(activity) == {("2024-09", "EUR"), ("2026-09", "EUR")}

    september_2024 = activity[("2024-09", "EUR")]
    assert september_2024 == {
        "month": "2024-09",
        "currency": "EUR",
        "n_tx": 2,
        "inflow": 100.1,
        "outflow": -50.05,
        "net": 50.05,
        "n_tx_pending": 0,
        "partial": False,
    }

    september_2026 = activity[("2026-09", "EUR")]
    assert september_2026["inflow"] == 0.1
    assert september_2026["outflow"] == -0.2
    assert september_2026["net"] == -0.1
    assert september_2026["n_tx"] == 2
    assert september_2026["n_tx_pending"] == 1
    assert september_2026["partial"] is True

    other = read_json(exports / "companies" / "COMP_0002.json")
    assert other["monthly_activity"][0]["currency"] == "USD"
    assert other["monthly_activity"][0]["net"] == -10.0
    assert other["coverage"]["currencies"] == [{"code": "USD", "n_tx": 1}]

    unknown = read_json(exports / "companies" / "COMP_0003.json")
    assert unknown["monthly_activity"] == [
        {
            "month": "2026-02",
            "currency": "UNKNOWN",
            "n_tx": 1,
            "inflow": 5.0,
            "outflow": 0.0,
            "net": 5.0,
            "n_tx_pending": 0,
            "partial": False,
        }
    ]

    empty = read_json(exports / "companies" / "COMP_0004.json")
    assert empty["monthly_activity"] == []
    assert empty["balances"] == []
    assert empty["coverage"]["months_with_activity"] == 0


def test_balances_snapshot_and_schedule_coverage(exports: Path) -> None:
    detail = read_json(exports / "companies" / "COMP_0001.json")
    snapshot = detail["coverage"]["snapshot"]
    assert snapshot["dates"] == ["2026-08-25", "2026-09-01"]
    assert snapshot["balance_total_by_currency"] == [{"currency": "EUR", "total": 1250.15}]
    assert snapshot["n_products_with_balance"] == 2

    balances = {row["product_id"]: row for row in detail["balances"]}
    assert balances["PRODUCT_0002"]["date"] == "2026-08-25"
    assert balances["PRODUCT_0002"]["balance"] == 250.05
    assert balances["PRODUCT_0004"]["balance"] == -40000.0
    assert balances["PRODUCT_0001"]["available"] is None

    banking = {row["product_id"]: row for row in detail["products"]["banking"]}
    assert banking["PRODUCT_0001"]["has_balance"] is True
    assert banking["PRODUCT_0001"]["balance_date"] == "2026-09-01"
    assert banking["PRODUCT_0002"]["balance_date"] == "2026-08-25"
    assert banking["PRODUCT_0001"]["created_at"] == "2024-05-03T10:00:00"

    debt = detail["products"]["debt"]
    assert [row["product_id"] for row in debt] == ["PRODUCT_0004"]
    assert debt[0]["granted"] == -100000.0
    assert debt[0]["outstanding"] == -40000.0
    assert debt[0]["liquidity"] is None

    assert detail["schedule"]["n_with_schedule"] == 1
    assert detail["schedule"]["n_debt_products"] == 1
    assert detail["schedule"]["items"][0] == {
        "product_id": "PRODUCT_0004",
        "currency": "EUR",
        "amortising_frequency": "monthly",
        "total_periods": 24,
        "next_payment_date": "2026-10-01",
        "last_payment_date": "2026-09-01",
        "annual_interest_rate_or_spread": 0.04,
        "interest_type": "fixed",
        "outstanding_balance": 40000.0,
    }


def test_invoice_buckets_and_direction_note(exports: Path) -> None:
    detail = read_json(exports / "companies" / "COMP_0001.json")
    monthly = detail["monthly_invoices"]
    assert "separación emitida/recibida verificada" in monthly["direction_note"]
    items = {row["month"]: row for row in monthly["items"]}
    assert items["2026-03"] == {
        "month": "2026-03",
        "currency": "EUR",
        "n": 3,
        "n_paid": 1,
        "n_overdue": 1,
        "n_pending": 1,
        "n_cancel": 0,
        "pending_amount_sum": 254.5,
    }
    assert items["2026-04"]["n_cancel"] == 1
    assert items["2026-04"]["pending_amount_sum"] == 0.0


def test_read_only_and_idempotent(mini_dataset: Path, tmp_path: Path) -> None:
    before = tree_hashes(mini_dataset)
    first = tmp_path / "first"
    second = tmp_path / "second"
    assert run_inventory(first, mini_dataset).returncode == 0
    assert run_inventory(second, mini_dataset).returncode == 0
    assert tree_hashes(mini_dataset) == before
    assert tree_hashes(first) == tree_hashes(second)
    assert (first / "results" / "README.md").is_file()
    assert not (first / "results" / "COMP_0001.json").exists()
