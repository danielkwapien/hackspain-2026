"""Señales de cobros y calidad de cartera."""

import pandas as pd

from .base import Signal, safe_ratio


def ar_overdue_ratio(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["ar_overdue"], panel["ar_open"])


def ar_pct_paid_late(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["ar_late3"], panel["ar_paid3"])


def collection_ratio(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["ar_paid3"], panel["ar_iss3"], upper=3.0)


SIGNALS = [
    Signal("ar_overdue_ratio", "collections", "Cartera de clientes vencida", 35,
           ((0, 100), (0.1, 85), (0.3, 55), (0.6, 20), (1, 0)), ar_overdue_ratio),
    Signal("ar_pct_paid_late", "collections", "Clientes que pagan tarde", 30,
           ((0, 100), (0.1, 85), (0.3, 60), (0.6, 20), (0.8, 0)), ar_pct_paid_late),
    Signal("collection_ratio", "collections", "Cobrado sobre facturado", 35,
           ((0.4, 0), (0.6, 25), (0.85, 60), (1, 90), (1.2, 100)), collection_ratio),
]
