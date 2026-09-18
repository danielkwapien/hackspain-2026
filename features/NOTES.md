# NOTES — heartbeat del loop

Cada pasada de queue-run añade aqui una entrada con timestamp y la tabla actual
de TASKQUEUE.md. Es el latido: si esto no crece, el loop esta parado.

## XR-001 — decisiones no fijadas por ENGINE

Elegidas al implementar `datasets_mocked/xray_mock/core.py` y `catalog.py`.
Cada una esta tambien en el docstring de su funcion.

- `outlook`, `gamma = 3.0`: ENGINE §6.3 dice que se calibra con una logistica de
  `y_Ds` sobre `LeadIndex` y se congela en `params`. El mock no tiene ese ajuste,
  asi que se fija en 3 puntos de score por 1σ de LeadIndex (≈ un cuarto de banda).
- `outlook`, `sigma_resid = 3.0` puntos por defecto: coherente con un score cuyo
  ruido mensual es del orden de 2 puntos mas la deriva de regimen.
- `outlook`, `band_margin = 2.0` puntos para separar `positive`/`stable`/`negative`:
  se reutiliza el mismo margen con el que §6.2 exige cruzar un umbral de banda.
  `watch` = el suelo de la banda cae en una banda de score peor que la actual.
- `regime`: la histeresis de 2 meses de §6.2 se aplica TAMBIEN a `shock_pending` y
  `blip` (el documento no la excepciona). Orden de evaluacion de las reglas:
  deteriorating, improving, recovering, blip/shock_pending, stable.
- `caps`: las ventanas de historia de §5.4 se leen literales ("los 12 meses
  previos" = `t−12..t−1`, sin incluir `t`); con historia mas corta se cuenta sobre
  lo disponible. Con varios techos activos manda el de menor valor.
- `z_own`: con MAD = 0 (serie previa constante) devuelve 0,0 en vez de infinito, y
  exige al menos 6 meses previos.
- `theil_sen`: con menos de 3 puntos devuelve `(0.0, 0.0, 0.0)` (IC degenerado =
  "no significativa"), para que las reglas de §6.2 no tengan que mirar el caso nulo.
- `level()` devuelve el nivel BRUTO `100·Σ w_k^eff·P_k`; el `Level_t` de §5.3 es
  `level(...) − penalty(...)`. Se separan para que §7.2 cierre exacto.
- `cap_adj = level − score` absorbe el techo de §5.4 y el recorte a [0, 100], que
  es lo que hace exacta la identidad `score = base + Σ contrib − penalty − cap_adj`.
- `delta_decomposition` devuelve `delta_penalty` y `delta_cap` ya con el signo de
  su APORTACION al delta del score (`−Δpenalty`), para que la suma sea el delta.
- `alerts_policy`: el presupuesto de §8 se trunca hacia abajo (`≤ 5 %`, no `≈`), se
  cuenta por mes y por direccion, y el cool-down se mide como
  `mes − ultimo_mes ≥ cooldown_months`.
- Anclas de P5 y P6: §4.2 da "< 0,5 → 0" como escalon sobre "0,5 → 0,3". Se resuelve
  con el tramo lineal `0 → 0 .. 0,5 → 0,3` para que la normalizacion sea continua.
- Anclas de L3: los tramos "1–3 → 0,6" y "4–9 → 0,3" de §4.1 se escriben como
  mesetas (dos nudos por tramo).
- Los pesos de senal del pilar A suman 90 en §5.8 (25+25+20+10+10), no 100. Se
  transcriben tal cual: la renormalizacion de §5.2 los absorbe.
- `COVERAGE_BRANCHES[*]["effective_weight"]` es la tabla de §4.7 tal cual; no
  coincide exactamente con aplicar `w_k^eff = w_k·avail_k / Σ w_j·avail_j` (p. ej.
  `no_debt` da L 30,1 y D 3,6 frente a los 28 y 5 de la tabla). Manda la formula,
  que es la que calcula `core.effective_weights`; la tabla queda documentada.

## XR-001 — desviaciones del plan y del contrato (decididas por el orquestador)

- **`signals.csv` se queda en CSV.** El plan (§9) preveia pasar a Parquet si superaba
  100 MB, pero la estimacion de 1.286 × 24 × 28 ≈ 860k filas no se cumple: los
  company-months reales son 22.235 (no 30.864, porque la empresa arranca en su
  `first_activity`) y las ramas de cobertura recortan el catalogo, asi que salen
  438.701 filas ≈ 47 MB. Ademas `*.parquet` esta en `.gitignore`, con lo que la salida
  a Parquet habria chocado con el entregable "`datasets_mocked/` completo y committeado".
- **`branch` usa `has_debt` = tiene productos en `debt_products.csv`**, sin incluir
  `has_debt_repayment`. Con esa definicion el reparto reproduce tres de los cuatro
  numeros de ENGINE §4.7: sin deuda 908 (~900), sin facturas 502 (501), sin facturas ni
  deuda 350 (~350). El cuarto, "Completa ~440", NO es reproducible con ninguna
  definicion (da 226 con productos, 371 con la union) y coincide exactamente con la
  cobertura de P1 de §4.2 ("440 empresas con datos suficientes"): es un acarreo del
  numero equivocado en el documento. Las cuatro ramas particionan 1.286; los numeros
  de la tabla de §4.7 no son una particion.
- **`has_invoices` da 784, no 785.** `COMP_0962` tiene una unica fila de factura fuera
  del universo de ENGINE §3.2 (`document_type='invoice' AND status <> 'cancel'`). Se
  sigue la definicion del universo.
- **`has_intercompany` es una aproximacion**: hay transacciones `transfer` y el grupo
  tiene ≥ 2 empresas. El emparejamiento exacto de ENGINE §3.6 esta fuera del alcance
  del mock (el plan §4.3 lo deja fuera).
- **TASKQUEUE.md** no existia al empezar el ticket; lo creo la sesion padre durante la
  pasada (`2a1985c`), con la fila XR-001 ya en `building`. Manda su version.

## XR-001 — leccion operativa

El protocolo §1.4 pasó a exigir worktree propio a mitad de la sesion, y el motivo se
demostro solo: al empezar en el directorio compartido, la sesion padre committeo su
`TASKQUEUE.md` sobre la rama del ticket, y al volver el compartido a `main` los ficheros
sin commitear de la sesion padre (`AGENTS.md`, `evals/`, `features/`, `docs/templates/`)
desaparecieron de su working tree y hubo que restaurarlos con
`git restore --source=<commit> --worktree -- <rutas>`. **Un ticket empieza creando su
worktree, antes del primer commit.** El worktree necesita ademas dos cosas que no viajan
con git porque estan ignoradas: `ln -s <compartido>/.venv .venv` y `cd app && corepack
pnpm install`.
