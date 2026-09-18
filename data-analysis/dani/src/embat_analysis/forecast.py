from datetime import date
from itertools import pairwise
from pathlib import Path

import polars as pl


def evaluate_forecasts(monthly: pl.DataFrame, horizon_months: int) -> pl.DataFrame:
    """Evaluate walk-forward naive, seasonal, and rolling-mean forecasts."""
    records: list[tuple[str, str, str, date, float, float]] = []
    for group in monthly.sort("month").partition_by(
        ["company_id", "currency"], maintain_order=True
    ):
        company_id = str(group["company_id"][0])
        currency = str(group["currency"][0])
        values = group["operating_net_flow"].to_list()
        months = group["month"].to_list()
        month_numbers = [month.year * 12 + month.month for month in months]
        is_contiguous = all(
            current - previous == 1
            for previous, current in pairwise(month_numbers)
        )
        first_test = len(values) - horizon_months
        if first_test < 12 or group["operating_net_flow"].null_count() > 0 or not is_contiguous:
            continue
        for index in range(first_test, len(values)):
            actual = float(str(values[index]))
            candidates = (
                ("naive_last", float(str(values[index - 1]))),
                ("seasonal_12m", float(str(values[index - 12]))),
                (
                    "rolling_mean_3m",
                    sum(float(str(value)) for value in values[index - 3 : index]) / 3.0,
                ),
            )
            month = months[index]
            assert isinstance(month, date)
            for model, prediction in candidates:
                records.append(
                    (company_id, currency, model, month, actual, prediction)
                )
    schema = {
        "company_id": pl.String,
        "currency": pl.String,
        "model": pl.String,
        "month": pl.Date,
        "actual": pl.Float64,
        "prediction": pl.Float64,
    }
    return pl.DataFrame(records, schema=schema, orient="row").with_columns(
        (pl.col("prediction") - pl.col("actual")).alias("error")
    )


def summarize_forecasts_by_series(evaluation: pl.DataFrame) -> pl.DataFrame:
    """Normalize forecast error within each company-currency series."""
    return (
        evaluation.group_by("company_id", "currency", "model")
        .agg(
            pl.len().alias("n_predictions"),
            pl.col("error").abs().mean().alias("mae_currency_units"),
            pl.col("error").abs().sum().alias("absolute_error_sum"),
            pl.col("actual").abs().sum().alias("absolute_actual_sum"),
            pl.when(
                (pl.col("actual").abs() + pl.col("prediction").abs()) > 0
            )
            .then(
                2.0
                * pl.col("error").abs()
                / (pl.col("actual").abs() + pl.col("prediction").abs())
            )
            .otherwise(None)
            .mean()
            .alias("series_smape"),
        )
        .with_columns(
            pl.when(pl.col("absolute_actual_sum") > 0)
            .then(pl.col("absolute_error_sum") / pl.col("absolute_actual_sum"))
            .otherwise(None)
            .alias("series_wape")
        )
    )


def summarize_forecasts_macro(evaluation: pl.DataFrame) -> pl.DataFrame:
    """Aggregate normalized series metrics with equal series weight."""
    return (
        summarize_forecasts_by_series(evaluation)
        .group_by("model")
        .agg(
            pl.len().alias("n_series"),
            pl.col("n_predictions").sum().alias("n_predictions"),
            pl.col("series_wape").mean().alias("mean_series_wape"),
            pl.col("series_wape").median().alias("median_series_wape"),
            pl.col("series_smape").mean().alias("mean_series_smape"),
            pl.col("series_smape").median().alias("median_series_smape"),
        )
        .sort("mean_series_wape")
    )


def summarize_forecasts_by_currency(evaluation: pl.DataFrame) -> pl.DataFrame:
    """Report monetary errors only within their original currency."""
    return (
        evaluation.group_by("currency", "model")
        .agg(
            pl.col("company_id").n_unique().alias("n_series"),
            pl.len().alias("n_predictions"),
            pl.col("error").abs().mean().alias("mae_currency_units"),
            pl.when(pl.col("actual").abs().sum() > 0)
            .then(pl.col("error").abs().sum() / pl.col("actual").abs().sum())
            .otherwise(None)
            .alias("wape_within_currency"),
            pl.when(
                (pl.col("actual").abs() + pl.col("prediction").abs()) > 0
            )
            .then(
                2.0
                * pl.col("error").abs()
                / (pl.col("actual").abs() + pl.col("prediction").abs())
            )
            .otherwise(None)
            .mean()
            .alias("smape_within_currency"),
        )
        .sort("currency", "wape_within_currency")
    )


def main() -> None:
    root = Path.cwd()
    monthly = pl.read_parquet(root / "data" / "processed" / "monthly_features.parquet")
    evaluation = evaluate_forecasts(monthly, horizon_months=3)
    output = root / "artifacts" / "forecast"
    output.mkdir(parents=True, exist_ok=True)
    evaluation.write_parquet(output / "evaluation.parquet")
    summarize_forecasts_by_series(evaluation).write_parquet(
        output / "metrics_by_series.parquet"
    )
    summarize_forecasts_by_currency(evaluation).write_parquet(
        output / "metrics_by_currency.parquet"
    )
    summarize_forecasts_macro(evaluation).write_parquet(output / "metrics.parquet")


if __name__ == "__main__":
    main()
