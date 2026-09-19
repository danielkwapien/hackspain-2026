"""Señales de deuda y coste de financiación."""

import pandas as pd

from .base import Signal, safe_ratio, z_own


def debt_service_ratio(panel: pd.DataFrame) -> pd.Series:
    value = safe_ratio(panel["debt_rep_3m"] + panel["feeint_3m"], panel["op_in_3m"], upper=2.0)
    return value.where(panel["debt_rep_3m"] > 0)


def feeint_share(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["feeint_3m"], panel["op_out_3m"], upper=0.5)


def loc_utilisation(panel: pd.DataFrame) -> pd.Series:
    return panel["loc_utilisation"].astype("Float64").clip(upper=1.0)


def feeint_share_z(panel: pd.DataFrame) -> pd.Series:
    """Comisiones e intereses frente a lo que este grupo suele pagar."""
    return z_own(feeint_share(panel), panel["group_id"])


SIGNALS = [
    Signal("loc_utilisation", "debt", "Utilizacion de lineas de credito", 30,
           ((0, 100), (0.3, 90), (0.6, 60), (0.9, 20), (1, 0)), loc_utilisation),
    Signal("debt_service_ratio", "debt", "Servicio de deuda sobre cobros", 30,
           ((0, 100), (0.1, 80), (0.25, 50), (0.5, 20), (1, 0)), debt_service_ratio),
    Signal("feeint_share", "debt", "Peso de comisiones e intereses", 20,
           ((0, 100), (0.01, 85), (0.03, 60), (0.08, 25), (0.15, 0)), feeint_share),
    Signal("feeint_share_z", "debt", "Coste financiero frente a su base 12m", 20,
           ((-2.5, 100), (-1.0, 88), (0, 70), (1.0, 35), (2.5, 0)), feeint_share_z),
]
