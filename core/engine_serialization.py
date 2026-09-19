from __future__ import annotations

from typing import Literal

import pandas as pd  # noqa: PANDAS_OK

from engine import MODEL_VERSION, Trace, band_for, build_drivers, early_warning, narrative, trajectory_for
from engine import config
from engine_contract import API_SIGNAL_IDS, PILLAR_CODES
from signals import specs_by_pillar

EntityKind = Literal["group", "company"]
Scalar = str | int | float | bool | None

def _number(value: Scalar) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def _delta(series: list[float | None], index: int, lag: int) -> float | None:
    if index < lag or series[index] is None or series[index - lag] is None:
        return None
    return round(float(series[index]) - float(series[index - lag]), 2)


def _adjusted_level(source_level: float | None, trace: list[dict]) -> float | None:
    if source_level is None:
        return None
    modifiers = [step for step in trace if step.get("stage") == "modifier"]
    value = float(modifiers[-1]["value"]) if modifiers else source_level
    return max(0.0, min(100.0, value))


def _cap(trace: list[dict]) -> tuple[float, str | None]:
    overrides = [step for step in trace if step.get("stage") == "override"]
    if not overrides:
        return 100.0, None
    selected = min(overrides, key=lambda step: float(step.get("detail", {}).get("ceiling", 100.0)))
    return float(selected.get("detail", {}).get("ceiling", 100.0)), str(selected["name"])


def _drivers(factors: dict, effective: dict, trace: list[dict]) -> list[dict]:
    drivers = [
        {
            "signal_id": f"PILLAR_{PILLAR_CODES[driver['factor']]}",
            "pillar": PILLAR_CODES[driver["factor"]],
            "contribution": driver["impact"],
            "delta_vs_prev": None,
            "value": _number(factors[driver["factor"]].score),
            "value_fmt": driver["message"],
            "direction": driver["direction"],
            "kind": "pillar",
            "message": driver["message"],
        }
        for driver in build_drivers(factors, effective)
    ]
    for step in trace:
        if step.get("stage") not in {"penalty", "modifier", "override"}:
            continue
        drivers.append({
            "signal_id": "PENALTY" if step["stage"] == "penalty" else str(step["name"]),
            "pillar": None,
            "contribution": _number(step.get("delta")),
            "delta_vs_prev": None,
            "value": _number(step.get("value")),
            "value_fmt": None,
            "direction": "positive" if float(step.get("delta", 0.0)) >= 0 else "negative",
            "kind": step["stage"],
            "message": None,
        })
    drivers.sort(key=lambda driver: abs(float(driver["contribution"] or 0.0)), reverse=True)
    return [{"rank": rank, **driver} for rank, driver in enumerate(drivers, start=1)]


def _raw_signals(factors: dict, effective: dict, previous: dict[str, float | None]) -> list[dict]:
    rows = []
    for pillar, signals in specs_by_pillar().items():
        factor = factors.get(pillar)
        metrics = factor.metrics if factor is not None else {}
        total_weight = sum(float(spec["weight"]) for spec in signals.values())
        for signal_id, spec in signals.items():
            value = _number(metrics.get(signal_id))
            points = _number(metrics.get(f"{signal_id}_points"))
            prior = previous.get(signal_id)
            delta = None if value is None or prior is None else round(value - prior, 4)
            rows.append({
                "signal_id": signal_id,
                "api_signal_id": API_SIGNAL_IDS.get(signal_id),
                "pillar": PILLAR_CODES[pillar],
                "label": spec["label"],
                "value": value,
                "value_fmt": None,
                "points": points,
                "u": None if points is None else round(points / 100.0, 6),
                "u_smooth": None,
                "u_ref": None,
                "weight": round(float(spec["weight"]) / total_weight, 6) if value is not None else 0.0,
                "effective_pillar_weight": _number(effective.get(pillar)),
                "contribution": None,
                "delta_vs_prev": delta,
                "is_available": value is not None,
                "quality_flag": None if value is not None else "missing",
            })
            if value is not None:
                previous[signal_id] = value
    return rows


def serialize_months(scored: pd.DataFrame, entity_kind: EntityKind) -> list[dict]:
    ordered = scored.sort_values("m")
    if entity_kind == "company":
        ordered = ordered[ordered["months_hist"] > 0]
    series = [_number(value) for value in ordered["score"].tolist()]
    buffers: list[float | None] = []
    previous_signals: dict[str, float | None] = {}
    months = []
    for index, (_, row) in enumerate(ordered.iterrows()):
        score = series[index]
        factors = row["factors"] or {}
        effective = row["effective"] or {}
        trace = row["trace"] if isinstance(row["trace"], list) else []
        source_level = _number(row["level"])
        level = _adjusted_level(source_level, trace)
        cap, cap_code = _cap(trace)
        trajectory = trajectory_for(series[: index + 1])
        trajectory.update({
            "delta_1m": _delta(series, index, 1),
            "delta_3m": _delta(series, index, 3),
            "delta_6m": _delta(series, index, 6),
            "z_own": None,
        })
        buffers.append(_number(row.get("buffer_days")))
        pillar_values = {
            code: {
                "value": None if factors.get(name) is None or factors[name].score is None
                else round(float(factors[name].score) / 100.0, 6),
                "weight": _number(effective.get(name)) or 0.0,
            }
            for name, code in PILLAR_CODES.items()
        }
        available = sum(value["value"] is not None for value in pillar_values.values())
        month_drivers = _drivers(factors, effective, trace) if factors else []
        month_narrative = narrative(Trace.from_list(trace), score, band_for(score))
        months.append({
            "month": row["m"].strftime("%Y-%m"),
            "month_index": index,
            "months_hist": int(row["months_hist"]),
            "warmup": int(row["months_hist"]) < config.MIN_MONTHS_FOR_SCORE,
            "branch": "full" if available == len(PILLAR_CODES) else f"{available}_of_5",
            "pillars": pillar_values,
            "source_level": source_level,
            "penalty": _number(row["penalty"]),
            "level": level,
            "cap": cap,
            "cap_code": cap_code,
            "cap_adjustment": None if level is None else round(level - min(level, cap), 2),
            "score": score,
            "band": band_for(score),
            "trajectory": trajectory,
            "outlook_3m": None,
            "outlook_6m": None,
            "outlook_low": None,
            "outlook_high": None,
            "confidence": _number(row["confidence"]),
            "coverage": _number(row["coverage"]),
            "basis": "point_in_time",
            "signals": row["strategic_signals"],
            "raw_signals": _raw_signals(factors, effective, previous_signals),
            "drivers": month_drivers,
            "narrative": month_narrative,
            "early_warning": early_warning(buffers),
            "trace": trace,
        })
    return months


def build_results(scored: pd.DataFrame, entity_kind: EntityKind = "group") -> list[dict]:
    results = []
    for entity_id, sub in scored.groupby("group_id"):
        months = serialize_months(sub, entity_kind)
        if not months:
            continue
        last_row = sub[sub["m"].dt.strftime("%Y-%m") == months[-1]["month"]].iloc[-1]
        factors = last_row["factors"] or {}
        effective = last_row["effective"] or {}
        score = months[-1]["score"]
        trace = months[-1]["trace"]
        reasons = [f"{name}: {factor.reason}" for name, factor in factors.items()
                   if factor.score is None and factor.reason]
        status = "insufficient_data" if score is None else (
            "available" if float(last_row["coverage"]) >= 0.99 else "partial")
        results.append({
            "contract_version": "dashboard-v1",
            "entity": {"kind": entity_kind, "id": entity_id},
            "cutoff_date": last_row["m"].strftime("%Y-%m-%d"),
            "model_version": MODEL_VERSION,
            "data_version": "embat-v2",
            "status": status,
            "score": score,
            "band": band_for(score),
            "months": months,
            "trajectory": months[-1]["trajectory"],
            "signals": last_row["strategic_signals"],
            "quality": {
                "coverage_ratio": float(last_row["coverage"]),
                "confidence": float(last_row["confidence"]),
                "months_history": int(last_row["months_hist"]),
                "reasons": reasons,
                "warnings": [],
            },
            "factors": {
                name: {
                    "score": factor.score,
                    "weight": config.PILLAR_WEIGHTS[name],
                    "effective_weight": effective.get(name),
                    "metrics": factor.metrics,
                    "reason": factor.reason,
                }
                for name, factor in factors.items()
            },
            "penalty": float(last_row["penalty"]),
            "level": months[-1]["level"],
            "source_level": months[-1]["source_level"],
            "caps": list(last_row["caps"]) if isinstance(last_row["caps"], list) else [],
            "explanation": narrative(Trace.from_list(trace), score, band_for(score)),
            "early_warning": months[-1]["early_warning"],
            "drivers": months[-1]["drivers"],
            "alerts": [],
            "forecast": None,
        })
    return sorted(results, key=lambda result: result["entity"]["id"])
