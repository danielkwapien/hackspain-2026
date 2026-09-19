"""Perspectiva de salud financiera actual.

Por qué existe
--------------
El análisis empresarial comienza por comprender la posición financiera presente.
Liquidez, disciplina de pago, calidad de los cobros, deuda y actividad describen
si la compañía dispone hoy de una estructura equilibrada para operar y responder
a sus compromisos. Esta fotografía constituye la base contrastable del diagnóstico.

Qué representa
--------------
Sintetiza esas dimensiones en una lectura común de 0 a 100, manteniendo visibles
los pilares que explican el resultado. El valor expresa fortaleza financiera; la
confianza y la cobertura indican la solidez informativa que sostiene esa lectura.

Cómo se entiende
----------------
La señal integra indicadores financieros complementarios, preserva el efecto de
los puntos débiles y evita que la ausencia de información se confunda con mala
salud. El resultado corresponde siempre a la información disponible en la fecha
evaluada y puede observarse de manera consistente a lo largo del tiempo.

Qué aporta
----------
Ofrece un punto de partida estable, explicable y comparable. Permite interpretar
el resto de perspectivas —trayectoria, aprendizaje colectivo, posición entre
pares y ecosistema— sobre una referencia financiera reconocible y auditable.
"""

from __future__ import annotations

import pandas as pd


NAME = "current_health"


def _validate_inputs(scored: pd.DataFrame) -> None:
    """Comprueba que están presentes todas las dimensiones del diagnóstico."""
    required = {"group_id", "m", "score", "confidence", "coverage", "factors"}
    missing = required.difference(scored.columns)
    if missing:
        raise ValueError(f"Faltan columnas para {NAME}: {sorted(missing)}")


def _factor_evidence(factors: object) -> dict[str, float | None]:
    """Presenta los pilares como evidencia directa de la salud observada."""
    if not isinstance(factors, dict):
        return {}
    return {
        name: None if factor.score is None else round(float(factor.score), 2)
        for name, factor in factors.items()
    }


def calculate(scored: pd.DataFrame) -> pd.DataFrame:
    """Construye la perspectiva mensual de salud, calidad y evidencia."""
    _validate_inputs(scored)

    result = scored[["group_id", "m"]].copy()
    result["name"] = NAME
    result["value"] = pd.to_numeric(scored["score"], errors="coerce").clip(0, 100)
    result["confidence"] = pd.to_numeric(scored["confidence"], errors="coerce").clip(0, 1)
    result["coverage"] = pd.to_numeric(scored["coverage"], errors="coerce").clip(0, 1)
    result["direction"] = result["value"].map(lambda value: "stable" if pd.notna(value) else "unknown")
    result["evidence"] = scored["factors"].map(_factor_evidence)
    return result
