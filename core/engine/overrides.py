"""Techos duros por eventos observables.

Un techo no discute con el nivel: lo corta. Existen porque hay situaciones en
las que da igual lo bien que este todo lo demas, y porque un jurado entiende
"esta capada a 40 porque lleva dos meses en numeros rojos" mucho mejor que
un peso.

Todos los umbrales son ABSOLUTOS. No dependen de la distribucion de la
cohorte cargada, asi que el mismo grupo recibe el mismo techo tanto si el
fichero trae 250 grupos como si trae 60.
"""

from __future__ import annotations

from . import config
from .trace import Trace


def negative_cash(history: list[bool]) -> bool:
    """Caja consolidada negativa dos meses seguidos."""
    return len(history) >= 2 and history[-1] and history[-2]


def line_exhausted(utilisation: float | None) -> bool:
    """Linea de credito practicamente agotada."""
    threshold = config.CAPS["CAP_LOCFULL"].get("threshold", 0.95)
    return utilisation is not None and utilisation >= threshold


def apply(score: float, signals: dict, trace: Trace | None = None) -> tuple[float, list[str]]:
    """Aplica los techos activos y devuelve (score, codigos aplicados)."""
    if not config.CAPS_ENABLED:
        return score, []

    triggered: list[tuple[str, float]] = []
    if negative_cash(signals.get("negative_cash_history", [])):
        triggered.append(("CAP_NEGCASH", config.CAPS["CAP_NEGCASH"]["ceiling"]))
    if line_exhausted(signals.get("loc_utilisation")):
        triggered.append(("CAP_LOCFULL", config.CAPS["CAP_LOCFULL"]["ceiling"]))

    codes: list[str] = []
    result = score
    for code, ceiling in sorted(triggered, key=lambda item: item[1]):
        if result > ceiling:
            if trace is not None:
                trace.add("override", code, value=ceiling, delta=ceiling - result,
                          label=config.CAPS[code]["label"], ceiling=ceiling,
                          binding=True)
            result = ceiling
            codes.append(code)
        else:
            # La condicion se cumple pero el score ya estaba por debajo: se deja
            # constancia sin fingir que el techo movio nada.
            if trace is not None:
                trace.add("override", code, value=result, delta=0.0,
                          label=config.CAPS[code]["label"], ceiling=ceiling,
                          binding=False)
            codes.append(code)
    return round(result, 2), codes
