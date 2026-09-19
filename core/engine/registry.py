"""Estrategias con nombre. La configuracion elige por cadena, no por import.

Anadir una forma nueva de mezclar es anadir una funcion a este diccionario y
escribir su nombre en `config.py`. No hay que tocar ningun otro modulo.
"""

from __future__ import annotations

import math
from typing import Callable

# Una mezcla recibe valores (0..100) y pesos ya alineados, y devuelve 0..100.
Blend = Callable[[list[float], list[float]], float]


def arithmetic(values: list[float], weights: list[float]) -> float:
    """Media ponderada de toda la vida. Totalmente compensatoria."""
    total = sum(weights)
    return sum(v * w for v, w in zip(values, weights)) / total


def geometric(values: list[float], weights: list[float]) -> float:
    """Media geometrica: castiga los perfiles desiguales [OECD/JRC]."""
    total = sum(weights)
    floored = [max(v, 1e-6) for v in values]
    exponent = sum(w * math.log(v) for v, w in zip(floored, weights)) / total
    return math.exp(exponent)


def power(values: list[float], weights: list[float], p: float = 0.5) -> float:
    """Media de potencia: un solo mando entre media (p=1) y minimo (p->-inf).

    p = 1   media aritmetica
    p -> 0  media geometrica
    p < 0   se acerca al peor valor
    """
    if abs(p) < 1e-9:
        return geometric(values, weights)
    total = sum(weights)
    floored = [max(v, 1e-6) for v in values]
    mean = sum(w * (v ** p) for v, w in zip(floored, weights)) / total
    return mean ** (1.0 / p)


def weakest(values: list[float], weights: list[float], lam: float = 0.5) -> float:
    """Media aritmetica descontando la distancia del peor valor."""
    base = arithmetic(values, weights)
    return base - lam * max(0.0, base - min(values))


def minimum(values: list[float], weights: list[float]) -> float:
    """Eslabon mas debil puro. Nada lo compensa."""
    return min(values)


def weighted_mean(values: list[float], weights: list[float]) -> float:
    """Alias explicito de `arithmetic` para la mezcla entre pilares."""
    return arithmetic(values, weights)


BLENDS: dict[str, Blend] = {
    "arithmetic": arithmetic,
    "weighted_mean": weighted_mean,
    "geometric": geometric,
    "power": power,
    "weakest": weakest,
    "minimum": minimum,
}


def resolve(spec: tuple[str, dict]) -> Callable[[list[float], list[float]], float]:
    """Convierte ('power', {'p': 0.5}) en una funcion lista para llamar."""
    name, kwargs = spec
    if name not in BLENDS:
        raise KeyError(f"Mezcla desconocida: {name!r}. Disponibles: {sorted(BLENDS)}")
    blend = BLENDS[name]
    if not kwargs:
        return blend
    return lambda values, weights: blend(values, weights, **kwargs)
