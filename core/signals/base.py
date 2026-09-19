"""Contrato común para señales del motor temporal.

Cada señal recibe el panel completo y devuelve una Series con el mismo índice:
un valor crudo por grupo y mes. Puede ser una ratio, una media móvil o la
salida de un modelo. Nunca puede usar meses futuros.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np
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


SCALE_FLOOR_RATIO = 0.01


def z_own(
    values: pd.Series,
    groups: pd.Series,
    window: int = 12,
    min_periods: int = 6,
) -> pd.Series:
    """Desviacion respecto a la base que el propio grupo tenia establecida.

    Un grupo con 15 dias de colchon que SIEMPRE ha tenido 15 esta estable; uno
    que venia de 60 y ha caido a 15 esta en problemas. El nivel no distingue
    esos dos casos y esta medida si.

    Mediana y MAD en vez de media y desviacion porque el dataset tiene colas
    muy gruesas: el 0,25 % de las filas concentra el 75 % del importe.

    La ventana **excluye el mes en curso** (`shift(1)`): si el valor actual
    entrase en su propia base, se estaria comparando consigo mismo y el
    movimiento reciente quedaria diluido.

    Devuelve ausente hasta que hay `min_periods` meses previos, asi que un
    grupo joven no recibe una lectura inventada: la senal falta y su peso se
    reparte entre las demas.
    """
    def _mad(window_values) -> float:
        # nanmedian, no median: `shift(1)` mete un NaN al principio de cada
        # grupo y `np.median` lo propagaria, dejando la senal muda seis meses
        # mas de la cuenta.
        median = np.nanmedian(window_values)
        return float(np.nanmedian(np.abs(window_values - median)))

    grouped = values.groupby(groups)
    baseline = grouped.transform(
        lambda s: s.shift(1).rolling(window, min_periods=min_periods).median())
    dispersion = grouped.transform(
        lambda s: s.shift(1).rolling(window, min_periods=min_periods).apply(_mad, raw=True))
    # Suelo de escala. Una serie que nunca se ha movido tiene MAD = 0 y la
    # division no existe; con un `if MAD == 0` aparte, un cambio de bit en el
    # ultimo decimal hace saltar la senal 25 puntos. Con el suelo no hay rama
    # ni discontinuidad: para una serie plana, moverse un 1 % de su nivel pasa
    # a valer una unidad de sorpresa.
    scale = (1.4826 * dispersion).combine(
        (baseline.abs() * SCALE_FLOOR_RATIO), max)
    return ((values - baseline) / scale.where(scale > 0)).clip(-4.0, 4.0)
