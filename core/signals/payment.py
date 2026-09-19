"""Señales de disciplina de pago propia."""

import pandas as pd

from .base import Signal, direct, safe_ratio, z_own


def ap_pct_paid_late(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["ap_late3"], panel["ap_paid3"])


def ss_regularity(panel: pd.DataFrame) -> pd.Series:
    value = panel["ss_6m"] / panel["active_6m"].clip(lower=1)
    return value.where(panel["ss_hist"] >= 3)


def tax_regularity(panel: pd.DataFrame) -> pd.Series:
    return (panel["tax_12m"] / 4.0).clip(upper=1.0).where(panel["tax_hist"] >= 2)


def ap_days_late_z(panel: pd.DataFrame) -> pd.Series:
    """Paga mas tarde de lo que este grupo acostumbra."""
    return z_own(panel["ap_dlw3"].astype("Float64"), panel["group_id"])


SIGNALS = [
    Signal("ap_pct_paid_late", "payment", "Facturas de proveedor pagadas tarde", 32,
           ((0, 100), (0.1, 85), (0.3, 60), (0.6, 20), (0.8, 0)), ap_pct_paid_late),
    Signal("ap_days_late", "payment", "Retraso propio medio", 20,
           ((0, 100), (7, 80), (15, 60), (30, 30), (60, 0)), direct("ap_dlw3")),
    Signal("ss_regularity", "payment", "Regularidad de Seguridad Social", 16,
           ((0.5, 0), (0.67, 40), (0.83, 70), (1, 100)), ss_regularity),
    Signal("tax_regularity", "payment", "Regularidad de impuestos", 12,
           ((0, 0), (0.25, 30), (0.5, 60), (0.75, 85), (1, 100)), tax_regularity),
    Signal("ap_days_late_z", "payment", "Retraso frente a su propia base 12m", 20,
           ((-2.5, 100), (-1.0, 88), (0, 70), (1.0, 35), (2.5, 0)), ap_days_late_z),
]
