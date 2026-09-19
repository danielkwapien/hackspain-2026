# XR-033 fase 2: conexión real MotherDuck → API v2 → frontal

Fecha: 2026-09-19. Rama `xr/XR-033-engine-connection` (worktree
`/Users/danik/projects/hackspain-embat-XR-033`). Nada de esto usa el dataset mock:
la fuente es la publicación `md:hackspain_2026`.

## Qué se conectó

- `app/api/src/motherduck/engine.ts` lee `engine_exports` y proyecta columnas
  escalares de `group_scores`/`company_scores` (6.000 + 22.235 filas), el catálogo
  (32 entradas), las alertas (12.803) y `group_company_summary` al arrancar; las
  piezas grandes (señales, drivers, narrativa, frames) se consultan por entidad o
  mes con memoización. Sin tablas válidas lanza `MotherDuckUnavailableError`.
- `app/api/src/motherduck/temporal-store.ts` adapta eso al contrato `V2Store` que
  ya consumían las rutas `/api/v2/*`: universo (1.286 sociedades, 250 grupos),
  timelines de los dos granos, catálogo, alertas y frames.
- `app/api/src/app.ts` sirve v1 con el snapshot estático de siempre y v2 con la
  publicación temporal; si la base no abre, v2 responde 503 `source_unavailable`
  sin caer al baseline ni a mocks. Caché de 60 s compartida entre peticiones.
- El frontal (`ResearchPanel`, `Methodology`, KPIs, cabecera) pinta la ficha
  temporal con `snapshot: null` y degrada los nulos publicados (confianza,
  outlook, `base`, pilares ausentes) a «—»/«No aplica», nunca a 0.

## Evidencia HTTP real (API propia en `:8796`, MotherDuck)

```text
GET /api/v2/meta
data_kind=real model_version=embat-layered-v1
params_version=sha256:95c355e871dd6510f45609a15d3c83ab90ce4e272fe0d0d367014ff39fafc064
months=24 capabilities.snapshots_only=false params=null
raw_parameters: caps, caps_enabled, combine_blend, ewma_alpha, family_blend,
  min_coverage, min_months_for_score, model_version, penalty_lambda, penalty_tau,
  pillar_weights, shrink_exponent, signals, strategic_modifiers
counts: companies=1286 groups=250 group_rows=6000 company_rows=22235
  months=24 catalog=32 alerts=12803

GET /api/v2/companies/COMP_0002
as_of=2026-08 score=44.77 band=watch regime=stable confidence=0.637
drivers=5 (primero: PENALTY −10.86) narrative.headline="45 (watch)"
sin clave `snapshot` en la respuesta; timeline=24 filas

GET /api/v2/companies/COMP_0002/timeline
24 filas; 2024-09 score=null regime=warmup pilares value=null weight=0;
2026-08 score=44.77 level=44.77 penalty=10.86 cap=100 cap_code=null
pilares L 0.7318/0.2941, P 0.3127/0.2353, C null/0, D 0.788031/0.2353, A 0.232808/0.2353

GET /api/v2/groups/GROUP_0125
score=51.93 band=watch timeline=24 n_companies_scored=3 dispersion=7.3
weakest=COMP_0002 strongest=COMP_1096

GET /api/v2/catalog/signals → total=32, 16 disponibles (16 reservadas sin calcular)
GET /api/v2/frames → 24 meses; /frames/2026-08 → 1286 sociedades, 250 grupos,
  stats {mean_score:51.105385, n_deteriorating:674, n_improving:515, n_moving:1189}
GET /api/v2/universe?unit=group&limit=3 → total=250, primer grupo score=92.98 band=solid
```

## Evidencia del frontal (web propia en `:4176`, `VITE_API_URL=http://localhost:8796`)

Con el widget de Investigación fijado a `COMP_0002` (semilla de `xray.dashboards.v1`
en el navegador; sin cambios de código), el panel renderiza:

```text
COMP_0002 · Score 44,8 pts · Δ 1A ▼ −10,3 pts · Confianza 64 % · Outlook 6 m —
Rangos 3M/6M/1A/Máx · «Score de COMP_0002, 1A» con 13 meses reales
Liquidez 73,2 pts (−7,9 · 1A) · Pago 31,3 pts (−38,1) · Cobros No aplica ·
Deuda 78,8 pts (0,0) · Actividad 23,3 pts (−2,9)
SEÑALES: penalización −10,9 pts, pillar l +6,8, pillar d +6,8, pillar a −6,3,
trajectory pressure +3,0
```

El navegador se abrió headless; `screenshot()` agotó el tiempo de espera con la
gráfica viva, así que la evidencia es el texto accesible del panel (arriba) más las
respuestas HTTP. Queda pendiente para el humano una QA visual breve.

## Pruebas ejecutadas

```text
.venv/bin/python -m pytest -q core/tests/test_engine_publication.py   → 4 passed
cd app && corepack pnpm typecheck                                     → api + web OK
cd app && corepack pnpm --filter api test                             → 36 passed (3 files)
cd app && corepack pnpm --filter web test                             → 322 passed (58 files)
corepack pnpm --filter api exec vitest run temporal-engine            → 4 passed
corepack pnpm --filter web exec vitest run temporal-diagnostics       → 3 passed
```

La prueba `api_test temporal-engine` ya no depende de la DuckDB grande de `plans/`:
usa `app/api/test/fixtures/temporal-engine.duckdb` (3,2 MiB, subconjunto real con
3 sociedades, 3 grupos, 24 meses y catálogo completo) generado con
`plans/XR-033/make-api-fixture.py` desde esta misma publicación.

## Fuera de esta tanda (siguen pendientes, no se fingieron)

- Cinco rangos 1M/3M/6M/1A/Total en todas las gráficas y selector de unidad: el
  frontal mantiene 3M/6M/1A/Máx.
- Tarjetas de las cinco perspectivas y narrativa en cabecera: el JSON
  `strategic_signals` ya viaja en `*_scores` y hay adaptador `strategicSignalsAt`,
  pero ninguna ruta lo expone todavía.
- KPIs de tesorería en batch (`value_fmt` por unidad/precisión, `op_in_12m` por
  entidad/mes, `strength_flags`) y `evaluate.py` con M5/PSI<0.1: fuera del alcance
  de la conexión.
- Identidad aditiva de la metodología: el motor real no publica `base`, así que
  viaja `null` y el bloque 6 muestra «…» en vez de un número falso.
- Los drivers reales usan ids del motor (`pillar_l`, `penalty`, `trajectory_pressure`)
  como etiqueta; su traducción a nombres de señal v2 es trabajo de UI.
