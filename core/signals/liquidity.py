"""Señales del pilar de liquidez."""

import pandas as pd

from .base import Signal, direct, z_own


def buffer_days(panel: pd.DataFrame) -> pd.Series:
    value = 30.0 * panel["cash_eom"] / panel["op_out_mean3"].where(panel["op_out_mean3"] > 0)
    return value.clip(lower=0.0)


def cash_trend(panel: pd.DataFrame) -> pd.Series:
    previous = panel["cash_prev3"].where(panel["cash_prev3"].abs() > 1)
    return ((panel["cash_mean3"] - previous) / previous.abs()).clip(-1.0, 1.0)


def buffer_days_z(panel: pd.DataFrame) -> pd.Series:
    """Colchon de caja frente a la base que el propio grupo tenia."""
    return z_own(buffer_days(panel), panel["group_id"])


SIGNALS = [
    Signal("buffer_days", "liquidity", "Dias de caja sobre salidas operativas", 40,
           ((0, 0), (10, 30), (27, 60), (60, 90), (120, 100)), buffer_days),
    Signal("neg_cash_share", "liquidity", "Meses recientes con caja negativa", 25,
           ((0, 100), (0.34, 50), (0.67, 20), (1, 0)), direct("neg_cash_share")),
    Signal("cash_trend", "liquidity", "Tendencia de la caja", 15,
           ((-0.5, 0), (-0.2, 30), (0, 60), (0.2, 85), (0.5, 100)), cash_trend),
    Signal("buffer_days_z", "liquidity", "Colchon frente a su propia base 12m", 20,
           ((-2.5, 0), (-1.0, 35), (0, 70), (1.0, 88), (2.5, 100)), buffer_days_z),
]
