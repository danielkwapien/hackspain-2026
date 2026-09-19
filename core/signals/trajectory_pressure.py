"""Perspectiva de trayectoria y presión financiera.

Por qué existe
--------------
Dos empresas con la misma salud actual pueden encontrarse en momentos muy
distintos: una puede estar recuperándose y otra entrando en deterioro. Una foto
aislada no refleja la dirección, la persistencia ni la velocidad del cambio.

Qué representa
--------------
Resume si la capacidad financiera está mejorando, permanece estable o se debilita,
y relaciona esa evolución con la presión de los compromisos que debe absorber la
empresa. Su escala combina movimiento y resiliencia en una única perspectiva.

Cómo se entiende
----------------
La señal estudia ventanas temporales consecutivas para separar ruido puntual de
cambios sostenidos. Contrasta además los recursos financieros movilizables con
las obligaciones observadas, de modo que la dirección se interpreta junto a la
capacidad real de sostenerla. Cada fecha se analiza exclusivamente con el pasado
conocido hasta ese momento.

Qué aporta
----------
Permite detectar una inflexión antes de que quede plenamente reflejada en la
salud actual, distinguir un bache de un cambio de régimen y explicar no solo
dónde está la empresa, sino hacia dónde avanza y con qué margen financiero.
"""

from __future__ import annotations

import pandas as pd


NAME = "trajectory_pressure"
MOMENTUM_WEIGHT = 0.60
PRESSURE_WEIGHT = 0.40
PANEL_COLUMNS = {
    "group_id", "m", "cash_eom", "ar_open", "ar_overdue", "ap_open", "debt_rep_3m"
}


def _prepare_financial_history(panel: pd.DataFrame, scored: pd.DataFrame) -> pd.DataFrame:
    """Alinea salud, liquidez, cobros y obligaciones en una secuencia temporal."""
    missing = PANEL_COLUMNS.difference(panel.columns)
    if missing:
        raise ValueError(f"Faltan columnas para {NAME}: {sorted(missing)}")
    return scored[["group_id", "m", "score", "confidence"]].merge(
        panel[list(PANEL_COLUMNS)], on=["group_id", "m"], how="left", validate="one_to_one"
    ).sort_values(["group_id", "m"])


def _health_momentum(base: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Mide dirección y magnitud entre dos ventanas consecutivas de salud."""
    health = pd.to_numeric(base["score"], errors="coerce")
    grouped_health = health.groupby(base["group_id"])
    recent = grouped_health.transform(lambda values: values.rolling(3, min_periods=3).mean())
    previous = grouped_health.transform(
        lambda values: values.shift(3).rolling(3, min_periods=3).mean()
    )
    delta = recent - previous
    return delta, (50.0 + 2.5 * delta).clip(0, 100)


def _obligation_pressure(base: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Relaciona recursos financieros disponibles con compromisos observados."""
    cash = pd.to_numeric(base["cash_eom"], errors="coerce").clip(lower=0)
    receivables = (
        pd.to_numeric(base["ar_open"], errors="coerce").fillna(0)
        - pd.to_numeric(base["ar_overdue"], errors="coerce").fillna(0)
    ).clip(lower=0)
    obligations = (
        pd.to_numeric(base["ap_open"], errors="coerce").fillna(0)
        + pd.to_numeric(base["debt_rep_3m"], errors="coerce").fillna(0)
    ).clip(lower=0)
    resources = cash + 0.5 * receivables
    ratio = resources.div(obligations.where(obligations > 0))
    ratio = ratio.where(obligations > 0, 2.5).where(cash.notna())
    pressure = ratio.map(lambda value: _coverage_points(float(value)) if pd.notna(value) else pd.NA)
    return ratio, pd.to_numeric(pressure, errors="coerce")


def _coverage_points(ratio: float) -> float:
    """Traduce cobertura de obligaciones a una escala financiera 0..100."""
    anchors = ((0.0, 0.0), (0.5, 25.0), (1.0, 55.0), (1.5, 80.0), (2.5, 100.0))
    if ratio <= anchors[0][0]:
        return anchors[0][1]
    if ratio >= anchors[-1][0]:
        return anchors[-1][1]
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x0 <= ratio <= x1:
            return y0 + (ratio - x0) * (y1 - y0) / (x1 - x0)
    return 50.0


def calculate(panel: pd.DataFrame, scored: pd.DataFrame) -> pd.DataFrame:
    """Integra dirección, presión, confianza y evidencia en una perspectiva mensual."""
    base = _prepare_financial_history(panel, scored)
    delta, momentum = _health_momentum(base)
    ratio, pressure = _obligation_pressure(base)

    available_weight = momentum.notna().astype(float) * MOMENTUM_WEIGHT
    available_weight += pressure.notna().astype(float) * PRESSURE_WEIGHT
    value = (
        momentum.fillna(0) * MOMENTUM_WEIGHT + pressure.fillna(0) * PRESSURE_WEIGHT
    ).div(available_weight.where(available_weight > 0)).clip(0, 100)

    result = base[["group_id", "m"]].copy()
    result["name"] = NAME
    result["value"] = value.round(2)
    result["coverage"] = available_weight.round(2)
    result["confidence"] = (
        pd.to_numeric(base["confidence"], errors="coerce") * result["coverage"]
    ).clip(0, 1).round(3)
    result["direction"] = delta.map(
        lambda change: "unknown" if pd.isna(change) else (
            "improving" if change > 2 else "deteriorating" if change < -2 else "stable"
        )
    )
    result["evidence"] = [
        {
            "health_change_3m": None if pd.isna(change) else round(float(change), 2),
            "momentum": None if pd.isna(momentum_value) else round(float(momentum_value), 2),
            "obligation_coverage": None if pd.isna(ratio_value) else round(float(ratio_value), 2),
            "pressure": None if pd.isna(pressure_value) else round(float(pressure_value), 2),
        }
        for change, momentum_value, ratio_value, pressure_value in zip(
            delta, momentum, ratio, pressure
        )
    ]
    return result.sort_values(["group_id", "m"]).reset_index(drop=True)
