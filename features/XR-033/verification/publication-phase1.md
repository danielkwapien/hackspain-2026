# XR-033 phase 1 publication evidence

Run on 2026-09-19 from branch `xr/XR-033-engine-connection`.

## Batch output

Command:

```sh
.venv/bin/python core/pipeline_embat.py --include-companies \
  --output core/outputs/scores_embat.json
```

Observed result:

- model: `embat-layered-v1`
- params: `sha256:95c355e871dd6510f45609a15d3c83ab90ce4e272fe0d0d367014ff39fafc064`
- groups: 250
- group rows: 6,000 (250 x 24)
- group monthly score differences from the saved phase-1 baseline: 0
- companies: 1,286, scored separately with the same engine
- company rows: 22,235
- company histories: minimum 4, maximum 24, 530 with more than 20 months
- non-null `score = min(level, cap)` failures: 0

Leading company months were removed before scoring at the first observed booked
transaction. No group result was assigned to a company.

## Local transactional publication

Command:

```sh
.venv/bin/python core/publish.py \
  --input core/outputs/scores_embat.json \
  --database plans/XR-033/engine-publication.duckdb
```

Readback:

- source MD5: `743a85777c499b25b8182d110fa8003a`
- group payload SHA-256: `e0004c1ad8858fb440a527001f901fc91c2c3d2712ad5b91a67e0959d2196e03`
- company payload SHA-256: `262c841ec0cd8f1a8044249dc8eddeacafda436e466ec19a276392c590414d2f`
- rerunning identical bytes produced the same counts and hashes
- tests confirmed `scores` and `score_exports` were not replaced

## MotherDuck publication

Command:

```sh
.venv/bin/python core/publish.py \
  --input core/outputs/scores_embat.json \
  --database md:hackspain_2026
```

Independent readback after commit:

| Table | Rows |
| --- | ---: |
| `group_scores` | 6,000 |
| `company_scores` | 22,235 |
| `group_signal_values` | 96,000 |
| `company_signal_values` | 355,760 |
| `group_strategic_signals` | 30,000 |
| `company_strategic_signals` | 111,175 |
| `group_drivers` | 20,033 |
| `company_drivers` | 102,728 |
| `group_alerts` | 2,128 |
| `company_alerts` | 10,675 |
| `signal_catalog` | 32 |
| `engine_frames` | 24 |

`engine_exports` reported the same model, params hash, source MD5, entity
counts, row counts, and 24 months. All non-null group and company rows passed
the score/cap identity in SQL.

The original static publication remained unchanged:

- `scores`: 1,286 rows
- `score_exports`: 1 row
- canonical static payload MD5:
  `3d60a65ce7d564ad4cd182c27e3454a5`

The final contract correction was also read back from MotherDuck:

- `buffer_days` catalog weights: 50 percent points within pillar, 25 percent
  points for the pillar
- `buffer_days` anchors:
  `[[0,0.0],[10,0.3],[27,0.6],[60,0.9],[120,1.0]]`
- available signal weights that did not sum to their effective pillar weight: 0
- unavailable signals with non-zero weight: 0
- carried smoothed pillar-months with no currently available raw signal: 941;
  those raw signals correctly remain unavailable with weight 0
- `warmup` / `regime == "warmup"` mismatches: 0

## Focused verification

```text
.venv/bin/python -m pytest core/tests/test_engine_publication.py -q
4 passed

.venv/bin/python -m pytest core/tests/ -q --ignore=core/tests/test_isolation.py
14 passed
```

`bash evals/checks/XR-033.sh` passes the phase-1 Python publication tests and
then remains red at `api_test temporal-engine`, which belongs to phase 2.
