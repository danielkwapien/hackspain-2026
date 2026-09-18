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
