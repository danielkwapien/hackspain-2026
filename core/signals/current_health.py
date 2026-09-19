"""Salud financiera actual: la base clásica y explicable del diagnóstico.

Durante décadas, el análisis empresarial ha partido de una fotografía de
liquidez, pagos, cobros, deuda y actividad. Esa lectura sigue siendo esencial:
antes de anticipar el futuro hay que entender con rigor la capacidad financiera
que la empresa demuestra hoy.

Esta señal no inventa un segundo score. Publica, con un contrato común, el
resultado mensual que ya calcula el motor sobre esos cinco pilares. Así conserva
la trazabilidad del análisis tradicional y permite combinarlo después con
señales de trayectoria sin mezclar ambos conceptos.
"""

from __future__ import annotations

import pandas as pd


NAME = "current_health"


def _factor_evidence(factors: object) -> dict[str, float | None]:
    """Reduce los pilares a evidencia legible y serializable."""
    if not isinstance(factors, dict):
        return {}
    return {
        name: None if factor.score is None else round(float(factor.score), 2)
        for name, factor in factors.items()
    }


def calculate(scored: pd.DataFrame) -> pd.DataFrame:
    """Devuelve una observación de salud actual por grupo y mes.

    El índice temporal ya ha sido calculado point-in-time por el scoring: esta
    función únicamente lo empaqueta como señal estratégica y mantiene separadas
    salud, confianza y cobertura.
    """
    required = {"group_id", "m", "score", "confidence", "coverage", "factors"}
    missing = required.difference(scored.columns)
    if missing:
        raise ValueError(f"Faltan columnas para {NAME}: {sorted(missing)}")

    result = scored[["group_id", "m"]].copy()
    result["name"] = NAME
    result["value"] = pd.to_numeric(scored["score"], errors="coerce").clip(0, 100)
    result["confidence"] = pd.to_numeric(scored["confidence"], errors="coerce").clip(0, 1)
    result["coverage"] = pd.to_numeric(scored["coverage"], errors="coerce").clip(0, 1)
    result["direction"] = result["value"].map(lambda value: "stable" if pd.notna(value) else "unknown")
    result["evidence"] = scored["factors"].map(_factor_evidence)
    return result
