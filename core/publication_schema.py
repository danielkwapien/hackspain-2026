from __future__ import annotations

SCORE_COLUMNS = (
    "entity_kind", "group_id", "company_id", "month", "month_index", "months_hist",
    "warmup", "branch", "pillar_l", "pillar_p", "pillar_c", "pillar_d", "pillar_a",
    "weight_l", "weight_p", "weight_c", "weight_d", "weight_a", "source_level",
    "penalty", "level", "cap", "cap_code", "cap_adjustment", "score", "band",
    "delta_1m", "delta_3m", "delta_6m", "slope_3m", "slope_6m", "z_own", "run",
    "level_shift", "regime", "direction", "outlook_3m", "outlook_6m", "outlook_low",
    "outlook_high", "confidence", "coverage", "drivers", "narrative",
    "strategic_signals", "trace", "payload", "model_version", "params_version",
    "source_md5", "generated_at",
)

SCORE_DDL = """
entity_kind VARCHAR NOT NULL, group_id VARCHAR, company_id VARCHAR,
month VARCHAR NOT NULL, month_index INTEGER, months_hist INTEGER,
warmup BOOLEAN, branch VARCHAR,
pillar_l DOUBLE, pillar_p DOUBLE, pillar_c DOUBLE, pillar_d DOUBLE, pillar_a DOUBLE,
weight_l DOUBLE, weight_p DOUBLE, weight_c DOUBLE, weight_d DOUBLE, weight_a DOUBLE,
source_level DOUBLE, penalty DOUBLE, level DOUBLE, cap DOUBLE, cap_code VARCHAR,
cap_adjustment DOUBLE, score DOUBLE, band VARCHAR,
delta_1m DOUBLE, delta_3m DOUBLE, delta_6m DOUBLE,
slope_3m DOUBLE, slope_6m DOUBLE, z_own DOUBLE, run INTEGER,
level_shift DOUBLE, regime VARCHAR, direction VARCHAR,
outlook_3m DOUBLE, outlook_6m DOUBLE, outlook_low DOUBLE, outlook_high DOUBLE,
confidence DOUBLE, coverage DOUBLE,
drivers JSON, narrative JSON, strategic_signals JSON, trace JSON, payload JSON,
model_version VARCHAR NOT NULL, params_version VARCHAR NOT NULL,
source_md5 VARCHAR NOT NULL, generated_at TIMESTAMPTZ NOT NULL
"""

SIGNAL_COLUMNS = (
    "entity_kind", "group_id", "company_id", "month", "signal_id", "api_signal_id",
    "pillar", "label", "value", "value_fmt", "points", "u", "u_smooth", "u_ref",
    "weight", "contribution", "delta_vs_prev", "is_available", "quality_flag", "payload",
    "params_version", "source_md5", "generated_at",
)

SIGNAL_DDL = """
entity_kind VARCHAR NOT NULL, group_id VARCHAR, company_id VARCHAR, month VARCHAR NOT NULL,
signal_id VARCHAR NOT NULL, api_signal_id VARCHAR, pillar VARCHAR, label VARCHAR,
value DOUBLE, value_fmt VARCHAR, points DOUBLE, u DOUBLE, u_smooth DOUBLE, u_ref DOUBLE,
weight DOUBLE, contribution DOUBLE, delta_vs_prev DOUBLE, is_available BOOLEAN,
quality_flag VARCHAR, payload JSON, params_version VARCHAR NOT NULL,
source_md5 VARCHAR NOT NULL, generated_at TIMESTAMPTZ NOT NULL
"""

STRATEGIC_COLUMNS = (
    "entity_kind", "group_id", "company_id", "month", "name", "value", "confidence",
    "coverage", "direction", "modifier_delta", "modifier_applied", "evidence", "payload",
    "params_version", "source_md5", "generated_at",
)

STRATEGIC_DDL = """
entity_kind VARCHAR NOT NULL, group_id VARCHAR, company_id VARCHAR, month VARCHAR NOT NULL,
name VARCHAR NOT NULL, value DOUBLE, confidence DOUBLE, coverage DOUBLE, direction VARCHAR,
modifier_delta DOUBLE, modifier_applied BOOLEAN, evidence JSON, payload JSON,
params_version VARCHAR NOT NULL, source_md5 VARCHAR NOT NULL,
generated_at TIMESTAMPTZ NOT NULL
"""

DRIVER_COLUMNS = (
    "entity_kind", "group_id", "company_id", "month", "rank", "signal_id", "pillar",
    "contribution", "delta_vs_prev", "value", "value_fmt", "direction", "kind", "message",
    "payload", "params_version", "source_md5", "generated_at",
)

DRIVER_DDL = """
entity_kind VARCHAR NOT NULL, group_id VARCHAR, company_id VARCHAR, month VARCHAR NOT NULL,
rank INTEGER, signal_id VARCHAR NOT NULL, pillar VARCHAR, contribution DOUBLE,
delta_vs_prev DOUBLE, value DOUBLE, value_fmt VARCHAR, direction VARCHAR, kind VARCHAR,
message VARCHAR, payload JSON, params_version VARCHAR NOT NULL,
source_md5 VARCHAR NOT NULL, generated_at TIMESTAMPTZ NOT NULL
"""

ALERT_COLUMNS = (
    "alert_id", "entity_kind", "group_id", "company_id", "month", "severity", "cause",
    "direction", "score_before", "score_after", "top_driver", "message", "payload",
    "params_version", "source_md5", "generated_at",
)

ALERT_DDL = """
alert_id VARCHAR NOT NULL, entity_kind VARCHAR NOT NULL, group_id VARCHAR, company_id VARCHAR,
month VARCHAR NOT NULL, severity VARCHAR, cause VARCHAR, direction VARCHAR,
score_before DOUBLE, score_after DOUBLE, top_driver VARCHAR, message VARCHAR, payload JSON,
params_version VARCHAR NOT NULL, source_md5 VARCHAR NOT NULL,
generated_at TIMESTAMPTZ NOT NULL
"""

CATALOG_COLUMNS = (
    "signal_id", "api_signal_id", "pillar", "label", "unit", "direction", "weight_in_pillar",
    "pillar_weight", "anchors", "window", "requires", "scores", "available", "payload",
    "params_version", "source_md5", "generated_at",
)

CATALOG_DDL = """
signal_id VARCHAR NOT NULL, api_signal_id VARCHAR, pillar VARCHAR NOT NULL, label VARCHAR,
unit VARCHAR, direction VARCHAR, weight_in_pillar DOUBLE, pillar_weight DOUBLE,
anchors JSON, "window" VARCHAR, requires JSON, scores BOOLEAN, available BOOLEAN, payload JSON,
params_version VARCHAR NOT NULL, source_md5 VARCHAR NOT NULL,
generated_at TIMESTAMPTZ NOT NULL
"""

EXPORT_COLUMNS = (
    "model_version", "params_version", "data_version", "cutoff_date", "months_from",
    "months_to", "n_groups", "n_group_rows", "n_companies", "n_company_rows", "n_months",
    "generated_at", "source_md5", "metadata",
)

EXPORT_DDL = """
model_version VARCHAR NOT NULL, params_version VARCHAR NOT NULL, data_version VARCHAR NOT NULL,
cutoff_date VARCHAR NOT NULL, months_from VARCHAR, months_to VARCHAR,
n_groups INTEGER, n_group_rows INTEGER, n_companies INTEGER, n_company_rows INTEGER,
n_months INTEGER, generated_at TIMESTAMPTZ NOT NULL, source_md5 VARCHAR NOT NULL, metadata JSON
"""

FRAME_COLUMNS = ("month", "payload", "params_version", "source_md5", "generated_at")

FRAME_DDL = """
month VARCHAR NOT NULL, payload JSON NOT NULL, params_version VARCHAR NOT NULL,
source_md5 VARCHAR NOT NULL, generated_at TIMESTAMPTZ NOT NULL
"""

SUMMARY_DDL = """
group_id VARCHAR NOT NULL, month VARCHAR NOT NULL, n_companies_scored INTEGER,
dispersion DOUBLE, weakest_company VARCHAR, weakest_score DOUBLE,
strongest_company VARCHAR, strongest_score DOUBLE,
params_version VARCHAR NOT NULL, source_md5 VARCHAR NOT NULL,
generated_at TIMESTAMPTZ NOT NULL
"""

DERIVED_TABLES = {
    "group_scores": (SCORE_DDL, SCORE_COLUMNS),
    "company_scores": (SCORE_DDL, SCORE_COLUMNS),
    "group_signal_values": (SIGNAL_DDL, SIGNAL_COLUMNS),
    "company_signal_values": (SIGNAL_DDL, SIGNAL_COLUMNS),
    "group_strategic_signals": (STRATEGIC_DDL, STRATEGIC_COLUMNS),
    "company_strategic_signals": (STRATEGIC_DDL, STRATEGIC_COLUMNS),
    "group_drivers": (DRIVER_DDL, DRIVER_COLUMNS),
    "company_drivers": (DRIVER_DDL, DRIVER_COLUMNS),
    "group_alerts": (ALERT_DDL, ALERT_COLUMNS),
    "company_alerts": (ALERT_DDL, ALERT_COLUMNS),
    "signal_catalog": (CATALOG_DDL, CATALOG_COLUMNS),
    "engine_frames": (FRAME_DDL, FRAME_COLUMNS),
    "engine_exports": (EXPORT_DDL, EXPORT_COLUMNS),
}
