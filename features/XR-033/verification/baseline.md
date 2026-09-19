# Baseline before XR-033 engine changes

Source commit: 66a2decb52dcdc17ea12387ea2b7761390ec6d17 (main after PR10).

Commands both exited0:
```
.venv/bin/python core/pipeline_embat.py
.venv/bin/python core/evaluate.py
```

Pipeline:6000rows,250groups,24months,249finalscores. Actual model embat-layered-v1.

Evaluation:
- M1 score@3m0.742; trend@3m0.528; buffer@3m0.881;49events.
- M1 score@6m0.698; trend@6m0.526; buffer@6m0.812;79events.
- M2 rank stability0.93; median_abs_delta3.41;p90_abs_delta10.86.
- M3 scored249;median51.51;sd18.9;min7.48;max92.98.
- M4 PSI0.3492; with invoices median45.95(n167),without60.0(n82).

Immutable reference copies and command logs are in plans/XR-033/baseline/ (gitignored).
SHA256 scores_embat.json: b7a0314b3fa215dc38440a7e6b47456ece8cbb83f36f371c21e43985eb41834d
SHA256 evaluation.json:0465f72466f950498ec522d82369d9209bfb9854e94f2dcc253b7cf6350b3bd8

M5 is checked separately via core/tests/test_isolation.py; evaluate.py currently reports M1-M4 only.

MotherDuck initially has10tables only, no temporal derived tables. Live main API8793 reports static-baseline-v1, months[2026-09],snapshots_only:true.

## Phase1 independent cloud readback (root)

Connected MotherDuck query of engine_exports and actual tables returned:
```
model_version: embat-layered-v1
source_md5:32b876da97f1b07500ed0c8811e26bfa
n_groups:250 / group_scores:6000
n_companies:1286 / company_scores:22235
n_months:24 / engine_frames:24
score != min(level,cap):0 rows
```
Original static scores retained:1286rows, payloadMD5 3d60a65ce7d564ad4cd182c27e3454a5, score_exports1row.
