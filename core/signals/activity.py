"""Señales de actividad y estabilidad operativa."""

import pandas as pd

from .base import Signal, safe_ratio, z_own


def op_in_growth(panel: pd.DataFrame) -> pd.Series:
    previous = panel["op_in_prev3"].where(panel["op_in_prev3"] > 0)
    return (panel["op_in_3m"] / previous - 1.0).clip(-1.0, 2.0)


def inflow_cv(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["inflow_std3"], panel["inflow_mean3"], upper=3.0)


def net_ocf_ratio(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(
        panel["op_in_3m"] - panel["op_out_3m"], panel["op_out_3m"], lower=-1.0, upper=1.0)


def op_in_z(panel: pd.DataFrame) -> pd.Series:
    """Cobros del mes frente a la base que el grupo tenia establecida."""
    return z_own(panel["op_in"].astype("Float64"), panel["group_id"])


SIGNALS = [
    Signal("op_in_growth", "activity", "Crecimiento de cobros operativos", 28,
           ((-0.5, 0), (-0.2, 30), (0, 60), (0.25, 85), (0.6, 100)), op_in_growth),
    Signal("inflow_cv", "activity", "Volatilidad de los cobros", 28,
           ((0.1, 100), (0.3, 80), (0.6, 55), (1.0, 25), (1.8, 0)), inflow_cv),
    Signal("net_ocf_ratio", "activity", "Flujo operativo neto", 24,
           ((-0.3, 0), (-0.1, 35), (0, 55), (0.1, 75), (0.3, 100)), net_ocf_ratio),
    Signal("op_in_z", "activity", "Cobros frente a su propia base 12m", 20,
           ((-2.5, 0), (-1.0, 35), (0, 70), (1.0, 88), (2.5, 100)), op_in_z),
]
