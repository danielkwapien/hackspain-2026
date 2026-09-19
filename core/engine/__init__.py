"""Motor de scoring por capas.

    nivel      = familias mezcladas, encogidas por cobertura, menos el eslabon debil
    ajustes    = las perspectivas de `signals/`, acotadas y escaladas por confianza
    techos     = cortes absolutos por eventos duros
    score      = banda + confianza + alerta de liquidez aparte

Cada capa es un modulo, cada capa deja su paso escrito en el rastro, y todo
lo que se puede tocar esta en `config.py`.

Punto de entrada unico:

    from engine import score_panel
    scored = score_panel(panel, signal_values, specs_by_pillar())
"""

from __future__ import annotations

import pandas as pd

from . import config
from .calibrate import band_for, buffer_band, confidence_for, early_warning, history_factor
from .combine import combine
from .explain import build_drivers, narrative
from .families import Factor, build_factor, smooth_series
from .normalize import interpolate, score_signal
from .overrides import apply as apply_overrides
from .strategic import apply as apply_strategic
from .trace import Trace
from .trajectory import trajectory_for

MODEL_VERSION = "embat-layered-v1"

__all__ = [
    "MODEL_VERSION", "Factor", "Trace", "score_panel", "score_group", "finalise",
    "band_for", "buffer_band", "confidence_for", "early_warning", "history_factor",
    "build_drivers", "narrative", "trajectory_for", "smooth_series",
    "interpolate", "score_signal", "config",
]


def _row_values(row: pd.Series, specs: dict[str, dict[str, dict]]
                ) -> dict[str, dict[str, float | None]]:
    """Reparte los valores de una fila entre las familias que los declaran."""
    values: dict[str, dict[str, float | None]] = {}
    for pillar, signals in specs.items():
        values[pillar] = {}
        for name in signals:
            value = row.get(name)
            values[pillar][name] = None if value is None or pd.isna(value) else float(value)
    return values


def score_group(entries: list[tuple], specs: dict[str, dict[str, dict]]) -> list[dict]:
    """Puntua la serie completa de UN grupo.

    `entries` viene ordenada de mas antigua a mas reciente, cada elemento
    `(month, months_hist, values_por_pilar_o_None, extras)`. Se hace en dos
    pasadas porque el suavizado necesita la serie del pilar antes de combinar.
    """
    raw_factors: list[dict[str, Factor] | None] = []
    for _, _, values, _ in entries:
        if values is None:
            raw_factors.append(None)
            continue
        raw_factors.append({
            pillar: build_factor(pillar, values[pillar], specs[pillar])
            for pillar in specs
        })

    smoothed: dict[str, list[float | None]] = {}
    for pillar in specs:
        series = [(f[pillar].score if f else None) for f in raw_factors]
        smoothed[pillar] = smooth_series(series)

    rows: list[dict] = []
    negative_cash_history: list[bool] = []

    for index, (month, months_hist, values, extras) in enumerate(entries):
        extras = extras or {}
        negative_cash_history.append(bool(extras.get("cash_negative")))

        if raw_factors[index] is None:
            rows.append({"month": month, "months_hist": months_hist, "score": None,
                         "level": None, "coverage": 0.0, "confidence": 0.0,
                         "penalty": 0.0, "factors": None, "effective": {},
                         "caps": [], "trace": [], "band": None,
                         "buffer_days": extras.get("buffer_days")})
            continue

        trace = Trace()
        damped = {
            name: Factor(smoothed[name][index], factor.metrics, factor.reason)
            for name, factor in raw_factors[index].items()
        }
        for name, factor in damped.items():
            if factor.score is not None:
                trace.add("family", name, value=factor.score,
                          weight=config.PILLAR_WEIGHTS[name])

        level, coverage, effective, penalty = combine(
            damped, trace, history_factor(months_hist))
        if level is None:
            rows.append({"month": month, "months_hist": months_hist, "score": None,
                         "level": None, "coverage": coverage, "confidence": 0.0,
                         "penalty": 0.0, "factors": damped, "effective": {},
                         "caps": [], "trace": trace.as_list(), "band": None,
                         "buffer_days": extras.get("buffer_days")})
            continue

        # Los ajustes se aplican en la segunda pasada (`finalise`): las
        # perspectivas que los producen necesitan que el nivel exista antes.
        confidence = confidence_for(months_hist, coverage)
        score = level
        band = band_for(score)

        rows.append({"month": month, "months_hist": months_hist,
                     "score": round(score, 2), "level": round(level, 2),
                     "coverage": coverage, "confidence": confidence,
                     "penalty": penalty, "factors": damped, "effective": effective,
                     "caps": [], "trace": trace.as_list(), "band": band,
                     "buffer_days": extras.get("buffer_days"),
                     "cash_negative_history": list(negative_cash_history),
                     "loc_utilisation": extras.get("loc_utilisation")})
    return rows


def finalise(scored: pd.DataFrame, signal_column: str = "strategic_signals") -> pd.DataFrame:
    """Segunda pasada: perspectivas estrategicas y despues los techos.

    Se separa de `score_panel` porque senales como `trajectory_pressure` o
    `sector_benchmark_rank` necesitan el nivel ya calculado -el propio, o el de
    toda la cartera- antes de poder existir. Los techos van al final: un techo
    corta el resultado, no discute con los ajustes.
    """
    result = scored.copy()
    scores, bands, caps_out, traces = [], [], [], []

    for row in result.itertuples(index=False):
        level = getattr(row, "level", None)
        if level is None or pd.isna(level):
            scores.append(None); bands.append(None); caps_out.append([])
            traces.append(list(getattr(row, "trace", []) or []))
            continue

        trace = Trace.from_list(list(getattr(row, "trace", []) or []))
        signals = getattr(row, signal_column, None) or {}
        score = apply_strategic(float(row.score), signals, trace)

        score, caps = apply_overrides(score, {
            "negative_cash_history": list(getattr(row, "cash_negative_history", []) or []),
            "loc_utilisation": getattr(row, "loc_utilisation", None),
        }, trace)

        band = band_for(score)
        trace.add("final", "score", value=score, band=band)
        scores.append(round(score, 2)); bands.append(band)
        caps_out.append(caps); traces.append(trace.as_list())

    result["score"] = scores
    result["band"] = bands
    result["caps"] = caps_out
    result["trace"] = traces
    return result


def score_panel(panel: pd.DataFrame, values: pd.DataFrame,
                specs: dict[str, dict[str, dict]],
                extras: dict[str, str] | None = None) -> pd.DataFrame:
    """Puntua el panel entero, grupo a grupo.

    `panel` aporta group_id, m y months_hist; `values` los valores crudos de
    cada senal con el mismo indice. `extras` mapea nombre logico -> columna
    del panel para lo que consumen modificadores y techos.
    """
    extras = extras or {}
    ordered = panel.sort_values(["group_id", "m"])
    grouped: dict[str, list[tuple]] = {}

    for index, row in ordered.iterrows():
        group_id = row["group_id"]
        months_hist = int(row["months_hist"])
        extra = {name: row.get(column) for name, column in extras.items()}
        extra = {k: (None if v is None or (not isinstance(v, (list, bool)) and pd.isna(v)) else v)
                 for k, v in extra.items()}
        extra["cash_negative"] = bool(row.get("cash_eom", 0) is not None
                                      and pd.notna(row.get("cash_eom"))
                                      and row.get("cash_eom") < 0)
        payload = (None if months_hist < config.MIN_MONTHS_FOR_SCORE
                   else _row_values(values.loc[index], specs))
        grouped.setdefault(group_id, []).append((row["m"], months_hist, payload, extra))

    records: list[dict] = []
    for group_id, entries in grouped.items():
        for scored in score_group(entries, specs):
            records.append({"group_id": group_id, "m": scored.pop("month"), **scored})
    return pd.DataFrame(records).sort_values(["group_id", "m"]).reset_index(drop=True)
