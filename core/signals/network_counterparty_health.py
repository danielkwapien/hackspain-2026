"""Network Counterparty Health: salud transmitida por el ecosistema comercial.

Las empresas forman parte de una red: la calidad de clientes y contrapartes
condiciona la estabilidad de sus cobros y, por extensión, su propia capacidad
financiera. Esta señal traslada esa visión de ecosistema al score mediante el
comportamiento realmente observado en facturas.

Mientras no exista una resolución directa entre ``counterparty_id`` y las
empresas puntuadas, la salud de la red se infiere por tres manifestaciones
observables: puntualidad, ausencia de cartera vencida y continuidad de cobro.
La aproximación evita atribuir a una contraparte un score que los datos todavía
no permiten identificar, pero conserva la narrativa económica de la red.
"""

from __future__ import annotations

import pandas as pd


NAME = "network_counterparty_health"


def _safe_ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return numerator.div(denominator.where(denominator > 0))


def calculate(panel: pd.DataFrame) -> pd.DataFrame:
    """Resume la calidad mensual de las relaciones de cobro en una escala 0..100."""
    columns = {
        "group_id", "m", "ar_late3", "ar_paid3", "ar_overdue", "ar_open", "ar_iss3"
    }
    missing = columns.difference(panel.columns)
    if missing:
        raise ValueError(f"Faltan columnas para {NAME}: {sorted(missing)}")
    base = panel[list(columns)].sort_values(["group_id", "m"]).reset_index(drop=True)

    late_rate = _safe_ratio(base["ar_late3"], base["ar_paid3"]).clip(0, 1)
    overdue_rate = _safe_ratio(base["ar_overdue"], base["ar_open"]).clip(0, 1)
    continuity = _safe_ratio(base["ar_paid3"], base["ar_iss3"]).clip(0, 1)
    components = pd.DataFrame({
        "payment_punctuality": 100.0 * (1.0 - late_rate),
        "portfolio_freshness": 100.0 * (1.0 - overdue_rate),
        "collection_continuity": 100.0 * continuity,
    })
    weights = pd.Series({
        "payment_punctuality": 0.40,
        "portfolio_freshness": 0.40,
        "collection_continuity": 0.20,
    })
    available = components.notna().mul(weights, axis=1)
    observed_weight = available.sum(axis=1)
    value = components.fillna(0).mul(weights, axis=1).sum(axis=1).div(
        observed_weight.where(observed_weight > 0)
    ).clip(0, 100)

    previous = value.groupby(base["group_id"]).shift(1)
    change = value - previous
    direction = change.map(
        lambda delta: "unknown" if pd.isna(delta) else (
            "improving" if delta > 5 else "deteriorating" if delta < -5 else "stable"
        )
    )
    evidence = [
        {
            "customer_late_rate": None if pd.isna(late) else round(float(late), 3),
            "customer_overdue_rate": None if pd.isna(overdue) else round(float(overdue), 3),
            "collection_continuity": None if pd.isna(collected) else round(float(collected), 3),
        }
        for late, overdue, collected in zip(late_rate, overdue_rate, continuity)
    ]
    return pd.DataFrame({
        "group_id": base["group_id"], "m": base["m"], "name": NAME,
        "value": value.round(2), "confidence": observed_weight.round(3),
        "coverage": observed_weight.round(2), "direction": direction, "evidence": evidence,
    })
