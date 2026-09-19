"""Senales -> familia.

Dos decisiones viven aqui:

1. **Como se mezclan** las senales disponibles. Lo elige `config.FAMILY_BLEND`
   por nombre, asi que cambiar de media aritmetica a media de potencia es
   editar una linea de configuracion.
2. **Que pasa con lo que falta.** Se renormaliza sobre las senales observadas
   y despues se encoge hacia 50 segun la fraccion de peso observada. Sin ese
   encogimiento, un pilar del que solo se ve un tercio podria sacar un 100.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import config
from .normalize import score_signal
from .registry import resolve


@dataclass(frozen=True)
class Factor:
    score: float | None
    metrics: dict[str, float | int | str | None]
    reason: str | None = None


def shrink(value: float, fraction: float) -> float:
    """Acerca `value` a 50 cuando solo se observa parte de la informacion."""
    return config.NEUTRAL + (value - config.NEUTRAL) * (fraction ** config.SHRINK_EXPONENT)


def build_factor(pillar: str, values: dict[str, float | None],
                 specs: dict[str, dict]) -> Factor:
    """Agrega las senales de un pilar y deja constancia de lo observado."""
    scored: dict[str, float] = {}
    for name, spec in specs.items():
        points = score_signal(values.get(name), spec["anchors"])
        if points is not None:
            scored[name] = points

    metrics: dict[str, float | int | str | None] = {
        name: (round(float(values[name]), 4) if values.get(name) is not None else None)
        for name in specs
    }
    metrics.update({f"{name}_points": points for name, points in scored.items()})

    if not scored:
        return Factor(None, metrics, f"no_data_for_{pillar}")

    observed = sum(specs[name]["weight"] for name in scored)
    total = sum(spec["weight"] for spec in specs.values())
    blend = resolve(config.FAMILY_BLEND.get(pillar, ("arithmetic", {})))
    raw = blend([scored[name] for name in scored],
                [float(specs[name]["weight"]) for name in scored])

    fraction = observed / total
    value = shrink(raw, fraction)

    metrics["signals_available"] = len(scored)
    metrics["signals_total"] = len(specs)
    metrics["weight_observed"] = round(fraction, 3)
    metrics["score_before_shrinkage"] = round(raw, 2)
    return Factor(round(value, 2), metrics)


def smooth_series(values: list[float | None], alpha: float | None = None) -> list[float | None]:
    """EWMA causal sobre una serie con huecos. Solo mira hacia atras.

    Se suaviza el PILAR y no el score final: asi la descomposicion en drivers
    sigue cuadrando exactamente en cada mes.
    """
    rate = config.EWMA_ALPHA if alpha is None else alpha
    out: list[float | None] = []
    state: float | None = None
    for value in values:
        if value is None:
            out.append(state)
            continue
        state = value if state is None else rate * value + (1 - rate) * state
        out.append(round(state, 2))
    return out
