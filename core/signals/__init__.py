"""Ejecución y catálogo modular de señales."""

import pandas as pd

from .active import ACTIVE_SIGNALS
from .base import Signal


def calculate_signals(panel: pd.DataFrame) -> pd.DataFrame:
    """Ejecuta señales activas y valida que respeten el contrato."""
    names = [signal.name for signal in ACTIVE_SIGNALS]
    if len(names) != len(set(names)):
        raise ValueError("Hay nombres de señal duplicados en ACTIVE_SIGNALS")
    values = pd.DataFrame(index=panel.index)
    for signal in ACTIVE_SIGNALS:
        result = signal.calculate(panel)
        if not isinstance(result, pd.Series) or not result.index.equals(panel.index):
            raise ValueError(
                f"La señal {signal.name} debe devolver una Series con el mismo índice que el panel")
        values[signal.name] = pd.to_numeric(result, errors="coerce")
    return values


def specs_by_pillar() -> dict[str, dict[str, dict]]:
    """Devuelve los parámetros en la forma que consume el scoring."""
    result: dict[str, dict[str, dict]] = {}
    for signal in ACTIVE_SIGNALS:
        result.setdefault(signal.pillar, {})[signal.name] = {
            "weight": signal.weight,
            "label": signal.label,
            "anchors": list(signal.anchors),
        }
    return result


__all__ = ["ACTIVE_SIGNALS", "Signal", "calculate_signals", "specs_by_pillar"]
