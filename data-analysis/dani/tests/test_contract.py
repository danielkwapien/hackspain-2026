import json
from pathlib import Path

import pytest

from embat_analysis.contract import ContractValidationError, validate_exports


def test_validate_exports_rejects_alert_enum_outside_dashboard_contract(
    tmp_path: Path,
) -> None:
    # Given
    result_dir = tmp_path / "results"
    result_dir.mkdir()
    payload = {
        "contract_version": "dashboard-v1",
        "entity": {"kind": "company", "id": "COMP_1"},
        "series_key": "COMP_1::EUR",
        "cutoff_date": "2026-09-01",
        "data_cutoff": "2026-09-01",
        "score_as_of": "2026-09-01",
        "model_version": "score-v0.3-operating-sufficiency",
        "data_version": "embat-v2",
        "currency": "EUR",
        "status": "available",
        "score": 50.0,
        "months": [],
        "trajectory": {"direction": "stable", "months_in_direction": None, "regime": "stable"},
        "quality": {"coverage_ratio": 1.0, "reasons": []},
        "alerts": [{"kind": "deteriorating", "evidence": {"online_regime": "persistent_deterioration"}}],
        "forecast": None,
    }
    (result_dir / "COMP_1__EUR.json").write_text(json.dumps(payload), encoding="utf-8")
    (tmp_path / "manifest.json").write_text(
        json.dumps({"result_files": ["COMP_1__EUR.json"]}), encoding="utf-8"
    )

    # When / Then
    with pytest.raises(ContractValidationError, match="alert kind"):
        validate_exports(tmp_path)
