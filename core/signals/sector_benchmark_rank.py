"""Sector Benchmark Rank: contexto competitivo para interpretar la salud.

Una cifra financiera aislada no significa lo mismo en compañías de escalas y
estructuras distintas. Esta señal sitúa a cada grupo frente a organizaciones
comparables y convierte su posición relativa en un percentil 0..100.

Al no existir CNAE en el dataset, "sector" significa aquí sector financiero
conductual: moneda dominante, banda estable de tamaño y presencia de carga de
financiación. La definición queda visible en la evidencia para no presentar una
clasificación inferida como si fuera una categoría legal.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


NAME = "sector_benchmark_rank"
MIN_COHORT_SIZE = 5


def _size_band(flow: object) -> str:
    """Crea bandas absolutas y reproducibles, independientes del lote cargado."""
    if pd.isna(flow) or float(flow) <= 0:
        return "inactive"
    exponent = int(np.floor(np.log10(max(float(flow), 1.0))))
    return f"size_1e{min(9, max(3, exponent))}"


def calculate(panel: pd.DataFrame, scored: pd.DataFrame) -> pd.DataFrame:
    """Calcula el percentil mensual dentro del sector financiero inferido."""
    columns = ["group_id", "m", "group_currency", "op_in_3m", "debt_rep_3m"]
    missing = set(columns).difference(panel.columns)
    if missing:
        raise ValueError(f"Faltan columnas para {NAME}: {sorted(missing)}")

    base = scored[["group_id", "m", "score"]].merge(
        panel[columns], on=["group_id", "m"], how="left", validate="one_to_one"
    ).sort_values(["m", "group_id"]).reset_index(drop=True)
    base["size_band"] = base["op_in_3m"].map(_size_band)
    base["funding_profile"] = np.where(base["debt_rep_3m"].fillna(0) > 0, "financed", "unlevered")
    base["currency"] = base["group_currency"].fillna("unknown").astype(str)
    base["sector"] = (
        base["currency"] + "_" + base["size_band"] + "_" + base["funding_profile"]
    )

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
