# XR-033 · Publicación remota enriquecida

Cierra el punto que `phase2-api.md` dejó abierto: *«La publicacion remota sigue
siendo la antigua, asi que la API v2 responde 503 `source_unavailable` contra
`md:hackspain_2026` hasta que se repita el mismo `core/publish.py` con
`--database md:hackspain_2026`»*.

Medido el 19/09/2026 sobre `origin/main` en `120a803`.

## Qué impedía publicar

`core/publish.py` moría antes de escribir nada:

```
KeyError: 'buffer_days_z'
  publication_rows.py:239 in _catalog_rows
```

El commit `00ce623` añadió cinco señales que leen cada pilar contra la propia
base de 12 meses de la entidad —`buffer_days_z`, `ap_days_late_z`,
`ar_overdue_z`, `feeint_share_z` y `op_in_z`— pero no las declaró en la capa de
publicación. `SIGNAL_META` se indexa con `[]`, así que la primera señal sin
entrada tumbaba la publicación entera. Ninguna publicación podía llegar a
MotherDuck desde ese commit.

El mismo commit dio 20 puntos a cada señal nueva dentro de su pilar, lo que
reproporcionó todos los demás pesos y dejó en rojo dos pruebas de publicación
que seguían afirmando los números viejos.

## Secuencia ejecutada

```sh
.venv/bin/python core/pipeline_embat.py --include-companies
.venv/bin/python core/enrich.py \
  --input core/outputs/scores_embat.json \
  --output core/outputs/scores_embat_enriched.json
.venv/bin/python core/publish.py \
  --input core/outputs/scores_embat_enriched.json \
  --database md:hackspain_2026
```

`--include-companies` no es opcional: sin él el JSON sale con `companies: 0` y
la publicación deja las once tablas de sociedad vacías.

Resultado de la publicación:

```json
{"company_rows": 22235, "group_rows": 6000,
 "source_md5": "3c60f33812579d855e1b8f0f544e8eaa",
 "group_payload_sha256": "e02e82eb9d9c49ef46a996a526adfcb095f325f71a3fba944bf73a94f5ff4639",
 "company_payload_sha256": "15bf64160dff147a39b8ddcc2c48362d6a815164eda7e0414192f5b4b6012975"}
```

## Lectura independiente contra `md:hackspain_2026`

| Comprobación | Resultado |
|---|---|
| `group_scores` | 6.000 filas, 3.774 con score |
| `company_scores` | 22.235 filas |
| `strength_flags` poblado | 6.000 de 6.000 |
| `op_in_12m_eur` poblado | 5.976 de 6.000 |
| `op_in_12m` (moneda propia), grano sociedad | 21.947 de 22.235 |
| `op_in_12m` (moneda propia), grano grupo | 0 — **correcto**, un grupo no tiene una sola moneda (`enrich.py:14`) |
| `signal_catalog` | 37 filas, las cinco `_z` con `unit='z'` y ventana `12m` |
| `scores` / `score_exports` | 1.286 / 1 — intactas, como exige el test de publicación |

API v2 contra MotherDuck:

```
/health  → engine static-baseline-v1, v2: { model_version: embat-layered-v1,
           cutoff_date: 2026-08-01, months: 24, snapshots_only: false }
/api/v2/universe?unit=group  → score 85, delta_1m 3.72, delta_3m 7.29,
           regime shock_pending, sparkline de 12 puntos, dispersion 34.87
/api/v2/companies/COMP_0001  → score 37.66, band stress, 5 pilares con valor,
           6 drivers, narrativa, timeline mensual
```

Suites: `core` 20 pruebas en verde, `api` 37, `web` 322.

## Lo que sigue pendiente

- `outlook_3m` / `outlook_6m` siguen vacíos: el motor todavía no emite
  perspectiva con banda (§5 fase 5 del plan). El hueco viaja nulo, no estimado.
- `api_signal_id` de las cinco `_z` queda sin asignar, igual que
  `neg_cash_share` y `cash_trend`. Asignarles un id del contrato v2 es una
  decisión de producto, no de esta publicación.
