import json
import os
from dataclasses import asdict, dataclass
from hashlib import sha256
from pathlib import Path
from typing import Final

import duckdb
import polars as pl

REQUIRED_FILES: Final[tuple[str, ...]] = (
    "groups.csv",
    "companies.csv",
    "banking_products.csv",
    "debt_products.csv",
    "debt_schedule_config.csv",
    "transactions.csv",
    "invoices.csv",
    "balances.csv",
    "data_dictionary.md",
)
PRIMARY_KEYS: Final[tuple[tuple[str, str], ...]] = (
    ("groups", "group_id"),
    ("companies", "company_id"),
    ("banking_products", "product_id"),
    ("debt_products", "product_id"),
    ("debt_schedule_config", "product_id"),
    ("transactions", "transaction_id"),
    ("invoices", "operation_id"),
)


@dataclass(frozen=True, slots=True)
class AuditSummary:
    row_counts: tuple[tuple[str, int], ...]
    primary_key_duplicates: tuple[tuple[str, int], ...]
    orphan_counts: tuple[tuple[str, int], ...]
    product_id_overlap: int
    transaction_months_min: int
    transaction_months_median: float
    transaction_months_max: int
    companies_with_transactions: int
    balance_snapshot_dates: int
    schedules_total: int
    schedules_with_debt_product: int
    schedules_with_settlement_product: int
    invoice_direction_resolved: bool
    labels_found: bool


def _digest(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _scalar_text(connection: duckdb.DuckDBPyConnection, sql: str) -> str:
    row = connection.sql(sql).fetchone()
    assert row is not None
    value = row[0]
    assert value is not None
    return str(value)


def _scalar_int(connection: duckdb.DuckDBPyConnection, sql: str) -> int:
    return int(_scalar_text(connection, sql))


def _load_views(connection: duckdb.DuckDBPyConnection, data_dir: Path) -> None:
    for name in REQUIRED_FILES:
        if not name.endswith(".csv"):
            continue
        table = name.removesuffix(".csv")
        source = (data_dir / name).as_posix().replace("'", "''")
        connection.execute(
            f"CREATE OR REPLACE TEMP VIEW {table} AS "
            f"SELECT * FROM read_csv_auto('{source}', sample_size=-1)"
        )


def _inventory(connection: duckdb.DuckDBPyConnection, data_dir: Path) -> pl.DataFrame:
    rows: list[tuple[str, int, int, str]] = []
    for name in REQUIRED_FILES:
        path = data_dir / name
        count = 0
        if name.endswith(".csv"):
            table = name.removesuffix(".csv")
            count = _scalar_int(connection, f"SELECT count(*) FROM {table}")
        rows.append((name, count, path.stat().st_size, _digest(path)))
    return pl.DataFrame(
        rows,
        schema=["file", "rows", "bytes", "sha256"],
        orient="row",
    )


def _primary_keys(connection: duckdb.DuckDBPyConnection) -> pl.DataFrame:
    rows: list[tuple[str, str, int, int, int]] = []
    for table, key in PRIMARY_KEYS:
        count = _scalar_int(connection, f"SELECT count(*) FROM {table}")
        unique = _scalar_int(connection, f"SELECT count(DISTINCT {key}) FROM {table}")
        null_count = _scalar_int(
            connection, f"SELECT count(*) FILTER (WHERE {key} IS NULL) FROM {table}"
        )
        rows.append((table, key, count, count - unique, null_count))
    return pl.DataFrame(
        rows,
        schema=["table", "key", "rows", "duplicate_keys", "null_keys"],
        orient="row",
    )


def _orphans(connection: duckdb.DuckDBPyConnection) -> pl.DataFrame:
    checks = (
        ("companies.group_id", "companies c LEFT JOIN groups g USING(group_id)", "g.group_id"),
        ("banking_products.company_id", "banking_products x LEFT JOIN companies c USING(company_id)", "c.company_id"),
        ("debt_products.company_id", "debt_products x LEFT JOIN companies c USING(company_id)", "c.company_id"),
        ("transactions.company_id", "transactions x LEFT JOIN companies c USING(company_id)", "c.company_id"),
        ("invoices.company_id", "invoices x LEFT JOIN companies c USING(company_id)", "c.company_id"),
        ("balances.company_id", "balances x LEFT JOIN companies c USING(company_id)", "c.company_id"),
        ("transactions.product_id", "transactions x LEFT JOIN banking_products b USING(product_id)", "b.product_id"),
    )
    rows = [
        (
            name,
            _scalar_int(connection, f"SELECT count(*) FROM {join} WHERE {missing} IS NULL"),
        )
        for name, join, missing in checks
    ]
    return pl.DataFrame(rows, schema=["relation", "orphan_rows"], orient="row")


def _null_profile(connection: duckdb.DuckDBPyConnection) -> pl.DataFrame:
    rows: list[tuple[str, str, str, int, float]] = []
    for name in REQUIRED_FILES:
        if not name.endswith(".csv"):
            continue
        table = name.removesuffix(".csv")
        total = _scalar_int(connection, f"SELECT count(*) FROM {table}")
        for column, dtype, *_ in connection.sql(f"DESCRIBE {table}").fetchall():
            null_count = _scalar_int(
                connection,
                f'SELECT count(*) FILTER (WHERE "{column}" IS NULL) FROM {table}',
            )
            rows.append((table, str(column), str(dtype), null_count, null_count / total))
    return pl.DataFrame(
        rows,
        schema=["table", "column", "inferred_type", "null_count", "null_rate"],
        orient="row",
    )


def transaction_coverage(connection: duckdb.DuckDBPyConnection) -> pl.DataFrame:
    """Measure observed calendar months without using a reserved DuckDB alias."""
    return connection.sql(
        "SELECT company_id, "
        "count(DISTINCT date_trunc('month', date)) AS observed_months, "
        "min(date) AS first_date, max(date) AS last_date "
        "FROM transactions GROUP BY company_id"
    ).pl()


def run_audit(data_dir: Path, audit_dir: Path) -> AuditSummary:
    """Run source-level quality checks and persist inspectable evidence tables."""
    audit_dir.mkdir(parents=True, exist_ok=True)
    with duckdb.connect() as connection:
        _load_views(connection, data_dir)
        inventory = _inventory(connection, data_dir)
        keys = _primary_keys(connection)
        orphans = _orphans(connection)
        nulls = _null_profile(connection)
        coverage = transaction_coverage(connection)
        product_overlap = _scalar_int(
            connection,
            "SELECT count(*) FROM banking_products b JOIN debt_products d USING(product_id)",
        )
        schedule_from = (
            " FROM debt_schedule_config s LEFT JOIN debt_products d USING(product_id) "
            "LEFT JOIN banking_products b ON s.settlement_product_id=b.product_id"
        )
        schedules_total = _scalar_int(connection, "SELECT count(*)" + schedule_from)
        schedules_with_debt = _scalar_int(
            connection, "SELECT count(d.product_id)" + schedule_from
        )
        schedules_with_settlement = _scalar_int(
            connection, "SELECT count(b.product_id)" + schedule_from
        )
        balance_dates = _scalar_int(connection, "SELECT count(DISTINCT date) FROM balances")

    for frame, filename in (
        (inventory, "inventory.parquet"),
        (keys, "primary_keys.parquet"),
        (orphans, "referential_integrity.parquet"),
        (nulls, "null_profile.parquet"),
        (coverage, "transaction_coverage.parquet"),
    ):
        frame.write_parquet(audit_dir / filename)
    summary = AuditSummary(
        row_counts=tuple(zip(inventory["file"].to_list(), inventory["rows"].to_list(), strict=True)),
        primary_key_duplicates=tuple(zip(keys["table"].to_list(), keys["duplicate_keys"].to_list(), strict=True)),
        orphan_counts=tuple(zip(orphans["relation"].to_list(), orphans["orphan_rows"].to_list(), strict=True)),
        product_id_overlap=product_overlap,
        transaction_months_min=int(str(coverage["observed_months"].min())),
        transaction_months_median=float(str(coverage["observed_months"].median())),
        transaction_months_max=int(str(coverage["observed_months"].max())),
        companies_with_transactions=coverage.height,
        balance_snapshot_dates=balance_dates,
        schedules_total=schedules_total,
        schedules_with_debt_product=schedules_with_debt,
        schedules_with_settlement_product=schedules_with_settlement,
        invoice_direction_resolved=False,
        labels_found=False,
    )
    with (audit_dir / "summary.json").open("w", encoding="utf-8") as target:
        json.dump(asdict(summary), target, indent=2, ensure_ascii=False)
    return summary


def main() -> None:
    data_dir = Path(os.environ["EMBAT_DATA_DIR"]).expanduser().resolve()
    summary = run_audit(data_dir, Path.cwd() / "artifacts" / "audit")
    print(summary)


if __name__ == "__main__":
    main()
