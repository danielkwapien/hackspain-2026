"""Señales de disciplina de pago propia."""

import pandas as pd

from .base import Signal, direct, safe_ratio


def ap_pct_paid_late(panel: pd.DataFrame) -> pd.Series:
    return safe_ratio(panel["ap_late3"], panel["ap_paid3"])


def ss_regularity(panel: pd.DataFrame) -> pd.Series:
    value = panel["ss_6m"] / panel["active_6m"].clip(lower=1)
    return value.where(panel["ss_hist"] >= 3)


def tax_regularity(panel: pd.DataFrame) -> pd.Series:
    return (panel["tax_12m"] / 4.0).clip(upper=1.0).where(panel["tax_hist"] >= 2)


SIGNALS = [
    Signal("ap_pct_paid_late", "payment", "Facturas de proveedor pagadas tarde", 40,
           ((0, 100), (0.1, 85), (0.3, 60), (0.6, 20), (0.8, 0)), ap_pct_paid_late),
    Signal("ap_days_late", "payment", "Retraso propio medio", 25,
           ((0, 100), (7, 80), (15, 60), (30, 30), (60, 0)), direct("ap_dlw3")),
    Signal("ss_regularity", "payment", "Regularidad de Seguridad Social", 20,
           ((0.5, 0), (0.67, 40), (0.83, 70), (1, 100)), ss_regularity),
    Signal("tax_regularity", "payment", "Regularidad de impuestos", 15,
           ((0, 0), (0.25, 30), (0.5, 60), (0.75, 85), (1, 100)), tax_regularity),
]
