import os
from pathlib import Path
from typing import Final

import polars as pl

OPERATING_INFLOW_CATEGORIES: Final[frozenset[str]] = frozenset(
    {"collection", "bulk_collection", "pos_settlement", "cash_settlement"}
)
OPERATING_OUTFLOW_CATEGORIES: Final[frozenset[str]] = frozenset(
    {
        "payment",
        "bulk_payment",
        "utility",
        "salary",
        "tax",
        "social_security",
        "fee",
    }
)
RECONCILED_STATUSES: Final[frozenset[str]] = frozenset(
    {"RECONCILIATION_COMPLETED", "ACCOUNTING_COMPLETED"}
)
MIN_OPERATING_SIDE_SHARE: Final[float] = 0.01


def build_monthly_features(
    transactions: pl.DataFrame, products: pl.DataFrame
) -> pl.DataFrame:
    """Aggregate booked movements before any cross-fact-table join."""
    product_currency = products.select("product_id", "company_id", "currency")
    joined = transactions.join(
        product_currency,
        on=["product_id", "company_id"],
        how="inner",
        validate="m:1",
    ).filter(pl.col("status") == "booked")

    is_operating_inflow = (
        pl.col("category").is_in(OPERATING_INFLOW_CATEGORIES)
        & (pl.col("amount") > 0)
    )
    is_operating_outflow = (
        pl.col("category").is_in(OPERATING_OUTFLOW_CATEGORIES)
        & (pl.col("amount") < 0)
    )
    return (
        joined.with_columns(pl.col("date").dt.month_start().cast(pl.Date).alias("month"))
        .group_by("company_id", "month", "currency")
        .agg(
            pl.len().alias("transaction_count"),
            pl.col("date").dt.date().n_unique().alias("active_days"),
            pl.col("amount").filter(is_operating_inflow).sum().alias("operating_inflow"),
            (-pl.col("amount"))
            .filter(is_operating_outflow)
            .sum()
            .alias("operating_outflow"),
            pl.col("amount").sum().alias("all_net_flow"),
            pl.col("amount").abs().sum().alias("gross_flow"),
            pl.col("accounting_status")
            .is_in(RECONCILED_STATUSES)
            .mean()
            .alias("reconciled_share"),
            pl.col("category").is_null().mean().alias("missing_category_share"),
        )
        .with_columns(
            (pl.col("operating_inflow") - pl.col("operating_outflow")).alias(
                "operating_net_flow"
            )
        )
        .sort("company_id", "currency", "month")
    )


def add_temporal_features(monthly: pl.DataFrame) -> pl.DataFrame:
    """Add calendar-window features without turning missing months into zero activity."""
    keys = ["company_id", "currency"]
    dense = (
        monthly.sort(*keys, "month")
        .with_columns(pl.lit(1).alias("is_observed"))
        .upsample(time_column="month", every="1mo", group_by=keys)
        .with_columns(pl.col("is_observed").fill_null(0))
        .sort(*keys, "month")
    )
    inflow_3m = pl.col("operating_inflow").rolling_sum(3, min_samples=1).over(keys)
    outflow_3m = pl.col("operating_outflow").rolling_sum(3, min_samples=1).over(keys)
    outflow_mean_6m = (
        pl.col("operating_outflow").rolling_mean(6, min_samples=2).over(keys)
    )
    windowed = dense.with_columns(
        pl.col("is_observed")
        .rolling_sum(6, min_samples=1)
        .over(keys)
        .alias("months_observed_6m"),
        inflow_3m.alias("operating_inflow_3m"),
        outflow_3m.alias("operating_outflow_3m"),
        outflow_mean_6m.alias("operating_outflow_mean_6m"),
        pl.col("operating_outflow")
        .rolling_std(6, min_samples=2)
        .over(keys)
        .alias("operating_outflow_std_6m"),
    ).with_columns(
        (pl.col("operating_inflow_3m") + pl.col("operating_outflow_3m")).alias(
            "operating_activity_3m"
        ),
        pl.when(pl.col("operating_outflow_mean_6m") > 0)
        .then(
            pl.col("operating_outflow_std_6m")
            / pl.col("operating_outflow_mean_6m")
        )
        .otherwise(None)
        .alias("outflow_cv_6m"),
        pl.when(
            pl.max_horizontal("operating_inflow_3m", "operating_outflow_3m") > 0
        )
        .then(
            pl.min_horizontal("operating_inflow_3m", "operating_outflow_3m")
            / pl.max_horizontal("operating_inflow_3m", "operating_outflow_3m")
        )
        .otherwise(None)
        .alias("operating_smaller_side_share_3m"),
    )
    with_status = windowed.with_columns(
        pl.when(pl.col("operating_activity_3m") <= 0)
        .then(pl.lit("no_identified_operating_activity"))
        .when(
            (pl.col("operating_inflow_3m") <= 0)
            | (pl.col("operating_outflow_3m") <= 0)
        )
        .then(pl.lit("one_sided_operating_activity"))
        .when(pl.col("operating_smaller_side_share_3m") < MIN_OPERATING_SIDE_SHARE)
        .then(pl.lit("imbalanced_operating_activity"))
        .otherwise(pl.lit("sufficient"))
        .alias("operating_signal_status")
    )
    return with_status.with_columns(
        pl.when(pl.col("operating_signal_status") == "sufficient")
        .then(
            (pl.col("operating_inflow_3m") - pl.col("operating_outflow_3m"))
            / pl.col("operating_activity_3m")
        )
        .otherwise(None)
        .alias("operating_flow_balance_3m"),
        pl.when(pl.col("operating_signal_status") == "sufficient")
        .then(
            pl.col("operating_inflow_3m") / pl.col("operating_outflow_3m")
        )
        .otherwise(None)
        .alias("inflow_outflow_ratio_3m"),
    )


def main() -> None:
    data_dir = Path(os.environ["EMBAT_DATA_DIR"]).expanduser().resolve()
    output_dir = Path.cwd() / "data" / "processed"
    output_dir.mkdir(parents=True, exist_ok=True)
    transactions = pl.scan_csv(
        data_dir / "transactions.csv", try_parse_dates=True
    ).collect(engine="streaming")
    products = pl.read_csv(data_dir / "banking_products.csv", try_parse_dates=True)
    monthly = add_temporal_features(build_monthly_features(transactions, products))
    monthly.write_parquet(output_dir / "monthly_features.parquet")
    print(f"monthly_features rows={monthly.height} companies={monthly['company_id'].n_unique()}")


if __name__ == "__main__":
    main()
