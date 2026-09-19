"""Perspectiva de salud del ecosistema comercial.

Por qué existe
--------------
Una empresa no evoluciona de forma aislada. La estabilidad de clientes,
proveedores y demás contrapartes se transmite a sus cobros, pagos y necesidades
de financiación. La calidad de la red comercial forma parte de su resiliencia.

Qué representa
--------------
Resume la fortaleza financiera observada en las relaciones que sostienen la
actividad. Una red puntual, recurrente y estable refuerza la salud de la empresa;
una red sometida a mora y discontinuidad incrementa la presión sobre su caja.

Cómo se entiende
----------------
El comportamiento de las relaciones se observa mediante puntualidad de pago,
cartera vigente y continuidad de cobro. Estas dimensiones se integran respetando
la información disponible y permiten seguir la evolución del ecosistema en cada
periodo. La evidencia conserva los componentes que explican el resultado.

Qué aporta
----------
Introduce una visión sistémica en el análisis financiero. Permite anticipar cómo
la calidad del entorno comercial puede reforzar o debilitar a la compañía y sienta
una base natural para analizar concentración, dependencia, centralidad y
propagación de salud a través de redes empresariales.
"""

from __future__ import annotations

import pandas as pd


NAME = "network_counterparty_health"


def _safe_ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    """Expresa una magnitud comercial respecto al volumen que la origina."""
    return numerator.div(denominator.where(denominator > 0))


def _relationship_components(base: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.Series, pd.Series]:
    """Construye las dimensiones observables de calidad de contraparte."""
    late_rate = _safe_ratio(base["ar_late3"], base["ar_paid3"]).clip(0, 1)
    overdue_rate = _safe_ratio(base["ar_overdue"], base["ar_open"]).clip(0, 1)
    continuity = _safe_ratio(base["ar_paid3"], base["ar_iss3"]).clip(0, 1)
    components = pd.DataFrame({
        "payment_punctuality": 100.0 * (1.0 - late_rate),
        "portfolio_freshness": 100.0 * (1.0 - overdue_rate),
        "collection_continuity": 100.0 * continuity,
    })
    return components, late_rate, overdue_rate, continuity


def _aggregate_relationship_health(components: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Integra las dimensiones disponibles según su relevancia financiera."""
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
    return value, observed_weight


def calculate(panel: pd.DataFrame) -> pd.DataFrame:
    """Construye la perspectiva mensual de salud de la red comercial."""
    columns = {
        "group_id", "m", "ar_late3", "ar_paid3", "ar_overdue", "ar_open", "ar_iss3"
    }
    missing = columns.difference(panel.columns)
    if missing:
        raise ValueError(f"Faltan columnas para {NAME}: {sorted(missing)}")
    base = panel[list(columns)].sort_values(["group_id", "m"]).reset_index(drop=True)

    components, late_rate, overdue_rate, continuity = _relationship_components(base)
    value, observed_weight = _aggregate_relationship_health(components)

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
