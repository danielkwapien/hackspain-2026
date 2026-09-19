# XR-033 fase 1: verificación independiente del scorer

Fecha: 2026-09-19  
Worktree: `xr/XR-033-engine-connection`  
Base inspeccionada: `plans/XR-033/engine-publication.duckdb`

## Comandos ejecutados

```bash
.venv/bin/python -m pytest -q core/tests/test_engine_publication.py
# ....                                                                     [100%]
# 4 passed in 0.36s

comm -3 \
  <(jq -r '.groups[] | .entity.id as $id | .months[] | [$id,.month,(.score|tostring)] | @tsv' plans/XR-033/baseline/scores_embat.json | LC_ALL=C sort) \
  <(jq -r '.groups[] | .entity.id as $id | .months[] | [$id,.month,(.score|tostring)] | @tsv' core/outputs/scores_embat.json | LC_ALL=C sort) \
  | wc -l
# 0
```

Las consultas DuckDB se ejecutaron con `duckdb.connect(..., read_only=True)`.
El recuento de diferencias compara las 6.000 claves `group_id,month` y sus
scores serializados; no hubo diferencias.

## Resultados

| Comprobación | Resultado |
|---|---:|
| `group_scores` filas | 6.000 |
| grupos distintos | 250 |
| `company_scores` filas | 22.235 |
| compañías distintas | 1.286 |
| meses en ambas tablas | 24 (`2024-09` a `2026-08`) |
| score de grupo no nulo | 3.774 |
| score de compañía no nulo | 19.533 |
| score no nulo con `level` o `cap` nulo | 0 |
| `score != min(level,cap)` en grupos | 0 |
| `score != min(level,cap)` en compañías | 0 |
| `cap_adjustment` inconsistente en grupos | 0 |
| `cap_adjustment` inconsistente en compañías | 0 |
| claves duplicadas `(entity,month)` en grupos | 0 |
| claves duplicadas `(entity,month)` en compañías | 0 |
| compañías con `>20` meses | 530 |
| `engine_frames` filas | 24 |
| meses distintos en `engine_frames` | 24 |

`group_company_summary` tiene 4.307 filas. En las 3.773 filas con
`n_companies_scored > 0`, `dispersion = max(score) - min(score)` y los
identificadores/scores extremo coinciden con la agregación independiente de
`company_scores`: 0 discrepancias. Las otras 534 filas tienen
`n_companies_scored = 0`, `dispersion = NULL` y no tienen ningún score de
compañía no nulo; se conserva el nulo legítimo para grupos sin soporte.

`engine_exports` contiene una única fila con los metadatos observados:

```text
model_version = embat-layered-v1
params_version = sha256:95c355e871dd6510f45609a15d3c83ab90ce4e272fe0d0d367014ff39fafc064
data_version = embat-v2
cutoff_date = 2026-08-01
months_from = 2024-09
months_to = 2026-08
n_groups = 250
n_group_rows = 6000
n_companies = 1286
n_company_rows = 22235
n_months = 24
source_md5 = 32b876da97f1b07500ed0c8811e26bfa
```

El MD5 calculado del fichero fuente exacto
`core/outputs/scores_embat.json` es
`32b876da97f1b07500ed0c8811e26bfa`, igual al `engine_exports.source_md5`.
El export enriquecido contiene 250 grupos y 1.286 compañías; el baseline
contiene 250 grupos y no compañías, como se esperaba para esta comparación.

## Veredicto

**PASS para el scorer de fase 1.** El test específico pasa, los conteos
esperados son 6.000/22.235/250/1.286, hay 530 compañías con más de 20 meses,
las identidades de score y cap pasan sin discrepancias, no hay claves
duplicadas, `group_company_summary` es correcto en todas las filas con score,
los 24 frames están presentes, el MD5 coincide y los 6.000 scores mensuales
de grupo coinciden con el baseline.

No se hizo la lectura de MotherDuck/cloud; queda para el verificador líder.
