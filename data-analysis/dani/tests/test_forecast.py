from datetime import date

import polars as pl

from embat_analysis.forecast import (
    evaluate_forecasts,
    summarize_forecasts_by_series,
    summarize_forecasts_macro,
)


def test_forecast_evaluation_uses_only_values_before_each_origin() -> None:
    # Given
    values = [float(index) for index in range(1, 16)]
    monthly = pl.DataFrame(
        {
            "company_id": ["COMP_1"] * len(values),
            "currency": ["EUR"] * len(values),
            "month": [date(2025, month, 1) for month in range(1, 13)]
            + [date(2026, month, 1) for month in range(1, 4)],
            "operating_net_flow": values,
        }
    )

    # When
    evaluation = evaluate_forecasts(monthly, horizon_months=3)

    # Then
    naive = evaluation.filter(pl.col("model") == "naive_last")
    assert naive["prediction"].to_list() == [12.0, 13.0, 14.0]
    assert naive["actual"].to_list() == [13.0, 14.0, 15.0]


def test_forecast_evaluation_skips_series_with_missing_months() -> None:
    # Given
    monthly = pl.DataFrame(
        {
            "company_id": ["COMP_1"] * 15,
            "currency": ["EUR"] * 15,
            "month": [date(2025, month, 1) for month in range(1, 13)]
            + [date(2026, month, 1) for month in range(1, 4)],
            "operating_net_flow": [float(index) for index in range(1, 14)]
            + [None, 15.0],
        }
    )

    # When
    evaluation = evaluate_forecasts(monthly, horizon_months=3)

    # Then
    assert evaluation.is_empty()


def test_macro_forecast_metrics_are_invariant_to_currency_rescaling() -> None:
    # Given
    evaluation = pl.DataFrame(
        {
            "company_id": ["A", "A", "B", "B"],
            "currency": ["EUR", "EUR", "JPY", "JPY"],
            "model": ["naive_last"] * 4,
            "month": [date(2026, 1, 1), date(2026, 2, 1)] * 2,
            "actual": [100.0, 200.0, 10.0, 20.0],
            "prediction": [90.0, 220.0, 9.0, 22.0],
            "error": [-10.0, 20.0, -1.0, 2.0],
        }
    )
    rescaled = evaluation.with_columns(
        pl.when(pl.col("currency") == "JPY")
        .then(pl.col("actual") * 100.0)
        .otherwise(pl.col("actual"))
        .alias("actual"),
        pl.when(pl.col("currency") == "JPY")
        .then(pl.col("prediction") * 100.0)
        .otherwise(pl.col("prediction"))
        .alias("prediction"),
        pl.when(pl.col("currency") == "JPY")
        .then(pl.col("error") * 100.0)
        .otherwise(pl.col("error"))
        .alias("error"),
    )

    # When
    original_metrics = summarize_forecasts_macro(evaluation)
    rescaled_metrics = summarize_forecasts_macro(rescaled)

    # Then
    assert original_metrics["mean_series_wape"].to_list() == rescaled_metrics[
        "mean_series_wape"
    ].to_list()


def test_zero_actual_volume_does_not_create_interpretable_wape() -> None:
    # Given
    evaluation = pl.DataFrame(
        {
            "company_id": ["A"],
            "currency": ["EUR"],
            "model": ["naive_last"],
            "month": [date(2026, 1, 1)],
            "actual": [0.0],
            "prediction": [0.0],
            "error": [0.0],
        }
    )

    # When
    metrics = summarize_forecasts_by_series(evaluation)

    # Then
    assert metrics["series_wape"].to_list() == [None]
    assert metrics["series_smape"].to_list() == [None]
