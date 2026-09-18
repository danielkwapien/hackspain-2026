import polars as pl

from embat_analysis.scoring import ScoreWeights, add_trajectory, score_monthly_features


def test_score_contributions_add_to_preclip_score_when_features_present() -> None:
    # Given
    features = pl.DataFrame(
        {
            "company_id": ["COMP_1"],
            "month": ["2026-06-01"],
            "currency": ["EUR"],
            "months_observed_6m": [6],
            "operating_flow_balance_3m": [0.20],
            "operating_signal_status": ["sufficient"],
            "inflow_outflow_ratio_3m": [1.25],
            "outflow_cv_6m": [0.30],
        }
    ).with_columns(pl.col("month").str.to_date())

    # When
    scored = score_monthly_features(features, ScoreWeights.baseline())

    # Then
    row = scored.row(0, named=True)
    contribution_sum = row["contribution_flow_balance"] + row["contribution_stability"]
    assert "contribution_coverage" not in scored.columns
    assert abs(row["preclip_score"] - (row["score_intercept"] + contribution_sum)) < 1e-9
    assert abs(row["score"] - (row["preclip_score"] + row["clip_adjustment"])) < 1e-9


def test_sparse_history_reduces_coverage_without_reducing_health_score() -> None:
    # Given
    features = pl.DataFrame(
        {
            "company_id": ["COMP_1", "COMP_2"],
            "month": ["2026-06-01", "2026-06-01"],
            "currency": ["EUR", "EUR"],
            "months_observed_6m": [6, 2],
            "operating_flow_balance_3m": [0.10, 0.10],
            "operating_signal_status": ["sufficient", "sufficient"],
            "inflow_outflow_ratio_3m": [1.10, 1.10],
            "outflow_cv_6m": [0.40, 0.40],
        }
    ).with_columns(pl.col("month").str.to_date())

    # When
    scored = score_monthly_features(features, ScoreWeights.baseline()).sort("company_id")

    # Then
    assert scored["score"].to_list() == [scored["score"][0], None]
    assert scored["quality_status"].to_list() == ["available", "insufficient_data"]
    assert scored["score_reason"].to_list() == [None, "insufficient_history"]


def test_score_does_not_depend_on_redundant_inflow_outflow_ratio() -> None:
    # Given
    features = pl.DataFrame(
        {
            "company_id": ["COMP_1", "COMP_2"],
            "month": ["2026-06-01", "2026-06-01"],
            "currency": ["EUR", "EUR"],
            "months_observed_6m": [6, 6],
            "operating_flow_balance_3m": [0.2, 0.2],
            "operating_signal_status": ["sufficient", "sufficient"],
            "inflow_outflow_ratio_3m": [1.2, 999.0],
            "outflow_cv_6m": [0.4, 0.4],
        }
    ).with_columns(pl.col("month").str.to_date())

    # When
    scored = score_monthly_features(features, ScoreWeights.baseline())

    # Then
    assert scored["score"].n_unique() == 1


def test_partial_requires_a_calculable_score() -> None:
    # Given
    features = pl.DataFrame(
        {
            "company_id": ["COMP_1", "COMP_2"],
            "month": ["2026-06-01", "2026-06-01"],
            "currency": ["EUR", "EUR"],
            "months_observed_6m": [4, 4],
            "operating_flow_balance_3m": [0.1, 0.1],
            "operating_signal_status": ["sufficient", "sufficient"],
            "inflow_outflow_ratio_3m": [1.1, 1.1],
            "outflow_cv_6m": [0.4, None],
        }
    ).with_columns(pl.col("month").str.to_date())

    # When
    scored = score_monthly_features(features, ScoreWeights.baseline()).sort("company_id")

    # Then
    assert scored["quality_status"].to_list() == ["partial", "insufficient_data"]
    assert scored["score"].is_not_null().to_list() == [True, False]
    assert scored["score_reason"].to_list() == [None, "missing_outflow_stability"]


def test_no_or_one_sided_operating_activity_is_insufficient_not_negative_health() -> None:
    # Given
    features = pl.DataFrame(
        {
            "company_id": ["NO_ACTIVITY", "INFLOW_ONLY"],
            "month": ["2026-06-01", "2026-06-01"],
            "currency": ["EUR", "EUR"],
            "months_observed_6m": [6, 6],
            "operating_flow_balance_3m": [None, None],
            "operating_signal_status": [
                "no_identified_operating_activity",
                "one_sided_operating_activity",
            ],
            "inflow_outflow_ratio_3m": [None, None],
            "outflow_cv_6m": [0.0, None],
        }
    ).with_columns(pl.col("month").str.to_date())

    # When
    scored = score_monthly_features(features, ScoreWeights.baseline()).sort("company_id")

    # Then
    assert scored["score"].to_list() == [None, None]
    assert scored["quality_status"].to_list() == ["insufficient_data", "insufficient_data"]
    assert scored["score_reason"].to_list() == [
        "one_sided_operating_activity",
        "no_identified_operating_activity",
    ]
    assert scored["contribution_stability"].to_list() == [None, None]


def test_alert_requires_persistent_regime_and_uses_contract_kind() -> None:
    # Given
    scored = pl.DataFrame(
        {
            "company_id": ["COMP_1"] * 5,
            "currency": ["EUR"] * 5,
            "month": ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"],
            "score": [50.0, 50.0, 50.0, 40.0, 50.0],
        }
    ).with_columns(pl.col("month").str.to_date())

    # When
    result = add_trajectory(scored)

    # Then
    assert result["online_regime"].to_list()[3] == "possible_blip"
    assert result["alert"].to_list()[3] is False
    assert result["alert_kind"].to_list()[3] is None


def test_persistent_alert_uses_dashboard_enum() -> None:
    # Given
    scored = pl.DataFrame(
        {
            "company_id": ["COMP_1"] * 4,
            "currency": ["EUR"] * 4,
            "month": ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"],
            "score": [50.0, 53.0, 57.0, 61.0],
        }
    ).with_columns(pl.col("month").str.to_date())

    # When
    result = add_trajectory(scored)

    # Then
    assert result["online_regime"].to_list()[-1] == "persistent_improvement"
    assert result["alert"].to_list()[-1] is True
    assert result["alert_kind"].to_list()[-1] == "improvement"


def test_online_trajectory_does_not_change_when_future_month_is_appended() -> None:
    # Given
    base = pl.DataFrame(
        {
            "company_id": ["COMP_1"] * 4,
            "currency": ["EUR"] * 4,
            "month": ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"],
            "score": [50.0, 52.0, 54.0, 58.0],
        }
    ).with_columns(pl.col("month").str.to_date())
    with_future = pl.concat(
        [
            base,
            pl.DataFrame(
                {
                    "company_id": ["COMP_1"],
                    "currency": ["EUR"],
                    "month": ["2026-05-01"],
                    "score": [5.0],
                }
            ).with_columns(pl.col("month").str.to_date()),
        ]
    )

    # When
    base_result = add_trajectory(base).filter(pl.col("month") == pl.date(2026, 4, 1))
    future_result = add_trajectory(with_future).filter(
        pl.col("month") == pl.date(2026, 4, 1)
    )

    # Then
    assert base_result["online_regime"].to_list() == future_result[
        "online_regime"
    ].to_list()
    assert base_result["trajectory_direction"].to_list() == future_result[
        "trajectory_direction"
    ].to_list()
