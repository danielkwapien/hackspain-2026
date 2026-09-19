"""Valor crudo de una senal -> puntos de 0 a 100.

Las anclas son absolutas: no dependen de que grupos haya en el fichero. Es
lo que permite que el test oculto, con 60 grupos en vez de 250, devuelva
exactamente el mismo numero para el mismo grupo.
"""

from __future__ import annotations


def interpolate(value: float, anchors: list[tuple[float, float]]) -> float:
    """Interpola linealmente entre anclas ordenadas y limita a 0..100."""
    if value <= anchors[0][0]:
        return round(anchors[0][1], 2)
    if value >= anchors[-1][0]:
        return round(anchors[-1][1], 2)
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x0 <= value <= x1:
            result = y0 + (value - x0) * (y1 - y0) / (x1 - x0)
            return round(max(0.0, min(100.0, result)), 2)
    raise ValueError("Las anclas deben estar ordenadas y cubrir el valor")


def score_signal(value: float | None, anchors: list[tuple[float, float]]) -> float | None:
    """None entra, None sale: una senal sin dato nunca se convierte en cero."""
    if value is None:
        return None
    return interpolate(float(value), anchors)
