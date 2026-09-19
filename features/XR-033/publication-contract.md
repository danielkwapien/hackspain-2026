# XR-033 phase 1 publication contract

This contract freezes the batch boundary between `core/` and the API. The
publisher replaces only the tables listed here, inside one DuckDB transaction.
The original challenge tables, `scores`, and `score_exports` are never changed.

## Identity and grain

`group_scores` has one row per real `group_id, month`. `company_scores` has one
row per real `company_id, month` and retains its `group_id`. Company rows are
calculated by running the same engine at company grain; a group score is never
copied to a company. The company panel is trimmed before scoring at the first
month with an observed booked transaction, so confidence, EWMA, caps, and
trajectory cannot consume phantom leading history. Companies with no support
remain in the original source universe without an invented series. Full-history
entities still have more than 20 rows.

The API meaning of `level` is the score after the weakest-link penalty and all
enabled strategic modifier deltas, before a hard cap. `source_level` preserves
the engine's post-penalty, pre-modifier value. `cap` is 100 when no cap is
triggered. Every non-null score row must satisfy:

```text
cap_adjustment = level - min(level, cap)
score = min(level, cap)
```

The second identity is checked from `level` and `cap`; `cap_adjustment` is not
reconstructed from `score`. Missing outlook, probability, breadth, forecast,
or other unimplemented outputs remain SQL `NULL` and JSON `null`.

## Score tables

`group_scores` and `company_scores` share the following logical columns. The
identity column is `group_id` or `company_id`; `company_scores.group_id` is the
source membership helper.

```sql
entity_kind VARCHAR NOT NULL,
group_id VARCHAR, company_id VARCHAR,
month VARCHAR NOT NULL, month_index INTEGER, months_hist INTEGER,
warmup BOOLEAN, branch VARCHAR,
pillar_l DOUBLE, pillar_p DOUBLE, pillar_c DOUBLE, pillar_d DOUBLE, pillar_a DOUBLE,
weight_l DOUBLE, weight_p DOUBLE, weight_c DOUBLE, weight_d DOUBLE, weight_a DOUBLE,
source_level DOUBLE, penalty DOUBLE, level DOUBLE,
cap DOUBLE, cap_code VARCHAR, cap_adjustment DOUBLE,
score DOUBLE, band VARCHAR,
delta_1m DOUBLE, delta_3m DOUBLE, delta_6m DOUBLE,
slope_3m DOUBLE, slope_6m DOUBLE, z_own DOUBLE, run INTEGER,
level_shift DOUBLE, regime VARCHAR, direction VARCHAR,
outlook_3m DOUBLE, outlook_6m DOUBLE, outlook_low DOUBLE, outlook_high DOUBLE,
confidence DOUBLE, coverage DOUBLE,
drivers JSON, narrative JSON, strategic_signals JSON, trace JSON, payload JSON,
model_version VARCHAR NOT NULL, params_version VARCHAR NOT NULL,
source_md5 VARCHAR NOT NULL, generated_at TIMESTAMPTZ NOT NULL
```

Pillar values are normalized to 0..1. Their weights are the effective weights
used by the engine for that row; an unavailable pillar has `value = NULL` and
`weight = 0`. `payload` is the canonical complete monthly object and includes
the same typed fields plus causal trajectory, early warning, raw engine signal
values, applied modifier deltas, deterministic narrative, and full trace.

## Long tables

The publisher creates both `group_` and `company_` variants of these tables.
Every row also carries `params_version`, `source_md5`, and `generated_at`.

```sql
-- *_signal_values
entity id, optional group_id, month, signal_id, api_signal_id, pillar, label,
value DOUBLE, value_fmt VARCHAR, points DOUBLE, u_smooth DOUBLE, u_ref DOUBLE,
weight DOUBLE, contribution DOUBLE, delta_vs_prev DOUBLE,
is_available BOOLEAN, quality_flag VARCHAR, payload JSON

-- *_strategic_signals
entity id, optional group_id, month, name, value DOUBLE,
confidence DOUBLE, coverage DOUBLE, direction VARCHAR,
modifier_delta DOUBLE, modifier_applied BOOLEAN, evidence JSON, payload JSON

-- *_drivers
entity id, optional group_id, month, rank INTEGER, signal_id VARCHAR,
pillar VARCHAR, contribution DOUBLE, delta_vs_prev DOUBLE, value DOUBLE,
value_fmt VARCHAR, direction VARCHAR, kind VARCHAR, message VARCHAR, payload JSON

-- *_alerts
alert_id VARCHAR, entity id, optional group_id, month VARCHAR,
severity VARCHAR, cause VARCHAR, direction VARCHAR,
score_before DOUBLE, score_after DOUBLE, top_driver VARCHAR,
message VARCHAR, payload JSON
```

The current layered engine has 16 actual scored signals while API v2 reserves
28 signal IDs. Exact semantic matches may set `api_signal_id`. Reserved v2
signals that are not calculated are emitted as unavailable rows with null
value/utility/contribution and zero weight. Incompatible measures are not
silently relabelled. The complete current-engine signal remains in `signal_id`
and the monthly payload.

`signal_catalog` records both actual engine entries and reserved unavailable v2
entries. Its columns are `signal_id`, optional `api_signal_id`, pillar, label,
unit, direction, configured weight, pillar weight, anchors JSON, window,
requires JSON, `scores`, `available`, and the publication metadata columns.
Catalog weights use percent points (`30`, `25`), while anchor utilities use
0..1. Monthly `*_signal_values.weight` is the effective total-score input
weight: effective pillar weight multiplied by the signal's weight renormalized
over the available signals in that pillar. Unavailable signals have weight 0.
The raw configured weights and 0..100 engine anchors remain unchanged in
`engine_exports.metadata.parameters` and the monthly trace.

`group_company_summary` is calculated in the same transaction from the
separately scored company rows. It stores `n_companies_scored`, dispersion as
`max(score) - min(score)`, weakest/strongest company IDs and their scores. The
API therefore does not calculate portfolio finance while serving a request.

`engine_frames` has one row per group month. Its JSON payload contains the
actual company and group summaries, alerts for that month, 12-month sparklines,
and precalculated `mean_score`, `n_moving`, `n_improving`, and
`n_deteriorating`. A move means an absolute one-month delta greater than 0.5.

## Export manifest and idempotency

`engine_exports` contains exactly one row for the current publication:

```sql
model_version VARCHAR, params_version VARCHAR, data_version VARCHAR,
cutoff_date VARCHAR, months_from VARCHAR, months_to VARCHAR,
n_groups INTEGER, n_group_rows INTEGER,
n_companies INTEGER, n_company_rows INTEGER, n_months INTEGER,
generated_at TIMESTAMPTZ, source_md5 VARCHAR, metadata JSON
```

`model_version` remains the source value (`embat-layered-v1`).
`params_version` is a deterministic SHA-256 fingerprint of the active engine
configuration and signal catalog. `source_md5` is the MD5 of the exact JSON
bytes read by the publisher. `metadata` records table counts and deterministic
payload hashes. Republishing identical bytes yields identical data rows and
hashes; only the transaction itself is repeated.

The CLI defaults to the local DuckDB path supplied with `--database`. Cloud
publication uses `md:hackspain_2026` and reads `MOTHERDUCK_TOKEN` from the
environment or `app/api/.env`; the token is never printed or stored.
