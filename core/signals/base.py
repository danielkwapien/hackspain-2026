"""Contrato común para señales del motor temporal.

Cada señal recibe el panel completo y devuelve una Series con el mismo índice:
un valor crudo por grupo y mes. Puede ser una ratio, una media móvil o la
salida de un modelo. Nunca puede usar meses futuros.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd


Calculator = Callable[[pd.DataFrame], pd.Series]


@dataclass(frozen=True)
class Signal:
    name: str
    pillar: str
    label: str
    weight: float
    anchors: tuple[tuple[float, float], ...]
    calculate: Calculator


def safe_ratio(
    numerator: pd.Series,
    denominator: pd.Series,
    lower: float | None = None,
    upper: float | None = None,
) -> pd.Series:
    """Divide y devuelve NA cuando el denominador no es positivo."""
    result = numerator.div(denominator.where(denominator > 0))
    return result.clip(lower=lower, upper=upper)


def direct(column: str) -> Calculator:
    """Crea una señal que ya existe como columna del panel común."""
    return lambda panel: panel[column].astype("Float64")
