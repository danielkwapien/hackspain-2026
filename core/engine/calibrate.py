"""Ultima capa: banda, confianza y alerta de liquidez.

La alerta va SEPARADA del score a proposito. El score es un juicio
estructurado que sirve para ordenar y explicar; el colchon de caja es la
senal que de verdad anticipa. Colapsarlas en un numero pierde las dos.

La banda del colchon (`critical`/`watch`/`adequate`/`strong`) es lectura
interna. Lo que sale del motor hacia el producto es `severity`, y solo tiene
tres valores: este modulo es el unico sitio donde se decide cual.
"""

from __future__ import annotations

from . import config


def band_for(score: float | None) -> str | None:
    if score is None:
        return None
    for threshold, name in config.BANDS:
        if score >= threshold:
            return name
    return config.BAND_FLOOR


def history_factor(months_history: int) -> float:
    """Cuanta historia respalda la lectura, de 0 a 1."""
    for threshold, value in config.CONFIDENCE_BY_HISTORY:
        if months_history < threshold:
            return value
    return config.CONFIDENCE_FULL


def confidence_for(months_history: int, coverage: float) -> float:
    """Historia y cobertura. Poca historia no es mala salud: es menos certeza."""
    return round(max(0.0, min(1.0, history_factor(months_history) * coverage)), 3)


def buffer_band(buffer_days: float | None) -> str | None:
    if buffer_days is None:
        return None
    for threshold, name in config.BUFFER_BANDS:
        if buffer_days < threshold:
            return name
    return config.BUFFER_FLOOR


ALERT_SEVERITIES: tuple[str, ...] = ("urgent", "review", "watch")
"""Vocabulario unico de severidad, de mayor a menor. Lo consume el producto entero."""


def severity_for(band: str | None, previous: str | None) -> str | None:
    """Banda del colchon -> severidad del producto. `None` cuando no hay alerta.

    `urgent` cuando el colchon esta en critico, `review` cuando lleva dos meses
    en vigilancia y `watch` el primero. La histeresis no decide SI se avisa:
    decide CON QUE fuerza. Un primer mes por debajo de la mediana de pyme ya es
    algo que mirar, y callarlo perdia la unica alerta que llega temprano; que
    persista es lo que lo convierte en algo que revisar.
    """
    if band == "critical":
        return "urgent"
    if band == "watch":
        return "review" if previous in ("watch", "critical") else "watch"
    return None


def early_warning(buffer_series: list[float | None]) -> dict[str, object]:
    """Alerta del colchon. La histeresis gradua la severidad, no la silencia."""
    current = buffer_series[-1] if buffer_series else None
    band = buffer_band(current)
    previous = buffer_band(buffer_series[-2]) if len(buffer_series) > 1 else None

    trend = None
    recent = [v for v in buffer_series[-4:-1] if v is not None]
    if current is not None and recent:
        baseline = sum(recent) / len(recent)
        trend = ("falling" if current < baseline * 0.8
                 else "rising" if current > baseline * 1.2 else "flat")

    severity = severity_for(band, previous)
    alert = severity is not None
    reason = None
    if alert and current is not None:
        reason = f"Colchon de caja de {current:.0f} dias" + (" y cayendo" if trend == "falling" else "")

    return {"buffer_days": None if current is None else round(current, 1),
            "band": band, "trend": trend, "alert": bool(alert), "severity": severity,
            "reason": reason, "basis": "cash_eom / mean(op_out, 3m)"}
