"""Perspectiva de posición competitiva entre pares financieros.

Por qué existe
--------------
Un mismo nivel financiero puede tener significados diferentes según la escala,
la estructura y el entorno operativo de una empresa. Comparar indiscriminadamente
organizaciones heterogéneas oculta qué rendimiento es realmente destacable.

Qué representa
--------------
Sitúa a la compañía dentro de un arquetipo financiero comparable y expresa su
posición como percentil. El resultado responde a una pregunta directa: qué parte
de sus pares presenta una salud inferior y qué parte se encuentra por delante.

Cómo se entiende
----------------
Los pares se organizan mediante características estructurales como dimensión de
los flujos, moneda y perfil de financiación. Dentro de cada cohorte se ordena la
salud financiera bajo una referencia común, manteniendo visible la composición y
profundidad del grupo utilizado para la comparación.

Qué aporta
----------
Transforma un score absoluto en contexto competitivo. Permite detectar empresas
que destacan dentro de su realidad económica, interpretar mejor diferencias de
escala y construir benchmarks útiles para seguimiento, priorización y análisis
comparativo de carteras.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


NAME = "sector_benchmark_rank"
MIN_COHORT_SIZE = 5


def _size_band(flow: object) -> str:
    """Representa la escala operativa mediante una banda financiera estable."""
    if pd.isna(flow) or float(flow) <= 0:
        return "inactive"
    exponent = int(np.floor(np.log10(max(float(flow), 1.0))))
    return f"size_1e{min(9, max(3, exponent))}"


def _build_financial_sectors(base: pd.DataFrame) -> pd.DataFrame:
    """Asigna un arquetipo de escala, moneda y perfil de financiación."""
    result = base.copy()
    result["size_band"] = result["op_in_3m"].map(_size_band)
    result["funding_profile"] = np.where(
        result["debt_rep_3m"].fillna(0) > 0, "financed", "unlevered"
    )
    result["currency"] = result["group_currency"].fillna("unknown").astype(str)
    result["sector"] = (
        result["currency"] + "_" + result["size_band"] + "_" + result["funding_profile"]
    )
    return result


def calculate(panel: pd.DataFrame, scored: pd.DataFrame) -> pd.DataFrame:
    """Calcula la posición mensual de cada empresa dentro de su arquetipo."""
    columns = ["group_id", "m", "group_currency", "op_in_3m", "debt_rep_3m"]
    missing = set(columns).difference(panel.columns)
    if missing:
        raise ValueError(f"Faltan columnas para {NAME}: {sorted(missing)}")

    base = scored[["group_id", "m", "score"]].merge(
        panel[columns], on=["group_id", "m"], how="left", validate="one_to_one"
    ).sort_values(["m", "group_id"]).reset_index(drop=True)
    base = _build_financial_sectors(base)

    # Se intenta la cohorte más específica y se amplía vectorialmente cuando no
    # hay suficientes comparables. El cálculo completo evita bucles por empresa.
    currency_size = base["currency"] + "_" + base["size_band"]
    currency_all = base["currency"] + "_all_sizes"
    specific_count = base.groupby(["m", "sector"])["score"].transform("count")
    size_count = base.assign(_cohort=currency_size).groupby(["m", "_cohort"])["score"].transform("count")
    base["used_sector"] = np.where(
        specific_count >= MIN_COHORT_SIZE,
        base["sector"],
        np.where(size_count >= MIN_COHORT_SIZE, currency_size, currency_all),
    )
    cohort_sizes = base.groupby(["m", "used_sector"])["score"].transform("count").astype(int)
    ranks = base.groupby(["m", "used_sector"])["score"].rank(method="average")
    values = (100.0 * (ranks - 0.5) / cohort_sizes.where(cohort_sizes > 0)).clip(0, 100)
    used_labels = base["used_sector"]

    previous = values.groupby(base["group_id"]).shift(1)
    change = values - previous
    direction = change.map(
        lambda delta: "unknown" if pd.isna(delta) else (
            "improving" if delta > 5 else "deteriorating" if delta < -5 else "stable"
        )
    )
    confidence = (cohort_sizes / 20.0).clip(upper=1.0)
    coverage = (
        base[["group_currency", "op_in_3m", "debt_rep_3m"]].notna().mean(axis=1)
        * base["score"].notna().astype(float)
    )
    evidence = [
        {
            "financial_sector": label or None,
            "cohort_size": int(size),
            "health_percentile": None if pd.isna(value) else round(float(value), 2),
        }
        for label, size, value in zip(used_labels, cohort_sizes, values)
    ]
    return pd.DataFrame({
        "group_id": base["group_id"], "m": base["m"], "name": NAME,
        "value": values.round(2), "confidence": (confidence * coverage).round(3),
        "coverage": coverage.round(2), "direction": direction, "evidence": evidence,
    })
