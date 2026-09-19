from __future__ import annotations

import argparse
import hashlib
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

import duckdb
import pandas as pd  # noqa: PANDAS_OK

from publication_rows import PublicationRows, build_publication_rows
from publication_schema import DERIVED_TABLES, SCORE_COLUMNS, SUMMARY_DDL

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "core" / "outputs" / "scores_embat.json"


class PublicationContractError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason

    def __str__(self) -> str:
        return self.reason


@dataclass(frozen=True, slots=True)
class PublicationSummary:
    source_md5: str
    group_rows: int
    company_rows: int
    group_payload_sha256: str
    company_payload_sha256: str


def _token_from_env_file() -> str | None:
    env_path = ROOT / "app" / "api" / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() in {"MOTHERDUCK_TOKEN", "motherduck_token"}:
            return value.strip().strip("\"'")
    return None


def _connect(database: str) -> duckdb.DuckDBPyConnection:
    if not database.startswith("md:"):
        return duckdb.connect(database)
    token = os.environ.get("MOTHERDUCK_TOKEN") or os.environ.get("motherduck_token")
    token = token or _token_from_env_file()
    if token is None:
        raise PublicationContractError("MOTHERDUCK_TOKEN is required for cloud publication")
    return duckdb.connect(database, config={"motherduck_token": token})


def _load_source(path: Path) -> tuple[dict, str]:
    encoded = path.read_bytes()
    try:
        payload = json.loads(encoded)
    except json.JSONDecodeError as error:
        raise PublicationContractError(f"invalid publication JSON: {error.msg}") from error
    required = {
        "model_version", "params_version", "data_version", "cutoff_date",
        "generated_at", "groups", "companies",
    }
    missing = sorted(required.difference(payload))
    if missing:
        raise PublicationContractError(f"missing publication fields: {', '.join(missing)}")
    if payload["model_version"] != "embat-layered-v1":
        raise PublicationContractError("source model_version must remain embat-layered-v1")
    return payload, hashlib.md5(encoded).hexdigest()


def _insert_rows(
    connection: duckdb.DuckDBPyConnection,
    table: str,
    columns: tuple[str, ...],
    rows: list[tuple],
) -> None:
    if not rows:
        return
    stage = f"xr033_{table}_stage"
    for offset in range(0, len(rows), 50_000):
        frame = pd.DataFrame.from_records(rows[offset: offset + 50_000], columns=columns)
        connection.register(stage, frame)
        connection.execute(f"INSERT INTO {table} SELECT * FROM {stage}")
        connection.unregister(stage)


def _write_transaction(connection: duckdb.DuckDBPyConnection, publication: PublicationRows) -> None:
    connection.execute("BEGIN TRANSACTION")
    try:
        for table, (ddl, columns) in DERIVED_TABLES.items():
            connection.execute(f"CREATE OR REPLACE TABLE {table} ({ddl})")
            _insert_rows(connection, table, columns, publication.tables[table])
        connection.execute(f"""
            CREATE OR REPLACE TABLE group_company_summary ({SUMMARY_DDL});
            INSERT INTO group_company_summary
            SELECT group_id, month,
                   count(score)::INTEGER AS n_companies_scored,
                   max(score) - min(score) AS dispersion,
                   arg_min(company_id, score) FILTER (WHERE score IS NOT NULL) AS weakest_company,
                   min(score) AS weakest_score,
                   arg_max(company_id, score) FILTER (WHERE score IS NOT NULL) AS strongest_company,
                   max(score) AS strongest_score,
                   any_value(params_version), any_value(source_md5), any_value(generated_at)
            FROM company_scores GROUP BY group_id, month;
        """)
        connection.execute("COMMIT")
    except duckdb.Error:
        connection.execute("ROLLBACK")
        raise


def _verify(connection: duckdb.DuckDBPyConnection, expected: PublicationRows) -> PublicationSummary:
    export = connection.sql("""
        SELECT source_md5,n_group_rows,n_company_rows,
               json_extract_string(metadata,'$.group_payload_sha256'),
               json_extract_string(metadata,'$.company_payload_sha256')
        FROM engine_exports
    """).fetchone()
    if export is None:
        raise PublicationContractError("engine_exports is empty after publication")
    actual_group_rows = connection.sql("SELECT count(*) FROM group_scores").fetchone()[0]
    actual_company_rows = connection.sql("SELECT count(*) FROM company_scores").fetchone()[0]
    actual = PublicationSummary(export[0], actual_group_rows, actual_company_rows, export[3], export[4])
    wanted = PublicationSummary(
        expected.source_md5,
        expected.group_rows,
        expected.company_rows,
        expected.group_payload_sha256,
        expected.company_payload_sha256,
    )
    if actual != wanted or export[1:3] != (wanted.group_rows, wanted.company_rows):
        raise PublicationContractError("publication readback count or hash mismatch")
    return actual


def publish(source: Path, database: str) -> PublicationSummary:
    payload, source_md5 = _load_source(source)
    try:
        publication = build_publication_rows(payload, source_md5)
    except (KeyError, TypeError, ValueError) as error:
        raise PublicationContractError(str(error)) from error
    with _connect(database) as connection:
        _write_transaction(connection, publication)
        return _verify(connection, publication)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish XR-033 engine tables transactionally.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--database", required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    summary = publish(args.input, args.database)
    print(json.dumps(asdict(summary), sort_keys=True))


if __name__ == "__main__":
    main()
