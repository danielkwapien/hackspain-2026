from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import duckdb
import pandas as pd  # noqa: PANDAS_OK
import pytest

CORE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CORE))

from engine.families import Factor  # noqa: E402
from pipeline_embat import build_results  # noqa: E402
from publish import PublicationContractError, publish  # noqa: E402


def _scored_rows() -> pd.DataFrame:
    factor = Factor(
        score=64.0,
        metrics={
            "buffer_days": 27.0,
            "buffer_days_points": 60.0,
            "neg_cash_share": 0.0,
            "neg_cash_share_points": 100.0,
            "cash_trend": None,
        },
    )
    strategic = {
        "trajectory_pressure": {
            "value": 62.0,
            "confidence": 0.75,
            "coverage": 1.0,
            "direction": "improving",
            "evidence": {"health_change_3m": 3.0},
        }
    }
    return pd.DataFrame(
        [
            {
                "group_id": "GROUP_0001",
                "m": pd.Timestamp("2026-07-01"),
                "score": 55.0,
                "level": 55.0,
                "coverage": 0.25,
                "confidence": 0.2,
                "months_hist": 0,
                "penalty": 0.0,
                "factors": {"liquidity": factor},
                "effective": {"liquidity": 1.0},
                "caps": [],
                "trace": [
                    {"stage": "level", "name": "blended", "value": 55.0},
                    {"stage": "final", "name": "score", "value": 55.0},
                ],
                "band": "watch",
                "buffer_days": 27.0,
                "strategic_signals": strategic,
            },
            {
                "group_id": "GROUP_0001",
                "m": pd.Timestamp("2026-08-01"),
                "score": 60.0,
                "level": 58.0,
                "coverage": 0.25,
                "confidence": 0.3,
                "months_hist": 3,
                "penalty": 2.0,
                "factors": {"liquidity": factor},
                "effective": {"liquidity": 1.0},
                "caps": [],
                "trace": [
                    {"stage": "level", "name": "blended", "value": 60.0},
                    {
                        "stage": "penalty",
                        "name": "weakest_link",
                        "value": 58.0,
                        "delta": -2.0,
                    },
                    {
                        "stage": "modifier",
                        "name": "trajectory_pressure",
                        "value": 60.0,
                        "delta": 2.0,
                    },
                    {"stage": "final", "name": "score", "value": 60.0},
                ],
                "band": "healthy",
                "buffer_days": 30.0,
                "strategic_signals": strategic,
            },
        ]
    )


def test_month_serialization_preserves_adjusted_level_and_trace() -> None:
    # Given: two already-scored months with a real strategic modifier.
    scored = _scored_rows()

    # When: the batch result is serialized for publication.
    result = build_results(scored)[0]

    # Then: the API level is the adjusted pre-cap level and the source level remains auditable.
    month = result["months"][-1]
    assert month["source_level"] == 58.0
    assert month["level"] == 60.0
    assert month["score"] == min(month["level"], month["cap"])
    assert month["penalty"] == 2.0
    assert month["pillars"]["L"] == {"value": 0.64, "weight": 1.0}
    assert month["trajectory"]["delta_1m"] == 5.0
    assert month["outlook_6m"] is None
    assert month["trace"][2]["name"] == "trajectory_pressure"
    assert month["warmup"] is (month["trajectory"]["regime"] == "warmup")
    weights = {row["signal_id"]: row["weight"] for row in month["raw_signals"]}
    assert weights["buffer_days"] == 0.625
    assert weights["neg_cash_share"] == 0.375
    assert weights["cash_trend"] == 0.0


def test_company_serialization_omits_unobserved_leading_months() -> None:
    # Given: a company-scored frame whose first month has no observed activity.
    scored = _scored_rows()

    # When: company-grain results are serialized.
    result = build_results(scored, entity_kind="company")[0]

    # Then: publication starts at the first observed month instead of inventing history.
    assert result["entity"] == {"kind": "company", "id": "GROUP_0001"}
    assert [month["month"] for month in result["months"]] == ["2026-08"]


def _publication_source(path: Path) -> bytes:
    group = build_results(_scored_rows())[0]
    company = build_results(_scored_rows(), entity_kind="company")[0]
    company["entity"]["id"] = "COMP_0001"
    company["group_id"] = "GROUP_0001"
    company["months"][-1]["trajectory"]["delta_1m"] = 2.0
    weaker_company = json.loads(json.dumps(company))
    weaker_company["entity"]["id"] = "COMP_0002"
    weaker_month = weaker_company["months"][-1]
    weaker_month["source_level"] = 50.0
    weaker_month["level"] = 50.0
    weaker_month["score"] = 50.0
    weaker_month["trajectory"]["delta_1m"] = -1.0
    payload = {
        "schema_version": "score-results-v1",
        "model_version": "embat-layered-v1",
        "params_version": "sha256:test-params",
        "data_version": "embat-v2",
        "cutoff_date": "2026-08-01",
        "generated_at": "2026-09-19T12:00:00+00:00",
        "count": 1,
        "company_count": 2,
        "unit": "group",
        "groups": [group],
        "companies": [company, weaker_company],
    }
    encoded = (json.dumps(payload, sort_keys=True) + "\n").encode()
    path.write_bytes(encoded)
    return encoded


def test_publish_is_transactional_idempotent_and_preserves_source_tables(tmp_path: Path) -> None:
    # Given: a complete group/company export and a database with original score tables.
    source = tmp_path / "scores.json"
    encoded = _publication_source(source)
    database = tmp_path / "publication.duckdb"
    with duckdb.connect(str(database)) as connection:
        connection.execute("CREATE TABLE scores(id INTEGER)")
        connection.execute("INSERT INTO scores VALUES (1286)")
        connection.execute("CREATE TABLE score_exports(source_md5 VARCHAR)")
        connection.execute("INSERT INTO score_exports VALUES ('static-source')")

    # When: identical bytes are published twice.
    first = publish(source, str(database))
    second = publish(source, str(database))

    # Then: derived rows are replaced idempotently and original tables remain untouched.
    assert first == second
    assert first.source_md5 == hashlib.md5(encoded).hexdigest()
    with duckdb.connect(str(database), read_only=True) as connection:
        assert connection.sql("SELECT count(*) FROM group_scores").fetchone()[0] == 2
        assert connection.sql("SELECT count(*) FROM company_scores").fetchone()[0] == 2
        assert connection.sql("SELECT count(*) FROM scores").fetchone()[0] == 1
        assert connection.sql("SELECT source_md5 FROM score_exports").fetchone()[0] == "static-source"
        export = connection.sql(
            "SELECT source_md5,n_group_rows,n_company_rows FROM engine_exports"
        ).fetchone()
        assert export == (hashlib.md5(encoded).hexdigest(), 2, 2)
        assert connection.sql("SELECT outlook_6m FROM group_scores LIMIT 1").fetchone()[0] is None
        helper = connection.sql(
            "SELECT n_companies_scored,dispersion,weakest_company,strongest_company "
            "FROM group_company_summary WHERE month='2026-08'"
        ).fetchone()
        assert helper == (2, 10.0, "COMP_0002", "COMP_0001")
        frame = json.loads(connection.sql(
            "SELECT payload::varchar FROM engine_frames WHERE month='2026-08'"
        ).fetchone()[0])
        assert frame["stats"] == {
            "mean_score": 55.0,
            "n_moving": 2,
            "n_improving": 1,
            "n_deteriorating": 1,
        }
        catalog = connection.sql(
            "SELECT weight_in_pillar,pillar_weight,anchors::varchar "
            "FROM signal_catalog WHERE signal_id='buffer_days'"
        ).fetchone()
        assert catalog[:2] == (50.0, 25.0)
        assert json.loads(catalog[2]) == [[0, 0.0], [10, 0.3], [27, 0.6], [60, 0.9], [120, 1.0]]


def test_publish_rejects_identity_mismatch_before_replacing_tables(tmp_path: Path) -> None:
    # Given: a previous valid publication and a later source with a false score identity.
    source = tmp_path / "scores.json"
    _publication_source(source)
    database = tmp_path / "publication.duckdb"
    publish(source, str(database))
    payload = json.loads(source.read_text())
    payload["groups"][0]["months"][-1]["score"] = 12.0
    source.write_text(json.dumps(payload))

    # When: the invalid source is offered to the publisher.
    with pytest.raises(PublicationContractError):
        publish(source, str(database))

    # Then: the transaction boundary leaves the prior derived publication intact.
    with duckdb.connect(str(database), read_only=True) as connection:
        assert connection.sql(
            "SELECT score FROM group_scores WHERE month='2026-08'"
        ).fetchone()[0] == 60.0
