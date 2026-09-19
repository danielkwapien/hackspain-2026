"""Familias -> nivel.

El nivel es el ancla del score: la radiografia, antes de ajustes y techos.
Tres cosas pasan aqui, en este orden, y las tres quedan escritas en el rastro:

1. mezcla ponderada de las familias disponibles
2. encogimiento hacia 50 por las familias que faltan
3. penalizacion del eslabon mas debil
"""

from __future__ import annotations

from . import config
from .families import Factor, shrink
from .registry import resolve
from .trace import Trace


def combine(factors: dict[str, Factor], trace: Trace | None = None
            ) -> tuple[float | None, float, dict[str, float], float]:
    """Devuelve (nivel, cobertura, pesos efectivos, penalizacion)."""
    available = {name: f for name, f in factors.items() if f.score is not None}
    coverage = sum(config.PILLAR_WEIGHTS[name] for name in available)

    if coverage < config.MIN_COVERAGE:
        if trace is not None:
            trace.add("level", "insufficient_coverage", coverage=round(coverage, 2))
        return None, round(coverage, 2), {}, 0.0

    effective = {name: config.PILLAR_WEIGHTS[name] / coverage for name in available}
    blend = resolve(config.COMBINE_BLEND)
    raw = blend([float(available[name].score) for name in available],
                [effective[name] for name in available])

    level = shrink(raw, coverage)
    if trace is not None:
        trace.add("level", "blended", value=level,
                  coverage=round(coverage, 2),
                  before_shrinkage=round(raw, 2))

    weakest_name = min(available, key=lambda n: float(available[n].score))
    weakest_score = float(available[weakest_name].score)
    penalty = config.PENALTY_LAMBDA * max(0.0, config.PENALTY_TAU - weakest_score)

    final = max(0.0, min(100.0, level - penalty))
    if penalty and trace is not None:
        trace.add("penalty", "weakest_link", value=final, delta=-penalty,
                  pillar=weakest_name, pillar_score=round(weakest_score, 2),
                  threshold=config.PENALTY_TAU)

    return (round(final, 2), round(coverage, 2),
            {name: round(w, 4) for name, w in effective.items()}, round(penalty, 2))
