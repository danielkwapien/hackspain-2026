"""Ajustes acotados sobre el nivel.

Un modificador NO es una familia mas en la media: es un juicio sobre el
nivel ya calculado. Por eso se suma en puntos y esta acotado. El limite es
deliberado: ninguna senal suelta puede secuestrar el score, y el efecto
maximo se lee de un vistazo en `config`.

Cada modificador escala por su propia confianza: si no nos fiamos del
calculo, el ajuste se encoge hacia cero en vez de meter ruido.
"""

from __future__ import annotations

import math

from . import config
from .trace import Trace


def _bounded(raw: float, bound: float, confidence: float = 1.0) -> float:
    """Lleva cualquier magnitud a [-bound, +bound] de forma suave."""
    return bound * math.tanh(raw) * max(0.0, min(1.0, confidence))


def momentum(level: float, series: list[float | None], trace: Trace | None = None,
             confidence: float = 1.0) -> float:
    """Premia o castiga la direccion sostenida del propio nivel.

    Usa la pendiente reciente y cuantos meses lleva en la misma direccion:
    un mes malo no mueve nada, cuatro meses seguidos si. Solo mira hacia
    atras, asi que es calculable en cualquier corte.
    """
    if not config.MOMENTUM_ENABLED:
        return 0.0
    values = [v for v in series if v is not None]
    if len(values) < 4:
        return 0.0

    recent = values[-3:]
    prior = values[-6:-3] if len(values) >= 6 else values[:-3]
    if not prior:
        return 0.0
    change = (sum(recent) / len(recent)) - (sum(prior) / len(prior))

    run = 1
    for older, newer in zip(reversed(values[:-1]), reversed(values[1:])):
        step = newer - older
        if step == 0 or (step > 0) != (change > 0):
            break
        run += 1
    persistence = min(run, 6) / 6.0

    delta = _bounded(change / 6.0 * persistence, config.MOMENTUM_BOUND, confidence)
    if abs(delta) < config.MODIFIER_MIN_EFFECT:
        return 0.0
    if trace is not None:
        trace.add("modifier", "momentum", value=level + delta, delta=delta,
                  change_3m=round(change, 2), months_in_direction=run)
    return delta


def context(level: float, percentile: float | None, trace: Trace | None = None,
            confidence: float = 1.0) -> float:
    """Posicion entre pares comparables, como ajuste pequeno.

    Deliberadamente acotado por debajo de `momentum`: la cohorte se deriva del
    propio nivel, asi que un peso grande seria contarse dos veces.
    """
    if not config.CONTEXT_ENABLED or percentile is None:
        return 0.0
    delta = _bounded((percentile - 0.5) * 2.0, config.CONTEXT_BOUND, confidence)
    if abs(delta) < config.MODIFIER_MIN_EFFECT:
        return 0.0
    if trace is not None:
        trace.add("modifier", "peer_context", value=level + delta, delta=delta,
                  percentile=round(percentile, 3))
    return delta
