from __future__ import annotations

import json
from typing import TypedDict


class FrameEntry(TypedDict, total=False):
    group_id: str
    company_id: str
    score: float | None
    band: str | None
    delta_1m: float | None
    regime: str | None
    alert: bool
    sparkline_12: list[float | None]


def _entry(entity: dict, month: dict, sparkline: list[float | None]) -> FrameEntry:
    kind = entity["entity"]["kind"]
    identifier = "group_id" if kind == "group" else "company_id"
    return {
        identifier: entity["entity"]["id"],
        "score": month["score"],
        "band": month["band"],
        "delta_1m": month["trajectory"]["delta_1m"],
        "regime": month["trajectory"]["regime"],
        "alert": bool(month["early_warning"]["alert"]),
        "sparkline_12": sparkline[-12:],
    }


def _entries_by_month(entities: list[dict]) -> dict[str, list[dict]]:
    by_month: dict[str, list[dict]] = {}
    for entity in entities:
        sparkline: list[float | None] = []
        for month in entity["months"]:
            sparkline.append(month["score"])
            by_month.setdefault(month["month"], []).append(
                _entry(entity, month, list(sparkline))
            )
    return by_month


def build_frame_rows(payload: dict, source_md5: str) -> list[tuple]:
    companies = _entries_by_month(payload["companies"])
    groups = _entries_by_month(payload["groups"])
    metadata = payload["params_version"], source_md5, payload["generated_at"]
    rows = []
    for month in sorted(groups):
        company_rows = companies.get(month, [])
        scored = [row for row in company_rows if row["score"] is not None]
        deltas = [row["delta_1m"] for row in scored if row["delta_1m"] is not None]
        alerts = [
            {"entity_kind": "company", "company_id": row["company_id"]}
            for row in company_rows if row["alert"]
        ]
        alerts.extend(
            {"entity_kind": "group", "group_id": row["group_id"]}
            for row in groups[month] if row["alert"]
        )
        stats = {
            "mean_score": None if not scored else round(
                sum(float(row["score"]) for row in scored) / len(scored), 6
            ),
            "n_moving": sum(abs(float(delta)) > 0.5 for delta in deltas),
            "n_improving": sum(float(delta) > 0.5 for delta in deltas),
            "n_deteriorating": sum(float(delta) < -0.5 for delta in deltas),
        }
        frame = {
            "month": month,
            "companies": company_rows,
            "groups": groups[month],
            "alerts_this_month": alerts,
            "stats": stats,
        }
        rows.append((month, json.dumps(frame, sort_keys=True, separators=(",", ":")), *metadata))
    return rows
