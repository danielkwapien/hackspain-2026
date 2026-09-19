"""Data-Driven Peer Learning: conocimiento transferido entre trayectorias.

La amplitud histórica de una plataforma financiera permite que una empresa no
sea evaluada únicamente por su propio pasado. Esta señal aprende de situaciones
anteriores comparables y transfiere el desenlace observado a la compañía que se
analiza. El resultado convierte la experiencia acumulada de la cartera en una
expectativa financiera común y explicable.

El aprendizaje se mantiene deliberadamente causal: para puntuar un mes solo se
usan casos cuyo desenlace a tres meses ya era conocido entonces. Un KNN ligero
sobre los cinco pilares ofrece una primera lectura rápida, determinista y fácil
de auditar, sin dependencias de machine learning adicionales.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


NAME = "data_driven_peer_learning"
PILLARS = ("liquidity", "payment", "collections", "debt", "activity")
HORIZON_MONTHS = 3
NEIGHBOURS = 7


def _pillar_value(factors: object, pillar: str) -> float:
    if not isinstance(factors, dict) or pillar not in factors:
        return np.nan
    value = factors[pillar].score
    return np.nan if value is None else float(value)


def calculate(scored: pd.DataFrame) -> pd.DataFrame:
    """Estima la salud a tres meses desde vecinos con futuro ya observado."""
    base = scored[["group_id", "m", "score", "factors"]].copy()
    base = base.sort_values(["m", "group_id"]).reset_index(drop=True)
    features = np.column_stack([
        base["factors"].map(lambda factors: _pillar_value(factors, pillar)).to_numpy(float)
        for pillar in PILLARS
    ])

    # El objetivo pertenece a la misma empresa tres meses después. Su fecha se
    # conserva para impedir que el modelo vea un desenlace aún desconocido.
    by_group = base.groupby("group_id", sort=False)
    base["future_score"] = by_group["score"].shift(-HORIZON_MONTHS)
    base["future_month"] = by_group["m"].shift(-HORIZON_MONTHS)

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
