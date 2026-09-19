"""Perspectiva de aprendizaje financiero basado en datos.

Por qué existe
--------------
La experiencia acumulada en una cartera contiene patrones que una empresa aislada
no puede revelar. Situaciones de liquidez, pagos, cobros, deuda y actividad que ya
han ocurrido permiten aprender qué evoluciones suelen seguir a perfiles semejantes.

Qué representa
--------------
Expresa la salud futura esperada a partir del comportamiento posterior observado
en trayectorias comparables. No sustituye el diagnóstico propio de la compañía:
añade una perspectiva colectiva basada en evidencia histórica compartida.

Cómo se entiende
----------------
Cada observación se representa mediante un perfil financiero multidimensional.
El sistema identifica experiencias históricas próximas, estudia sus desenlaces y
transfiere ese conocimiento de forma ponderada. La similitud, el número de casos
comparables y el acuerdo entre ellos determinan la confianza de la expectativa.
El aprendizaje respeta el orden temporal para reproducir lo que podía conocerse
en cada fecha.

Qué aporta
----------
Convierte la profundidad de datos de Embat en una ventaja acumulativa: cada nueva
evaluación puede beneficiarse de trayectorias ya observadas. Añade capacidad de
generalización, contexto empírico y una explicación intuitiva del pronóstico:
empresas con perfiles semejantes mostraron posteriormente una evolución concreta.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


NAME = "data_driven_peer_learning"
PILLARS = ("liquidity", "payment", "collections", "debt", "activity")
HORIZON_MONTHS = 3
NEIGHBOURS = 7


def _pillar_value(factors: object, pillar: str) -> float:
    """Extrae una dimensión comparable del perfil financiero."""
    if not isinstance(factors, dict) or pillar not in factors:
        return np.nan
    value = factors[pillar].score
    return np.nan if value is None else float(value)


def _build_feature_matrix(base: pd.DataFrame) -> np.ndarray:
    """Representa cada observación mediante sus cinco dimensiones financieras."""
    return np.column_stack([
        base["factors"].map(lambda factors: _pillar_value(factors, pillar)).to_numpy(float)
        for pillar in PILLARS
    ])


def _attach_forward_outcomes(base: pd.DataFrame) -> pd.DataFrame:
    """Asocia cada perfil con la evolución financiera observada a tres meses."""
    result = base.copy()
    by_group = result.groupby("group_id", sort=False)
    result["future_score"] = by_group["score"].shift(-HORIZON_MONTHS)
    result["future_month"] = by_group["m"].shift(-HORIZON_MONTHS)
    return result


def calculate(scored: pd.DataFrame) -> pd.DataFrame:
    """Transfiere a cada empresa la evolución observada en perfiles comparables."""
    base = scored[["group_id", "m", "score", "factors"]].copy()
    base = base.sort_values(["m", "group_id"]).reset_index(drop=True)
    features = _build_feature_matrix(base)
    base = _attach_forward_outcomes(base)

    values = np.full(len(base), np.nan)
    confidences = np.zeros(len(base))
    coverages = np.isfinite(features).mean(axis=1)
    directions = np.full(len(base), "unknown", dtype=object)
    evidence: list[dict] = [{} for _ in range(len(base))]

    for month in base["m"].drop_duplicates().sort_values():
        query_indices = np.flatnonzero(base["m"].eq(month).to_numpy())
        train_mask = base["future_month"].le(month) & base["future_score"].notna()
        train_indices = np.flatnonzero(train_mask.to_numpy())
        if not len(train_indices):
            continue

        train_features = features[train_indices]
        train_targets = base.loc[train_indices, "future_score"].to_numpy(float)
        train_groups = base.loc[train_indices, "group_id"].to_numpy()

        query_features = features[query_indices]
        common = np.isfinite(query_features[:, None, :]) & np.isfinite(train_features[None, :, :])
        common_count = common.sum(axis=2)
        squared = np.where(
            common, (query_features[:, None, :] - train_features[None, :, :]) ** 2, 0.0
        )
        distances = np.sqrt(squared.sum(axis=2) / np.maximum(common_count, 1))
        same_group = (
            base.loc[query_indices, "group_id"].to_numpy()[:, None] == train_groups[None, :]
        )
        distances[(common_count < 3) | same_group] = np.inf
        candidate_count = min(NEIGHBOURS, distances.shape[1])
        nearest_matrix = np.argpartition(
            distances, kth=candidate_count - 1, axis=1
        )[:, :candidate_count]

        for query_position, query_index in enumerate(query_indices):
            candidates = nearest_matrix[query_position]
            candidates = candidates[np.isfinite(distances[query_position, candidates])]
            nearest = candidates[np.argsort(distances[query_position, candidates])]
            if not len(nearest):
                continue
            neighbour_distances = distances[query_position, nearest]
            weights = 1.0 / (neighbour_distances + 5.0)
            prediction = float(np.average(train_targets[nearest], weights=weights))
            similarity = float(np.average(1.0 / (1.0 + neighbour_distances / 25.0)))

            values[query_index] = np.clip(prediction, 0, 100)
            confidences[query_index] = similarity * min(1.0, len(nearest) / NEIGHBOURS)
            current = base.at[query_index, "score"]
            if pd.notna(current):
                change = prediction - float(current)
                directions[query_index] = (
                    "improving" if change > 2 else "deteriorating" if change < -2 else "stable"
                )
            evidence[query_index] = {
                "neighbour_count": int(len(nearest)),
                "mean_similarity": round(similarity, 3),
                "expected_health_3m": round(prediction, 2),
                "current_health": None if pd.isna(current) else round(float(current), 2),
            }

    return pd.DataFrame({
        "group_id": base["group_id"],
        "m": base["m"],
        "name": NAME,
        "value": np.round(values, 2),
        "confidence": np.round(confidences * coverages, 3),
        "coverage": np.round(coverages, 2),
        "direction": directions,
        "evidence": evidence,
    })
