"""Trayectoria financiera: convierte el histórico disponible en dirección.

La fotografía actual es necesaria, pero la riqueza temporal de Embat permite ir
un paso más allá: aplicar métodos habituales de análisis de tendencia para
distinguir un bache aislado de un deterioro persistente. La empresa se evalúa
con lo que se sabía en cada mes, de modo que la progresión puede reproducirse y
explicarse sin utilizar información futura.

La señal une dos lecturas complementarias: el movimiento reciente de la salud
y la capacidad observada para cubrir compromisos a corto plazo. Su resultado es
un diagnóstico único de 0 a 100, acompañado siempre por sus componentes.
"""

from __future__ import annotations

import pandas as pd


NAME = "trajectory_pressure"
MOMENTUM_WEIGHT = 0.60
PRESSURE_WEIGHT = 0.40


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
    """Calcula una señal causal por grupo y mes.

    El momentum compara la media de salud de los últimos tres meses con los
    tres anteriores. La presión enfrenta caja y cobros no vencidos contra pagos
    abiertos y la carga reciente de deuda. Ningún término mira meses posteriores
    al corte que se está evaluando.
    """
    panel_columns = {
        "group_id", "m", "cash_eom", "ar_open", "ar_overdue", "ap_open", "debt_rep_3m"
    }
    missing = panel_columns.difference(panel.columns)
    if missing:
        raise ValueError(f"Faltan columnas para {NAME}: {sorted(missing)}")

    base = scored[["group_id", "m", "score", "confidence"]].merge(
        panel[list(panel_columns)], on=["group_id", "m"], how="left", validate="one_to_one"
    ).sort_values(["group_id", "m"])

    health = pd.to_numeric(base["score"], errors="coerce")
    grouped_health = health.groupby(base["group_id"])
    recent = grouped_health.transform(lambda values: values.rolling(3, min_periods=3).mean())
    previous = grouped_health.transform(
        lambda values: values.shift(3).rolling(3, min_periods=3).mean()
    )
    delta = recent - previous
    # Una mejora de 20 puntos entre ventanas lleva el momentum desde neutral
    # hasta fortaleza máxima; una caída equivalente refleja tensión máxima.
    momentum = (50.0 + 2.5 * delta).clip(0, 100)

    cash = pd.to_numeric(base["cash_eom"], errors="coerce").clip(lower=0)
    receivables = (
        pd.to_numeric(base["ar_open"], errors="coerce").fillna(0)
        - pd.to_numeric(base["ar_overdue"], errors="coerce").fillna(0)
    ).clip(lower=0)
    obligations = (
        pd.to_numeric(base["ap_open"], errors="coerce").fillna(0)
        + pd.to_numeric(base["debt_rep_3m"], errors="coerce").fillna(0)
    ).clip(lower=0)
    resources = cash + 0.5 * receivables  # prudencia: solo se reconoce la mitad del cobro pendiente
    ratio = resources.div(obligations.where(obligations > 0))
    ratio = ratio.where(obligations > 0, 2.5).where(cash.notna())
    pressure = ratio.map(lambda value: _coverage_points(float(value)) if pd.notna(value) else pd.NA)
    pressure = pd.to_numeric(pressure, errors="coerce")

    available_weight = momentum.notna().astype(float) * MOMENTUM_WEIGHT
    available_weight += pressure.notna().astype(float) * PRESSURE_WEIGHT
    value = (
        momentum.fillna(0) * MOMENTUM_WEIGHT + pressure.fillna(0) * PRESSURE_WEIGHT
    ).div(available_weight.where(available_weight > 0)).clip(0, 100)

    result = base[["group_id", "m"]].copy()
    result["name"] = NAME
    result["value"] = value.round(2)
    result["coverage"] = available_weight.round(2)
    # La confianza heredada del motor también queda limitada por la cobertura
    # específica de trayectoria: seis meses son necesarios para comparar ciclos.
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
