import json
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

import polars as pl

type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | Sequence[JsonValue] | Mapping[str, JsonValue]
MODEL_VERSION: Final[str] = "score-v0.3-operating-sufficiency"


def numeric_or_none(value: float | None) -> float | None:
    return None if value is None else float(value)


def series_filename(company_id: str, currency: str) -> str:
    return f"{company_id}__{currency}.json"


def remove_stale_results(result_dir: Path, expected_filenames: frozenset[str]) -> tuple[str, ...]:
    removed: list[str] = []
    resolved_dir = result_dir.resolve()
    for path in sorted(result_dir.glob("*.json")):
        if path.name not in expected_filenames:
            assert path.resolve().parent == resolved_dir
            path.unlink()
            removed.append(path.name)
    return tuple(removed)


def select_representative_cases(scores: pl.DataFrame) -> pl.DataFrame:
    latest = (
        scores.filter(pl.col("score").is_not_null())
        .sort("company_id", "currency", "month")
        .group_by("company_id", "currency", maintain_order=True)
        .tail(1)
    )
    with_delta = latest.filter(pl.col("score_delta_3m").is_not_null())
    stable = with_delta.filter(pl.col("online_regime") == "stable")
    case_frames = (
        with_delta.sort(
            "score_delta_3m", "company_id", "currency",
            descending=[True, False, False],
        ).head(1),
        with_delta.sort("score_delta_3m", "company_id", "currency").head(1),
        stable.sort(
            "score", "company_id", "currency", descending=[True, False, False]
        ).head(1),
        stable.sort("score", "company_id", "currency").head(1),
    )
    return pl.concat(case_frames).unique(
        subset=["company_id", "currency"], keep="first", maintain_order=True
    )


def main() -> None:
    root = Path.cwd()
    score_dir = root / "artifacts" / "score"
    export_dir = root / "exports" / "v1"
    result_dir = export_dir / "results"
    result_dir.mkdir(parents=True, exist_ok=True)
    scores = pl.read_parquet(score_dir / "scores.parquet")
    features = pl.read_parquet(root / "data" / "processed" / "monthly_features.parquet")
    inventory = pl.read_parquet(root / "artifacts" / "audit" / "inventory.parquet")
    forecast_metrics = pl.read_parquet(root / "artifacts" / "forecast" / "metrics.parquet")

    scores.write_parquet(export_dir / "scores.parquet")
    features.write_parquet(export_dir / "features.parquet")
    cases = select_representative_cases(scores)
    expected_filenames = frozenset(
        series_filename(str(row["company_id"]), str(row["currency"]))
        for row in cases.iter_rows(named=True)
    )
    removed_stale_results = remove_stale_results(result_dir, expected_filenames)
    selected_payloads: list[dict[str, JsonValue]] = []
    for case in cases.iter_rows(named=True):
        company_id = str(case["company_id"])
        currency = str(case["currency"])
        current_series_key = f"{company_id}::{currency}"
        history = scores.filter(
            (pl.col("company_id") == company_id) & (pl.col("currency") == currency)
        ).sort("month")
        scored_history = history.filter(pl.col("score").is_not_null())
        score_row = scored_history.tail(1).row(0, named=True)
        data_cutoff = str(history["month"].max())
        score_as_of = str(scored_history["month"].max())
        score_is_stale = score_as_of < data_cutoff
        month_payloads: list[dict[str, JsonValue]] = []
        alert_payloads: list[dict[str, JsonValue]] = []
        previous_contributions: dict[str, float | None] | None = None
        previous_score: float | None = None
        for row in history.iter_rows(named=True):
            contributions = {
                "operating_flow_balance_3m": numeric_or_none(
                    row["contribution_flow_balance"]
                ),
                "outflow_cv_6m": numeric_or_none(row["contribution_stability"]),
                "score_clip": numeric_or_none(row["clip_adjustment"]),
            }
            drivers: list[dict[str, JsonValue]] = []
            score_value = numeric_or_none(row["score"])
            if (
                previous_contributions is not None
                and previous_score is not None
                and score_value is not None
            ):
                for signal, value in contributions.items():
                    previous = previous_contributions[signal]
                    if value is not None and previous is not None:
                        drivers.append(
                            {
                                "signal": signal,
                                "delta": value - previous,
                                "contribution": value,
                            }
                        )
                drivers.sort(
                    key=lambda item: abs(float(str(item["delta"]))), reverse=True
                )
                drivers = drivers[:3]
            score_reason = row["score_reason"]
            monthly_status = str(row["quality_status"])
            coverage_reason = (
                None
                if monthly_status == "available"
                else str(score_reason or "incomplete_six_month_window")
            )
            month_payloads.append(
                {
                    "month": str(row["month"])[:7],
                    "score": score_value,
                    "status": monthly_status,
                    "basis": "observed",
                    "coverage": {
                        "months_observed": int(row["months_observed_6m"]),
                        "ratio": float(row["coverage_ratio"]),
                        "reason": coverage_reason,
                    },
                    "signal_sufficiency": {
                        "status": str(row["operating_signal_status"]),
                        "operating_inflow_3m": numeric_or_none(
                            row["operating_inflow_3m"]
                        ),
                        "operating_outflow_3m": numeric_or_none(
                            row["operating_outflow_3m"]
                        ),
                        "operating_activity_3m": numeric_or_none(
                            row["operating_activity_3m"]
                        ),
                        "smaller_side_share_3m": numeric_or_none(
                            row["operating_smaller_side_share_3m"]
                        ),
                    },
                    "contributions": [
                        {
                            "signal": "operating_flow_balance_3m",
                            "value": numeric_or_none(
                                row["operating_flow_balance_3m"]
                            ),
                            "weight": 0.70,
                            "contribution": contributions[
                                "operating_flow_balance_3m"
                            ],
                            "direction": "better_when_higher",
                        },
                        {
                            "signal": "outflow_cv_6m",
                            "value": numeric_or_none(row["outflow_cv_6m"]),
                            "weight": 0.30,
                            "contribution": contributions["outflow_cv_6m"],
                            "direction": "better_when_lower",
                        },
                    ],
                    "score_reconstruction": {
                        "intercept": numeric_or_none(row["score_intercept"]),
                        "raw_contribution_sum": numeric_or_none(
                            row["raw_contribution_sum"]
                        ),
                        "preclip_score": numeric_or_none(row["preclip_score"]),
                        "clip_adjustment": numeric_or_none(row["clip_adjustment"]),
                        "final_score": score_value,
                    },
                    "change_vs_prev": {
                        "delta": None
                        if previous_score is None or score_value is None
                        else score_value - previous_score,
                        "intercept_delta": 0.0
                        if previous_score is not None and score_value is not None
                        else None,
                        "drivers": drivers,
                    },
                }
            )
            if bool(row["alert"]):
                alert_kind = str(row["alert_kind"])
                alert_payloads.append(
                    {
                        "id": f"{current_series_key}:{row['month']}",
                        "month": str(row["month"])[:7],
                        "kind": alert_kind,
                        "severity": abs(float(row["score_delta_3m"])),
                        "signal": "score_delta_3m",
                        "message": "Cambio persistente; requiere revisión humana.",
                        "evidence": {
                            "delta_3m": float(row["score_delta_3m"]),
                            "online_regime": str(row["online_regime"]),
                        },
                    }
                )
            previous_contributions = contributions
            previous_score = score_value
        top_level_status = str(score_row["quality_status"])
        quality_reasons: list[JsonValue] = []
        if score_is_stale:
            top_level_status = "partial"
            quality_reasons.append("score_as_of_precedes_data_cutoff")
        if score_row["score_reason"] is not None:
            quality_reasons.append(str(score_row["score_reason"]))
        elif top_level_status == "partial":
            quality_reasons.append("incomplete_six_month_window")
        payload: dict[str, JsonValue] = {
            "contract_version": "dashboard-v1",
            "entity": {"kind": "company", "id": company_id},
            "series_key": current_series_key,
            "cutoff_date": data_cutoff,
            "data_cutoff": data_cutoff,
            "score_as_of": score_as_of,
            "model_version": MODEL_VERSION,
            "data_version": "embat-v2",
            "currency": currency,
            "status": top_level_status,
            "score": numeric_or_none(score_row["score"]),
            "months": month_payloads,
            "trajectory": {
                "direction": str(score_row["trajectory_direction"]),
                "months_in_direction": None,
                "regime": str(score_row["online_regime"]),
            },
            "quality": {
                "coverage_ratio": float(score_row["coverage_ratio"]),
                "operating_signal_status": str(
                    score_row["operating_signal_status"]
                ),
                "reasons": quality_reasons,
            },
            "alerts": alert_payloads,
            "forecast": None,
        }
        selected_payloads.append(payload)
        result_path = result_dir / series_filename(company_id, currency)
        with result_path.open("w", encoding="utf-8") as target:
            json.dump(payload, target, ensure_ascii=False, indent=2, default=str)

    manifest = {
        "contract_version": "dashboard-v1",
        "data_version": "embat-v2",
        "model_version": MODEL_VERSION,
        "generated_at": datetime.now(UTC).isoformat(),
        "data_cutoff": "2026-09-01",
        "grain": "company_month_product_currency",
        "basis": "observed_booked_transactions",
        "source_files": inventory.select("file", "rows", "sha256").to_dicts(),
        "score_rows": scores.height,
        "scored_rows": int(scores["score"].is_not_null().sum()),
        "representative_series": [
            f"{row['company_id']}::{row['currency']}"
            for row in cases.iter_rows(named=True)
        ],
        "result_files": sorted(expected_filenames),
        "stale_results_removed": list(removed_stale_results),
        "forecast_metrics": forecast_metrics.to_dicts(),
        "limitations": [
            "No invoice direction; DSO and DPO blocked.",
            "No verified FX conversion; no group consolidation.",
            "No official labels or hidden-test list.",
            "Coverage is separate from health and missing months are not zero-filled.",
            "No score is emitted without sufficient two-sided identified operating flow.",
        ],
    }
    with (export_dir / "manifest.json").open("w", encoding="utf-8") as target:
        json.dump(manifest, target, ensure_ascii=False, indent=2, default=str)
    with (export_dir / "selected_cases.json").open("w", encoding="utf-8") as target:
        json.dump(selected_payloads, target, ensure_ascii=False, indent=2, default=str)
    print(f"exports series={len(selected_payloads)} score_rows={scores.height} stale_removed={len(removed_stale_results)}")


if __name__ == "__main__":
    main()
