from dataclasses import dataclass
from pathlib import Path
from typing import Final

import polars as pl

SCORE_INTERCEPT: Final[float] = 50.0


@dataclass(frozen=True, slots=True)
class ScoreWeights:
    """Weights for independent level signals."""

    flow_balance: float
    stability: float

    @classmethod
    def baseline(cls) -> "ScoreWeights":
        """Return the documented baseline weights."""
        return cls(flow_balance=0.70, stability=0.30)


def score_monthly_features(
    features: pl.DataFrame, weights: ScoreWeights
) -> pl.DataFrame:
    """Score eligible rows and keep data coverage separate from financial health."""
    flow_balance_component = (
        weights.flow_balance
        * 50.0
        * (pl.col("operating_flow_balance_3m") / 0.35).tanh()
    )
    stability_component = (
        weights.stability * 50.0 * ((0.75 - pl.col("outflow_cv_6m")) / 0.50).tanh()
    )
    flow_balance_valid = (
        pl.col("operating_flow_balance_3m").is_not_null()
        & pl.col("operating_flow_balance_3m").is_finite()
    )
    stability_valid = (
        pl.col("outflow_cv_6m").is_not_null()
        & pl.col("outflow_cv_6m").is_finite()
    )
    eligible = (
        (pl.col("months_observed_6m") >= 3)
        & (pl.col("operating_signal_status") == "sufficient")
        & flow_balance_valid
        & stability_valid
    )
    eligibility = features.with_columns(
        eligible.alias("score_eligible"),
        pl.when(pl.col("months_observed_6m") < 3)
        .then(pl.lit("insufficient_history"))
        .when(pl.col("operating_signal_status") != "sufficient")
        .then(pl.col("operating_signal_status"))
        .when(~flow_balance_valid)
        .then(pl.lit("missing_operating_flow_balance"))
        .when(~stability_valid)
        .then(pl.lit("missing_outflow_stability"))
        .otherwise(None)
        .alias("score_reason"),
    )
    with_contributions = eligibility.with_columns(
        pl.when(pl.col("score_eligible"))
        .then(flow_balance_component)
        .otherwise(None)
        .alias("contribution_flow_balance"),
        pl.when(pl.col("score_eligible"))
        .then(stability_component)
        .otherwise(None)
        .alias("contribution_stability"),
        pl.when(pl.col("score_eligible"))
        .then(pl.lit(SCORE_INTERCEPT))
        .otherwise(None)
        .alias("score_intercept"),
    ).with_columns(
        (
            pl.col("contribution_flow_balance")
            + pl.col("contribution_stability")
        ).alias("raw_contribution_sum")
    ).with_columns(
        (pl.col("score_intercept") + pl.col("raw_contribution_sum")).alias(
            "preclip_score"
        )
    )
    return with_contributions.with_columns(
        pl.when(pl.col("score_eligible"))
        .then(pl.col("preclip_score").clip(0.0, 100.0))
        .otherwise(None)
        .alias("score"),
        pl.when(pl.col("score_eligible"))
        .then(pl.col("preclip_score").clip(0.0, 100.0) - pl.col("preclip_score"))
        .otherwise(None)
        .alias("clip_adjustment"),
        pl.when(~pl.col("score_eligible"))
        .then(pl.lit("insufficient_data"))
        .when(pl.col("months_observed_6m") < 6)
        .then(pl.lit("partial"))
        .otherwise(pl.lit("available"))
        .alias("quality_status"),
        (pl.col("months_observed_6m") / 6.0).clip(0.0, 1.0).alias("coverage_ratio"),
    )


def add_trajectory(scored: pl.DataFrame) -> pl.DataFrame:
    """Add three-month direction and persistent alerts without future information."""
    keys = ["company_id", "currency"]
    ordered = scored.sort(*keys, "month").with_columns(
        (pl.col("score") - pl.col("score").shift(1).over(keys)).alias("score_delta_1m"),
        (pl.col("score") - pl.col("score").shift(3).over(keys)).alias("score_delta_3m"),
    )
    persistence = ordered.with_columns(
        (pl.col("score_delta_1m") >= 1.0)
        .cast(pl.Int8)
        .rolling_sum(3, min_samples=1)
        .over(keys)
        .alias("positive_steps_3m"),
        (pl.col("score_delta_1m") <= -1.0)
        .cast(pl.Int8)
        .rolling_sum(3, min_samples=1)
        .over(keys)
        .alias("negative_steps_3m"),
    )
    with_regime = persistence.with_columns(
        pl.when(pl.col("score_delta_3m") >= 4.0)
        .then(pl.lit("improving"))
        .when(pl.col("score_delta_3m") <= -4.0)
        .then(pl.lit("deteriorating"))
        .when(pl.col("score_delta_3m").is_not_null())
        .then(pl.lit("stable"))
        .otherwise(pl.lit("unknown"))
        .alias("trajectory_direction"),
        pl.when(
            (pl.col("score_delta_3m") >= 4.0)
            & (pl.col("positive_steps_3m") >= 2)
        )
        .then(pl.lit("persistent_improvement"))
        .when(
            (pl.col("score_delta_3m") <= -4.0)
            & (pl.col("negative_steps_3m") >= 2)
        )
        .then(pl.lit("persistent_deterioration"))
        .when(pl.col("score_delta_1m").abs() >= 8.0)
        .then(pl.lit("possible_blip"))
        .when(pl.col("score").is_not_null())
        .then(pl.lit("stable"))
        .otherwise(pl.lit("unknown"))
        .alias("online_regime"),
        (
            (pl.col("score_delta_1m").abs() >= 8.0)
            & (
                (
                    pl.col("score").shift(-2).over(keys)
                    - pl.col("score").shift(1).over(keys)
                ).abs()
                <= 4.0
            )
        )
        .fill_null(False)
        .alias("retrospective_reversal_confirmed"),
    )
    with_alert_kind = with_regime.with_columns(
        pl.when(
            (pl.col("online_regime") == "persistent_improvement")
            & (pl.col("score_delta_3m") >= 8.0)
        )
        .then(pl.lit("improvement"))
        .when(
            (pl.col("online_regime") == "persistent_deterioration")
            & (pl.col("score_delta_3m") <= -8.0)
        )
        .then(pl.lit("deterioration"))
        .otherwise(None)
        .alias("alert_kind")
    )
    return with_alert_kind.with_columns(
        pl.col("alert_kind").is_not_null().alias("alert")
    )


def main() -> None:
    root = Path.cwd()
    features = pl.read_parquet(root / "data" / "processed" / "monthly_features.parquet")
    output = root / "artifacts" / "score"
    output.mkdir(parents=True, exist_ok=True)
    alternatives = (
        ("baseline", ScoreWeights.baseline()),
        ("balance_heavy", ScoreWeights(flow_balance=0.85, stability=0.15)),
        ("stability_heavy", ScoreWeights(flow_balance=0.55, stability=0.45)),
    )
    frames = [
        add_trajectory(score_monthly_features(features, weights)).with_columns(
            pl.lit(name).alias("score_variant")
        )
        for name, weights in alternatives
    ]
    sensitivity = pl.concat(frames)
    sensitivity.write_parquet(output / "sensitivity.parquet")
    baseline = sensitivity.filter(pl.col("score_variant") == "baseline")
    baseline.write_parquet(output / "scores.parquet")
    print(
        f"scores rows={baseline.height} scored={baseline['score'].is_not_null().sum()} "
        f"companies={baseline['company_id'].n_unique()}"
    )


if __name__ == "__main__":
    main()
