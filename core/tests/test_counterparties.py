"""Las cuatro decisiones que cambian el resultado de la tabla de contrapartes.

Cada test monta un libro de facturas minimo y comprueba una sola cosa. Los
numeros estan escogidos para que la respuesta correcta y la incorrecta sean
distintas a simple vista: si alguien quita el filtro de euros o lee `status`
como bandera de vencido, el test no se queda a dos decimales, se va por ordenes
de magnitud.
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "core"))

from counterparties import Window, counterparty_sql, summary_sql  # noqa: E402
from publish_counterparties import PublicationError, publish, verify  # noqa: E402

CUTOFF = "2026-08-01"
WINDOW = Window.ending(CUTOFF)


def _book(rows: list[tuple]) -> duckdb.DuckDBPyConnection:
    """Base en memoria con las dos tablas que la agregacion necesita."""
    connection = duckdb.connect(":memory:")
    connection.execute("""
        CREATE TABLE invoices(
          operation_id VARCHAR, company_id VARCHAR, document_type VARCHAR,
          issuance_date TIMESTAMP, due_date TIMESTAMP, payment_date TIMESTAMP,
          amount DOUBLE, currency VARCHAR, exchange_rate DOUBLE,
          status VARCHAR, counterparty_id VARCHAR)
    """)
    connection.execute("CREATE TABLE companies(company_id VARCHAR, group_id VARCHAR)")
    connection.execute("INSERT INTO companies VALUES ('COMP_0001','GROUP_0001')")
    connection.executemany(
        "INSERT INTO invoices VALUES (?,?,?,?,?,?,?,?,?,?,?)", rows)
    return connection


def _invoice(operation_id, amount, *, issuance="2026-01-15", due="2026-02-15",
             payment=None, currency="EUR", rate=1.0, status="pending",
             counterparty="CP_1", company="COMP_0001"):
    return (operation_id, company, "invoice", issuance, due, payment,
            amount, currency, rate, status, counterparty)


def _rows(connection: duckdb.DuckDBPyConnection) -> list[dict]:
    return connection.sql(counterparty_sql(WINDOW)).df().to_dict("records")


def test_side_comes_from_the_amount_sign_and_weights_sum_to_one() -> None:
    # Given: two supplier invoices and one customer invoice for the same company.
    connection = _book([
        _invoice("A", -300.0, counterparty="SUP_1"),
        _invoice("B", -100.0, counterparty="SUP_2"),
        _invoice("C", 500.0, counterparty="CLI_1"),
    ])

    # When: the counterparty rows are built.
    rows = _rows(connection)

    # Then: the sign splits the book and each side's weights add up to exactly 1.
    by_side = {(row["side"], row["counterparty_id"]): row for row in rows}
    assert set(side for side, _ in by_side) == {"ap", "ar"}
    assert by_side[("ap", "SUP_1")]["weight"] == pytest.approx(0.75)
    assert by_side[("ap", "SUP_2")]["weight"] == pytest.approx(0.25)
    assert by_side[("ar", "CLI_1")]["weight"] == pytest.approx(1.0)
    for side in ("ap", "ar"):
        total = sum(row["weight"] for row in rows if row["side"] == side)
        assert total == pytest.approx(1.0)


def test_a_company_without_one_side_produces_no_rows_for_it() -> None:
    # Given: a book with suppliers only.
    connection = _book([_invoice("A", -100.0, counterparty="SUP_1")])

    # When: the rows are built.
    rows = _rows(connection)

    # Then: the empty side is absent, not present as a zero.
    assert [row["side"] for row in rows] == ["ap"]


def test_foreign_currency_is_excluded_instead_of_multiplied_by_its_rate() -> None:
    # Given: one euro invoice and one Indonesian invoice whose rate is ~19,959.
    # Multiplying would make the foreign row 66,530 times larger and hand it the
    # top slot in a table whose whole purpose is ranking by weight.
    connection = _book([
        _invoice("EUR", -300.0, counterparty="SUP_1"),
        _invoice("IDR", -20_000_000.0, currency="IDR", rate=19_959.0, counterparty="SUP_IDR"),
    ])

    # When: the rows are built.
    rows = _rows(connection)

    # Then: only the euro invoice survives, and it owns the whole side.
    assert [row["counterparty_id"] for row in rows] == ["SUP_1"]
    assert rows[0]["amount_12m"] == pytest.approx(300.0)
    assert rows[0]["weight"] == pytest.approx(1.0)


def test_eur_share_reports_the_part_of_the_book_left_out() -> None:
    # Given: half the book by amount is not in euros.
    connection = _book([
        _invoice("EUR", -100.0, counterparty="SUP_1"),
        _invoice("USD", -100.0, currency="USD", counterparty="SUP_2"),
    ])
    connection.execute("CREATE TABLE company_counterparties AS " + counterparty_sql(WINDOW))

    # When: the summary is built.
    summary = connection.sql(summary_sql(WINDOW)).df().to_dict("records")[0]

    # Then: it says so instead of implying the table covers everything.
    assert summary["eur_share"] == pytest.approx(0.5)
    assert summary["n_counterparties"] == 1


def test_live_overdue_ignores_status_as_a_flag_and_clears_what_was_paid() -> None:
    # Given: three invoices all still flagged overdue by `status`, which this
    # dataset never clears — one paid long before the cutoff, one paid after it,
    # one never paid. Reading `status` would bucket all three as overdue.
    connection = _book([
        _invoice("PAID", -100.0, due="2026-03-15", payment="2026-03-20", status="paid"),
        _invoice("LATER", -200.0, due="2026-03-15", payment="2026-09-20", status="paid"),
        _invoice("OPEN", -400.0, due="2026-07-20", status="overdue"),
    ])

    # When: the rows are built at the cutoff.
    row = _rows(connection)[0]

    # Then: the one settled before the cutoff is gone, the one settled after it
    # is still overdue AT the cutoff, and each lands in the bucket its own age
    # dictates: 2026-03-15 -> 2026-08-01 is 139 days, 2026-07-20 -> 12.
    assert row["overdue_total"] == pytest.approx(600.0)
    assert row["overdue_90_plus"] == pytest.approx(200.0)
    assert row["overdue_0_30"] == pytest.approx(400.0)
    assert row["overdue_31_60"] == pytest.approx(0.0)
    assert row["overdue_61_90"] == pytest.approx(0.0)
    # The buckets partition the total: nothing counted twice, nothing dropped.
    assert sum(row[name] for name, _, _ in
               (("overdue_0_30", 0, 0), ("overdue_31_60", 0, 0),
                ("overdue_61_90", 0, 0), ("overdue_90_plus", 0, 0))
               ) == pytest.approx(row["overdue_total"])


def test_deviation_is_amount_weighted_because_the_median_is_zero() -> None:
    # Given: a big invoice paid on the due date and a small one paid 40 days
    # late. The median deviation is 0, which is what the real book looks like:
    # half of all invoices pay on the dot, so a median column is a wall of zeros.
    connection = _book([
        _invoice("BIG", -900.0, due="2026-02-15", payment="2026-02-15", status="paid"),
        _invoice("SMALL", -100.0, due="2026-02-15", payment="2026-03-27", status="paid"),
    ])

    # When: the rows are built.
    row = _rows(connection)[0]

    # Then: the weighted mean carries the small late invoice at its true weight,
    # and the late share is reported separately.
    assert row["days_late_w"] == pytest.approx(4.0)
    assert row["pct_late"] == pytest.approx(0.5)


def test_unpaid_invoices_never_contribute_a_deviation() -> None:
    # Given: `payment_date` is populated on unpaid invoices too (237,593 of them
    # in the real dataset), so it is only trustworthy next to `status = 'paid'`.
    connection = _book([
        _invoice("GHOST", -100.0, due="2026-02-15", payment="2026-06-15", status="overdue"),
    ])

    # When: the rows are built.
    row = _rows(connection)[0]

    # Then: no deviation is invented from a payment that never happened.
    assert row["days_late_w"] is None or row["days_late_w"] != row["days_late_w"]
    assert row["pct_late"] is None or row["pct_late"] != row["pct_late"]


def test_sparkline_has_one_entry_per_window_month_with_explicit_zeros() -> None:
    # Given: a relationship that invoices in two months and then stops.
    connection = _book([
        _invoice("A", -100.0, issuance="2025-10-10", due="2025-11-10"),
        _invoice("B", -50.0, issuance="2025-11-10", due="2025-12-10"),
    ])

    # When: the rows are built.
    row = _rows(connection)[0]

    # Then: twelve points, and the months it stopped read zero rather than gone
    # missing — a relationship going quiet is the signal, not absent data.
    spark = row["sparkline_12"]
    values = spark if isinstance(spark, list) else __import__("json").loads(spark)
    assert len(values) == 12
    assert values[1] == pytest.approx(100.0)
    assert values[2] == pytest.approx(50.0)
    assert values[-1] == pytest.approx(0.0)


def test_publish_writes_both_tables_and_rejects_weights_that_drift() -> None:
    # Given: a publishable book.
    connection = _book([
        _invoice("A", -300.0, counterparty="SUP_1"),
        _invoice("B", -100.0, counterparty="SUP_2"),
    ])

    # When: it is published.
    summary = publish(connection, WINDOW)

    # Then: both tables land with the cutoff month and the company counted once.
    assert summary.counterparty_rows == 2
    assert summary.summary_rows == 1
    assert summary.companies == 1
    assert summary.month == "2026-08"

    # And when a weight is corrupted, the readback refuses to call it published:
    # concentration is the column the table is sorted by, so a drifting weight
    # is not a rounding detail, it is the table lying about who matters.
    connection.execute("UPDATE company_counterparties SET weight = 0.1")
    with pytest.raises(PublicationError):
        verify(connection, WINDOW)


def test_window_covers_twelve_months_ending_at_the_cutoff() -> None:
    # Given/When: the window for the engine cutoff.
    window = Window.ending("2026-08-01")

    # Then: it starts twelve months earlier, so the sparkline has twelve points.
    assert window.start == "2025-09-01"
    assert window.month == "2026-08"
    assert Window.ending("2026-12-31").start == "2026-01-01"
