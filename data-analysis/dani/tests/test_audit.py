import duckdb

from embat_analysis.audit import transaction_coverage


def test_transaction_coverage_executes_with_duckdb_reserved_aliases() -> None:
    # Given
    with duckdb.connect() as connection:
        connection.execute("CREATE TABLE transactions(company_id VARCHAR, date DATE)")
        connection.execute(
            "INSERT INTO transactions VALUES ('COMP_1', '2026-01-01'), "
            "('COMP_1', '2026-02-01')"
        )

        # When
        coverage = transaction_coverage(connection)

    # Then
    assert coverage["observed_months"].to_list() == [2]
