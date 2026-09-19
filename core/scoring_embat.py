"""Funciones puras del motor temporal de salud financiera a nivel de grupo.

Mantiene deliberadamente la misma forma que `scoring.py` (Factor, interpolate,
band_for, build_drivers) para que fusionar ambos motores sea cambiar tablas de
parametros, no reconciliar dos implementaciones.

Diferencias con el baseline estatico:
  - la unidad es el GRUPO, no la sociedad
  - cada senal se evalua mes a mes con datos <= fin de mes (point-in-time)
  - agregacion no compensatoria: el pilar mas debil penaliza al conjunto
"""

from __future__ import annotations

import math
from dataclasses import dataclass


MODEL_VERSION = "embat-temporal-v1"

PILLAR_WEIGHTS = {
    "liquidity": 0.25,
    "payment": 0.20,
    "collections": 0.15,
    "debt": 0.20,
    "activity": 0.20,
}

PILLAR_LABELS = {
    "liquidity": "Liquidez y colchon de caja",
    "payment": "Disciplina de pago propia",
    "collections": "Cobros y calidad de cartera",
    "debt": "Deuda y coste de financiacion",
    "activity": "Actividad y estabilidad",
}

# anclas (valor_crudo -> puntos 0..100). Todas absolutas: no dependen de la
# cohorte cargada, asi que son seguras cuando el test trae menos grupos.
SIGNAL_SPECS: dict[str, dict[str, dict]] = {
    "liquidity": {
        "buffer_days": {
            "weight": 50, "label": "Dias de caja sobre salidas operativas",
            "anchors": [(0, 0), (10, 30), (27, 60), (60, 90), (120, 100)],
        },
        "neg_cash_share": {
            "weight": 30, "label": "Meses recientes con caja negativa",
            "anchors": [(0, 100), (0.34, 50), (0.67, 20), (1, 0)],
        },
        "cash_trend": {
            "weight": 20, "label": "Tendencia de la caja",
            "anchors": [(-0.5, 0), (-0.2, 30), (0, 60), (0.2, 85), (0.5, 100)],
        },
    },
    "payment": {
        "ap_pct_paid_late": {
            "weight": 40, "label": "Facturas de proveedor pagadas tarde",
            "anchors": [(0, 100), (0.1, 85), (0.3, 60), (0.6, 20), (0.8, 0)],
        },
        "ap_days_late": {
            "weight": 25, "label": "Retraso propio medio",
            "anchors": [(0, 100), (7, 80), (15, 60), (30, 30), (60, 0)],
        },
        "ss_regularity": {
            "weight": 20, "label": "Regularidad de Seguridad Social",
            "anchors": [(0.5, 0), (0.67, 40), (0.83, 70), (1, 100)],
        },
        "tax_regularity": {
            "weight": 15, "label": "Regularidad de impuestos",
            "anchors": [(0, 0), (0.25, 30), (0.5, 60), (0.75, 85), (1, 100)],
        },
    },
    "collections": {
        "ar_overdue_ratio": {
            "weight": 35, "label": "Cartera de clientes vencida",
            "anchors": [(0, 100), (0.1, 85), (0.3, 55), (0.6, 20), (1, 0)],
        },
        "ar_pct_paid_late": {
            "weight": 30, "label": "Clientes que pagan tarde",
            "anchors": [(0, 100), (0.1, 85), (0.3, 60), (0.6, 20), (0.8, 0)],
        },
        "collection_ratio": {
            "weight": 35, "label": "Cobrado sobre facturado",
            "anchors": [(0.4, 0), (0.6, 25), (0.85, 60), (1, 90), (1.2, 100)],
        },
    },
    "debt": {
        "loc_utilisation": {
            "weight": 35, "label": "Utilizacion de lineas de credito",
            "anchors": [(0, 100), (0.3, 90), (0.6, 60), (0.9, 20), (1, 0)],
        },
        "debt_service_ratio": {
            "weight": 35, "label": "Servicio de deuda sobre cobros",
            "anchors": [(0, 100), (0.1, 80), (0.25, 50), (0.5, 20), (1, 0)],
        },
        "feeint_share": {
            "weight": 30, "label": "Peso de comisiones e intereses",
            "anchors": [(0, 100), (0.01, 85), (0.03, 60), (0.08, 25), (0.15, 0)],
        },
    },
    "activity": {
        "op_in_growth": {
            "weight": 35, "label": "Crecimiento de cobros operativos",
            "anchors": [(-0.5, 0), (-0.2, 30), (0, 60), (0.25, 85), (0.6, 100)],
        },
        "inflow_cv": {
            "weight": 35, "label": "Volatilidad de los cobros",
            "anchors": [(0.1, 100), (0.3, 80), (0.6, 55), (1.0, 25), (1.8, 0)],
        },
        "net_ocf_ratio": {
            "weight": 30, "label": "Flujo operativo neto",
            "anchors": [(-0.3, 0), (-0.1, 35), (0, 55), (0.1, 75), (0.3, 100)],
        },
    },
}

# suavizado: el mes crudo es ruido (autocorrelacion 0,06-0,28 en el dataset),
# asi que cada pilar se pasa por una media exponencial antes de combinar.
EWMA_ALPHA = 0.5

# agregacion no compensatoria: castiga el eslabon mas debil
PENALTY_LAMBDA = 0.5
PENALTY_TAU = 45.0

MIN_COVERAGE = 0.50
MIN_MONTHS_FOR_SCORE = 3
MIN_MONTHS_FOR_REGIME = 7


@dataclass(frozen=True)
class Factor:
    score: float | None
    metrics: dict[str, float | int | str | None]
    reason: str | None = None


def interpolate(value: float, anchors: list[tuple[float, float]]) -> float:
    """Interpola linealmente entre anclas ordenadas y limita el resultado a 0..100."""
    if value <= anchors[0][0]:
        return round(anchors[0][1], 2)
    if value >= anchors[-1][0]:
        return round(anchors[-1][1], 2)
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x0 <= value <= x1:
            result = y0 + (value - x0) * (y1 - y0) / (x1 - x0)
            return round(max(0.0, min(100.0, result)), 2)
    raise ValueError("Las anclas deben estar ordenadas y cubrir el valor")


def score_signal(pillar: str, signal: str, value: float | None) -> float | None:
    """Puntua una senal cruda. None entra y None sale: nunca se imputa."""
    if value is None:
        return None
    spec = SIGNAL_SPECS[pillar][signal]
    return interpolate(float(value), spec["anchors"])


def pillar_factor(pillar: str, values: dict[str, float | None]) -> Factor:
    """Agrega las senales disponibles de un pilar renormalizando sus pesos."""
    specs = SIGNAL_SPECS[pillar]
    scored: dict[str, float] = {}
    for name, spec in specs.items():
        points = score_signal(pillar, name, values.get(name))
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
    raw = sum(points * specs[name]["weight"] for name, points in scored.items()) / observed

    # Encogimiento por cobertura parcial. Renormalizar dentro del pilar sin mas
    # deja que un pilar del que solo se observa un trozo saque 100: en la rama
    # sin facturas, `payment` se queda con las regularidades de impuestos y SS,
    # que valen ~1 para casi todos, y el pilar colapsa en excelente. Lo que no
    # se observa se asume MEDIO, no excelente.
    fraction = observed / total
    value = 50.0 + (raw - 50.0) * math.sqrt(fraction)

    metrics["signals_available"] = len(scored)
    metrics["signals_total"] = len(specs)
    metrics["weight_observed"] = round(fraction, 3)
    metrics["score_before_shrinkage"] = round(raw, 2)
    return Factor(round(value, 2), metrics)


def smooth_series(values: list[float | None], alpha: float = EWMA_ALPHA) -> list[float | None]:
    """EWMA causal sobre una serie con huecos. Solo mira hacia atras."""
    out: list[float | None] = []
    state: float | None = None
    for value in values:
        if value is None:
            out.append(state)
            continue
        state = value if state is None else alpha * value + (1 - alpha) * state
        out.append(round(state, 2))
    return out


def combine_pillars(
    factors: dict[str, Factor],
) -> tuple[float | None, float, dict[str, float], float]:
    """Nivel 0..100 con renormalizacion de pesos y penalizacion del pilar mas debil."""
    available = {name: f for name, f in factors.items() if f.score is not None}
    coverage = sum(PILLAR_WEIGHTS[name] for name in available)
    if coverage < MIN_COVERAGE:
        return None, round(coverage, 2), {}, 0.0
    effective = {name: PILLAR_WEIGHTS[name] / coverage for name in available}
    level = sum(float(factors[name].score) * w for name, w in effective.items())

    # Mismo encogimiento que dentro del pilar, ahora entre pilares. Sin esto, a
    # un grupo sin facturas le desaparece `collections` -por construccion el
    # pilar mas severo, con el 27,8 % de la cartera vencida- y el resto se
    # reparte su peso: no tener ERP subia el score. Lo no observado es MEDIO.
    level = 50.0 + (level - 50.0) * math.sqrt(coverage)

    weakest = min(float(factors[name].score) for name in available)
    penalty = PENALTY_LAMBDA * max(0.0, PENALTY_TAU - weakest)
    final = max(0.0, min(100.0, level - penalty))
    return (
        round(final, 2),
        round(coverage, 2),
        {name: round(w, 4) for name, w in effective.items()},
        round(penalty, 2),
    )


def confidence_for(months_history: int, coverage: float, quality_penalty: float = 1.0) -> float:
    """Historia y cobertura, separadas del score. Poca historia no es mala salud."""
    if months_history < 6:
        hist = 0.45
    elif months_history < 12:
        hist = 0.75
    elif months_history < 18:
        hist = 0.9
    else:
        hist = 1.0
    return round(max(0.0, min(1.0, hist * coverage * quality_penalty)), 3)


# Alerta de liquidez: separada del score a proposito.
# El score compuesto es un JUICIO (ordena y se explica); `buffer_days` es la
# senal que de verdad ANTICIPA (AUC 0,88 contra tension de caja a 3 meses,
# frente a 0,65 del compuesto). Colapsarlas en un numero pierde las dos cosas.
# Umbrales absolutos: no dependen de la cohorte cargada.
BUFFER_BANDS = [(10.0, "critical"), (27.0, "watch"), (60.0, "adequate")]


def buffer_band(buffer_days: float | None) -> str | None:
    """27 dias es la mediana de caja de una pyme [JPMorgan Chase Institute]."""
    if buffer_days is None:
        return None
    for threshold, name in BUFFER_BANDS:
        if buffer_days < threshold:
            return name
    return "strong"


def early_warning(buffer_series: list[float | None]) -> dict[str, object]:
    """Alerta con histeresis: `watch` exige dos meses seguidos para disparar."""
    current = buffer_series[-1] if buffer_series else None
    band = buffer_band(current)
    previous_band = buffer_band(buffer_series[-2]) if len(buffer_series) > 1 else None
    trend = None
    recent = [v for v in buffer_series[-4:-1] if v is not None]
    if current is not None and recent:
        baseline = sum(recent) / len(recent)
        trend = "falling" if current < baseline * 0.8 else "rising" if current > baseline * 1.2 else "flat"
    alert = band == "critical" or (band == "watch" and previous_band in ("watch", "critical"))
    reason = None
    if alert:
        reason = (f"Colchon de caja de {current:.0f} dias"
                  + (" y cayendo" if trend == "falling" else ""))
    return {
        "buffer_days": None if current is None else round(current, 1),
        "band": band,
        "trend": trend,
        "alert": bool(alert),
        "reason": reason,
        "basis": "cash_eom / mean(op_out, 3m)",
    }


def band_for(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 80:
        return "solid"
    if score >= 60:
        return "healthy"
    if score >= 40:
        return "watch"
    return "stress"


def trajectory_for(series: list[float | None]) -> dict[str, object]:
    """Direccion y regimen a partir de la serie mensual ya calculada.

    `series` viene ordenada de mas antigua a mas reciente e incluye el mes actual.
    Solo usa el pasado: es exactamente la informacion disponible en ese corte.
    """
    values = [v for v in series if v is not None]
    if len(values) < 2:
        return {"direction": "unknown", "slope_3m": None, "slope_6m": None,
                "months_in_direction": None, "regime": "warmup"}

    def slope(window: int) -> float | None:
        tail = values[-window:]
        if len(tail) < max(2, window - 1):
            return None
        n = len(tail)
        mean_x = (n - 1) / 2
        mean_y = sum(tail) / n
        denom = sum((i - mean_x) ** 2 for i in range(n))
        if denom == 0:
            return None
        return round(sum((i - mean_x) * (y - mean_y) for i, y in enumerate(tail)) / denom, 3)

    s3, s6 = slope(3), slope(6)
    ref = s3 if s3 is not None else 0.0
    direction = "improving" if ref > 0.5 else "deteriorating" if ref < -0.5 else "stable"

    run = 1
    for older, newer in zip(reversed(values[:-1]), reversed(values[1:])):
        delta = newer - older
        if (delta > 0 and direction == "improving") or (delta < 0 and direction == "deteriorating"):
            run += 1
        else:
            break
    if direction == "stable":
        run = None

    level_shift = None
    if len(values) >= 9:
        recent = sorted(values[-3:])[1]
        prior = sorted(values[-9:-3])[len(values[-9:-3]) // 2]
        level_shift = round(recent - prior, 2)

    if len(values) < MIN_MONTHS_FOR_REGIME:
        regime = "warmup"
    elif direction == "deteriorating" and (run or 0) >= 3:
        regime = "deteriorating"
    elif direction == "improving" and (run or 0) >= 4:
        regime = "improving"
    elif s3 is not None and s6 is not None and s3 * s6 < 0 and abs(s3) > 1.0:
        regime = "shock_pending"
    else:
        regime = "stable"

    return {"direction": direction, "slope_3m": s3, "slope_6m": s6,
            "months_in_direction": run, "regime": regime, "level_shift": level_shift}


def build_drivers(factors: dict[str, Factor], effective_weights: dict[str, float]) -> list[dict]:
    """Contribucion de cada pilar frente al punto neutro (50)."""
    drivers = []
    for name, weight in effective_weights.items():
        value = factors[name].score
        if value is None:
            continue
        impact = round(weight * (value - 50.0), 2)
        drivers.append({
            "factor": name,
            "label": PILLAR_LABELS[name],
            "direction": "positive" if impact >= 0 else "negative",
            "impact": impact,
            "message": f"{PILLAR_LABELS[name]}: {value:.1f}/100.",
        })
    return sorted(drivers, key=lambda d: abs(float(d["impact"])), reverse=True)[:3]
