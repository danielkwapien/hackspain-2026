import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final

type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | Sequence[JsonValue] | Mapping[str, JsonValue]
STATUS_VALUES: Final[frozenset[str]] = frozenset(
    {"available", "partial", "insufficient_data", "pending_engine"}
)
DIRECTION_VALUES: Final[frozenset[str]] = frozenset(
    {"improving", "stable", "deteriorating", "unknown"}
)
ALERT_KIND_VALUES: Final[frozenset[str]] = frozenset(
    {"improvement", "deterioration"}
)
BASIS_VALUES: Final[frozenset[str]] = frozenset(
    {"observed", "reconstructed", "forecast", "scenario"}
)
OPERATING_SIGNAL_VALUES: Final[frozenset[str]] = frozenset(
    {
        "sufficient",
        "no_identified_operating_activity",
        "one_sided_operating_activity",
        "imbalanced_operating_activity",
    }
)


@dataclass(frozen=True, slots=True)
class ContractValidationError(Exception):
    issues: tuple[str, ...]

    def __str__(self) -> str:
        return "; ".join(self.issues)


def _mapping(value: JsonValue) -> Mapping[str, JsonValue]:
    assert isinstance(value, Mapping)
    return value


def _sequence(value: JsonValue) -> Sequence[JsonValue]:
    assert isinstance(value, Sequence) and not isinstance(value, str)
    return value


def _number(value: JsonValue) -> float | None:
    if value is None:
        return None
    assert isinstance(value, int | float) and not isinstance(value, bool)
    return float(value)


def _validate_month(month: Mapping[str, JsonValue], filename: str) -> list[str]:
    issues: list[str] = []
    status = str(month.get("status"))
    score = _number(month.get("score"))
    if status not in STATUS_VALUES:
        issues.append(f"{filename}: invalid month status {status}")
    if str(month.get("basis")) not in BASIS_VALUES:
        issues.append(f"{filename}: invalid basis")
    if status in {"available", "partial"} and score is None:
        issues.append(f"{filename}: calculable month has null score")
    if status in {"insufficient_data", "pending_engine"} and score is not None:
        issues.append(f"{filename}: unavailable month has non-null score")
    signal_sufficiency = _mapping(month.get("signal_sufficiency", {}))
    signal_status = str(signal_sufficiency.get("status"))
    if signal_status not in OPERATING_SIGNAL_VALUES:
        issues.append(f"{filename}: invalid operating signal status")
    if signal_status != "sufficient" and score is not None:
        issues.append(f"{filename}: insufficient operating signal has score")
    contributions = _sequence(month.get("contributions", []))
    reconstruction = _mapping(month.get("score_reconstruction", {}))
    if score is not None:
        contribution_values = [
            _number(_mapping(contribution).get("contribution"))
            for contribution in contributions
        ]
        if any(value is None for value in contribution_values):
            issues.append(f"{filename}: scored month has null contribution")
        else:
            intercept = _number(reconstruction.get("intercept"))
            preclip = _number(reconstruction.get("preclip_score"))
            adjustment = _number(reconstruction.get("clip_adjustment"))
            final_score = _number(reconstruction.get("final_score"))
            if (
                intercept is None
                or preclip is None
                or adjustment is None
                or final_score is None
            ):
                issues.append(f"{filename}: incomplete score reconstruction")
            else:
                contribution_sum = sum(
                    value for value in contribution_values if value is not None
                )
                if abs(intercept + contribution_sum - preclip) > 1e-8:
                    issues.append(f"{filename}: preclip reconstruction mismatch")
                if abs(preclip + adjustment - final_score) > 1e-8:
                    issues.append(f"{filename}: final score reconstruction mismatch")
    change = _mapping(month.get("change_vs_prev", {}))
    delta = _number(change.get("delta"))
    if delta is not None:
        intercept_delta = _number(change.get("intercept_delta"))
        drivers = _sequence(change.get("drivers", []))
        driver_sum = sum(
            _number(_mapping(driver).get("delta")) or 0.0 for driver in drivers
        )
        if abs((intercept_delta or 0.0) + driver_sum - delta) > 1e-8:
            issues.append(f"{filename}: score change reconstruction mismatch")
    return issues


def validate_exports(export_dir: Path) -> None:
    """Validate generated results against dashboard-v1 and score invariants."""
    with (export_dir / "manifest.json").open(encoding="utf-8") as source:
        manifest: Mapping[str, JsonValue] = json.load(source)
    result_files = tuple(str(value) for value in _sequence(manifest["result_files"]))
    actual_files = tuple(
        sorted(path.name for path in (export_dir / "results").glob("*.json"))
    )
    issues: list[str] = []
    if tuple(sorted(result_files)) != actual_files:
        issues.append("manifest result_files does not match results directory")
    series_keys: set[str] = set()
    for filename in result_files:
        with (export_dir / "results" / filename).open(encoding="utf-8") as source:
            payload: Mapping[str, JsonValue] = json.load(source)
        entity = _mapping(payload["entity"])
        company_id = str(entity["id"])
        currency = str(payload["currency"])
        expected_filename = f"{company_id}__{currency}.json"
        if filename != expected_filename:
            issues.append(f"{filename}: series filename mismatch")
        series_key = str(payload["series_key"])
        if series_key != f"{company_id}::{currency}" or series_key in series_keys:
            issues.append(f"{filename}: duplicate or invalid series key")
        series_keys.add(series_key)
        status = str(payload["status"])
        score = _number(payload.get("score"))
        if status not in STATUS_VALUES:
            issues.append(f"{filename}: invalid status {status}")
        if status in {"available", "partial"} and score is None:
            issues.append(f"{filename}: available or partial result has null score")
        if status in {"insufficient_data", "pending_engine"} and score is not None:
            issues.append(f"{filename}: unavailable result has non-null score")
        if str(payload["score_as_of"]) > str(payload["data_cutoff"]):
            issues.append(f"{filename}: score_as_of exceeds data_cutoff")
        trajectory = _mapping(payload["trajectory"])
        if str(trajectory["direction"]) not in DIRECTION_VALUES:
            issues.append(f"{filename}: invalid trajectory direction")
        for alert_value in _sequence(payload["alerts"]):
            alert = _mapping(alert_value)
            if str(alert["kind"]) not in ALERT_KIND_VALUES:
                issues.append(f"{filename}: invalid alert kind {alert['kind']}")
            evidence = _mapping(alert["evidence"])
            if str(evidence["online_regime"]) not in {
                "persistent_improvement",
                "persistent_deterioration",
            }:
                issues.append(f"{filename}: alert is not persistent")
        for month_value in _sequence(payload["months"]):
            issues.extend(_validate_month(_mapping(month_value), filename))
    if issues:
        raise ContractValidationError(tuple(issues))


def main() -> None:
    export_dir = Path.cwd() / "exports" / "v1"
    validate_exports(export_dir)
    print(f"validated result_files={len(tuple((export_dir / 'results').glob('*.json')))}")


if __name__ == "__main__":
    main()
