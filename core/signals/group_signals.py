"""Punto único de integración de las señales estratégicas con el scoring."""

from __future__ import annotations

import pandas as pd

from . import (
    current_health,
    data_driven_peer_learning,
    network_counterparty_health,
    sector_benchmark_rank,
    trajectory_pressure,
)


def calculate_group_signals(panel: pd.DataFrame, scored: pd.DataFrame) -> pd.DataFrame:
    """Ejecuta cada perspectiva sin acoplar su cálculo al score final."""
    frames = [
        current_health.calculate(scored),
        trajectory_pressure.calculate(panel, scored),
        data_driven_peer_learning.calculate(scored),
        sector_benchmark_rank.calculate(panel, scored),
        network_counterparty_health.calculate(panel),
    ]
    result = pd.concat(frames, ignore_index=True)
    duplicated = result.duplicated(["group_id", "m", "name"])
    if duplicated.any():
        raise ValueError("Una señal estratégica produjo más de un valor por grupo y mes")
    return result.sort_values(["group_id", "m", "name"]).reset_index(drop=True)


def attach_group_signals(panel: pd.DataFrame, scored: pd.DataFrame) -> pd.DataFrame:
    """Añade a cada fila del scoring un diccionario listo para el JSON."""
    long = calculate_group_signals(panel, scored)

    def pack(rows: pd.DataFrame) -> dict[str, dict]:
        packed = {}
        for row in rows.itertuples(index=False):
            packed[row.name] = {
                "value": None if pd.isna(row.value) else float(row.value),
                "confidence": None if pd.isna(row.confidence) else float(row.confidence),
                "coverage": None if pd.isna(row.coverage) else float(row.coverage),
                "direction": row.direction,
                "evidence": row.evidence,
            }
        return packed

    packed = long.groupby(["group_id", "m"], sort=False).apply(pack, include_groups=False)
    packed.name = "strategic_signals"
    result = scored.merge(packed.reset_index(), on=["group_id", "m"], how="left", validate="one_to_one")
    result["strategic_signals"] = result["strategic_signals"].map(
        lambda value: value if isinstance(value, dict) else {}
    )
    return result
