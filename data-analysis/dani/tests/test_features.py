from datetime import date

import polars as pl

from embat_analysis.features import add_temporal_features, build_monthly_features


def test_monthly_features_preserve_currency_and_exclude_pending_transactions() -> None:
    # Given
    transactions = pl.DataFrame(
        {
            "company_id": ["COMP_1", "COMP_1", "COMP_1"],
            "product_id": ["P_EUR", "P_EUR", "P_GBP"],
            "date": [
                date(2026, 1, 3),
                date(2026, 1, 5),
                date(2026, 1, 7),
            ],
            "amount": [100.0, -40.0, 200.0],
            "status": ["booked", "pending", "booked"],
            "accounting_status": ["RECONCILIATION_COMPLETED", None, "PENDING"],
            "category": ["collection", "payment", "collection"],
        }
    )
    products = pl.DataFrame(
        {
            "product_id": ["P_EUR", "P_GBP"],
            "company_id": ["COMP_1", "COMP_1"],
            "currency": ["EUR", "GBP"],
        }
    )

    # When
    monthly = build_monthly_features(transactions, products).sort("currency")

    # Then
    assert monthly["currency"].to_list() == ["EUR", "GBP"]
    assert monthly["transaction_count"].to_list() == [1, 1]
    assert monthly["operating_net_flow"].to_list() == [100.0, 200.0]
    assert monthly["month"].to_list() == [date(2026, 1, 1), date(2026, 1, 1)]


def test_monthly_features_aggregate_before_joining_other_facts() -> None:
    # Given
    transactions = pl.DataFrame(
        {
            "company_id": ["COMP_1", "COMP_1"],
            "product_id": ["P_1", "P_1"],
            "date": [date(2026, 1, 2), date(2026, 1, 4)],
            "amount": [100.0, -20.0],
            "status": ["booked", "booked"],
            "accounting_status": [None, None],
            "category": ["collection", "utility"],
        }
    )
    products = pl.DataFrame(
        {"product_id": ["P_1"], "company_id": ["COMP_1"], "currency": ["EUR"]}
    )

    # When
    monthly = build_monthly_features(transactions, products)

    # Then
    assert monthly.height == 1
    assert monthly["operating_inflow"][0] == 100.0
    assert monthly["operating_outflow"][0] == 20.0


def test_temporal_ratios_require_two_sided_scale_independent_operating_signal() -> None:
    # Given
    months = [date(2026, month, 1) for month in range(1, 4)]
    monthly = pl.DataFrame(
        {
            "company_id": [company for company in ["A", "B", "C", "D", "E"] for _ in months],
            "currency": [currency for currency in ["EUR", "JPY", "EUR", "EUR", "EUR"] for _ in months],
            "month": months * 5,
            "operating_inflow": [100.0] * 3 + [10_000.0] * 3 + [0.0] * 3 + [100.0] * 3 + [100.0] * 3,
            "operating_outflow": [50.0] * 3 + [5_000.0] * 3 + [0.0] * 3 + [0.0] * 3 + [0.1] * 3,
        }
    )

    # When
    features = add_temporal_features(monthly).group_by("company_id").tail(1).sort("company_id")

    # Then
    assert features.filter(pl.col("company_id").is_in(["A", "B"]))[
        "operating_flow_balance_3m"
    ].to_list() == [1 / 3, 1 / 3]
    assert features["operating_signal_status"].to_list() == [
        "sufficient",
        "sufficient",
        "no_identified_operating_activity",
        "one_sided_operating_activity",
        "imbalanced_operating_activity",
    ]
    assert features.filter(pl.col("company_id").is_in(["C", "D", "E"]))[
        "operating_flow_balance_3m"
    ].null_count() == 3
