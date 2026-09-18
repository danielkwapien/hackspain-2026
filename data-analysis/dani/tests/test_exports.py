from pathlib import Path

import polars as pl

from embat_analysis.exports import (
    numeric_or_none,
    remove_stale_results,
    select_representative_cases,
    series_filename,
)


def test_numeric_or_none_preserves_missing_contribution() -> None:
    # Given
    value = None

    # When
    result = numeric_or_none(value)

    # Then
    assert result is None


def test_series_filename_prevents_company_currency_collisions() -> None:
    # Given
    company_id = "COMP_1"

    # When
    eur = series_filename(company_id, "EUR")
    usd = series_filename(company_id, "USD")

    # Then
    assert eur == "COMP_1__EUR.json"
    assert eur != usd


def test_remove_stale_results_makes_result_set_idempotent(tmp_path: Path) -> None:
    # Given
    expected = tmp_path / "COMP_1__EUR.json"
    stale = tmp_path / "COMP_OLD__EUR.json"
    expected.write_text("{}", encoding="utf-8")
    stale.write_text("{}", encoding="utf-8")

    # When
    removed = remove_stale_results(tmp_path, frozenset({expected.name}))

    # Then
    assert removed == (stale.name,)
    assert sorted(path.name for path in tmp_path.glob("*.json")) == [expected.name]


def test_representative_case_selection_is_stable_across_input_order() -> None:
    # Given
    rows = pl.DataFrame(
        {
            "company_id": ["B", "A", "D", "C"],
            "currency": ["EUR"] * 4,
            "month": ["2026-09-01"] * 4,
            "score": [80.0, 80.0, 20.0, 20.0],
            "score_delta_3m": [10.0, 10.0, -10.0, -10.0],
            "online_regime": [
                "persistent_improvement",
                "persistent_improvement",
                "persistent_deterioration",
                "persistent_deterioration",
            ],
        }
    ).with_columns(pl.col("month").str.to_date())

    # When
    forward = select_representative_cases(rows)
    reversed_rows = select_representative_cases(rows.reverse())

    # Then
    assert forward.select("company_id", "currency").to_dicts() == reversed_rows.select(
        "company_id", "currency"
    ).to_dicts()
