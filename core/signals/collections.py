"""Señales de cobros y calidad de cartera."""

import pandas as pd

from .base import Signal, safe_ratio, z_own


def ar_overdue_ratio(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["ar_overdue"], panel["ar_open"])


def ar_pct_paid_late(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["ar_late3"], panel["ar_paid3"])


def collection_ratio(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["ar_paid3"], panel["ar_iss3"], upper=3.0)


def ar_overdue_z(panel: pd.DataFrame) -> pd.Series:
    """Cartera vencida frente a la que este grupo suele arrastrar."""
    return z_own(ar_overdue_ratio(panel), panel["group_id"])


SIGNALS = [
    Signal("ar_overdue_ratio", "collections", "Cartera de clientes vencida", 28,
           ((0, 100), (0.1, 85), (0.3, 55), (0.6, 20), (1, 0)), ar_overdue_ratio),
    Signal("ar_pct_paid_late", "collections", "Clientes que pagan tarde", 24,
           ((0, 100), (0.1, 85), (0.3, 60), (0.6, 20), (0.8, 0)), ar_pct_paid_late),
    Signal("collection_ratio", "collections", "Cobrado sobre facturado", 28,
           ((0.4, 0), (0.6, 25), (0.85, 60), (1, 90), (1.2, 100)), collection_ratio),
    Signal("ar_overdue_z", "collections", "Mora de clientes frente a su base 12m", 20,
           ((-2.5, 100), (-1.0, 88), (0, 70), (1.0, 35), (2.5, 0)), ar_overdue_z),
]
