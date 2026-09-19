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

## XR-001 — el regimen tiene que decir la forma de la serie

La columna `regime` salia casi inerte (9 de los 14 casos fijados enteros `stable`,
`blip` cero veces en 22.235 filas). No era un umbral mal puesto: eran tres cosas.

- **`breadth` no medía nada.** La desviacion de cada pilar y de cada senal era un
  AR(1) entero (sd estacionaria 1,40 en unidades de `PILLAR_SPREAD` /
  `SIGNAL_SPREAD`), con un ruido a tres meses de ~0,10 en `u`. La deriva de una
  caida de 1 punto/mes es 0,03: el indice de difusion salia ~40 pasara lo que
  pasara, y ninguna serie era nunca "ancha". Ahora esa desviacion se parte en un
  NIVEL propio constante (que es el que da variedad a los drivers y a las
  contribuciones) mas un temblor pequeno: misma dispersion transversal, ruido a
  tres meses /8. Efecto lateral asumido: el ranking de drivers de una empresa es
  mucho mas estable mes a mes que antes.
- **El escalon instantaneo no podia confirmarse.** `run` cuenta meses con el mismo
  signo de `Δ3m Score`, asi que un escalon de un mes deja `run ≤ −3` UN solo mes y
  la histeresis de §6.2 lo descarta siempre. El escalon pasa a completarse en dos
  meses (tres si sube, que es donde §6.2 pide `run ≥ 4`).
- **El bache era ancho.** Se inyectaba bajando TODAS las senales a la vez, y
  `breadth` se iba a 9: ni bache (exige [40, 60]) ni deterioro (exige `run ≤ −3`).
  Ahora el bache es un choque estrecho y un trasvase: unas pocas senales se hunden
  (la biseccion las calibra contra la profundidad pedida), las mismas pocas del
  pilar receptor suben, y el resto del cuadro no se mueve porque el desplazamiento
  comun se resuelve contra el mundo contrafactual sin choque. Con m abajo y m
  arriba el indice de difusion se queda centrado en 50.

Y una correccion en `core.py`, la unica: la rama de `blip` estaba **muerta**. §6.2
pide "|z_own| ≥ 2 durante 1-2 meses ... **y** el nivel vuelve a ±1σ de su mediana
previa en ≤ 2 meses", y las dos mitades no pueden cumplirse el mismo mes: si el
nivel ya volvio, `|z_t|` ya no llega a 2. Exigir las dos a la vez hacia `blip`
inalcanzable (0 filas en todo el dataset). Ahora el mes de confirmacion entra por
`reverted`, con `z_exceed_months` acotando el episodio a 1-2 meses igual que antes.
Ningun umbral se ha tocado. Y `reverted` se calcula contra la mediana ANTERIOR al
choque, no contra la movil: despues de un escalon la movil baja con el score y
`z_own` vuelve a cero sola sin que nada haya revertido.

`cash_drop` (COMP_0905, COMP_1250) pierde el evento NEGCASH forzado: el techo exige
dos meses en descubierto y vale "mientras persista + 1 mes", o sea tres meses de
score hundido, que ya no es "la caida de un mes" del contrato §3 ni cabe en la regla
de bache. El techo sigue vivo para las empresas que de verdad lo disparan (235
empresa-mes con techo en la generacion completa).

## XR-001 — el tramo de la alerta y las senales no disponibles

Dos defectos que el verificador dejo en rojo en `74d7440` (invariantes 07, 15 y 16),
arreglados en el GENERADOR:

- **`score_before`/`score_after` describian el mes de calma, no el suceso** (289 de 638
  alertas contradecian su propia `direction`). La deteccion va detras del suceso por
  construccion: histeresis de dos meses (§6.2) y ventana de `level_shift` (§6.1). Cada
  causa encuadra ahora SU episodio con la regla que la disparo (`simulate._episode_regime`,
  `_episode_level_shift`, `_episode_cap`), y el `message` se redacta de ese mismo tramo con
  el verbo de `direction`: el texto no puede contradecir a las columnas. Detalle de cada
  tramo en `datasets_mocked/README.md` §7.
- **El techo solo alerta el mes en que MUERDE** (`score < level`). Antes alertaba en cuanto
  el codigo de techo se activaba, y en 16 de 59 el techo estaba por encima del nivel: no
  recortaba ni un punto, asi que no habia movimiento que contar. Quedan 47 alertas de techo
  de 839 en total.
- **`signals.csv` escribe las 28 senales de cada empresa-mes**, disponibles o no
  (622.580 filas, 79 MB). Las no disponibles llevan `is_available = false` con `u`,
  `u_smooth`, `value` y `u_ref` NULOS y `weight = contribution = 0`. Con 0 filas no
  disponibles, la invariante 7 del contrato pasaba por vacuidad y la UI no podia distinguir
  "no aplica" de "falta el dato". `exports/v1/results/*.json` no cambia: `contributions` es
  la descomposicion del score y sigue siendo solo las disponibles.
## 2026-09-19 00:43 — XR-002 (sesión XR-002)

Fila XR-002 `building` → `review`. Rama `xr/XR-002-design-tokens`, seis commits sobre `d707076`
(el arnés de XR-000, que todavía no está en `main`: la rama se sacó de ahí, no de `main`, porque
un worktree desde `main` no tiene `evals/` ni `AGENTS.md`).

- `bash evals/checks/XR-002.sh` y `bash evals/smoke.sh` en verde en dos pasadas consecutivas
  (commits `cbe27aa` y `498f636`). Evidencia en `plans/XR-002-design-tokens/evidence/`.
- Desviaciones del protocolo, anotadas como pide §0: los builders trabajaron en el worktree del
  ticket y no en uno propio (son secuenciales y el worktree ya está aislado del directorio
  compartido), y la comparación con Trade Republic se hizo con el navegador integrado de la
  sesión —Chrome con la extensión no estaba conectado—, midiendo con `getComputedStyle` en vez
  de guardar PNG del lado de TR.
- `TASKQUEUE.md` no existe en el worktree (está sin commitear en el directorio principal): la fila
  se actualizó allí.

## XR-001 — el bache se lee sobre el episodio, y tiene fondo

Dos defectos que una revision adversarial dejo en rojo sobre la rama de `blip`, los dos
arreglados en `core.py` (la regla), no en el llamante:

- **La guarda del episodio era inoperante.** `int(stats.get("z_exceed_months", 1) or 1) <= 2`
  convertia `0` y `None` en `1`, asi que "durante 1-2 meses" (§6.2) no podia rechazar nada y
  la rama se apoyaba entera en el booleano `reverted`: `core.regime` devolvia `blip` sin que
  hubiera habido NINGUN choque (`z_own=0`, `z_exceed_months=0`, `reverted=True`). El dataset
  se libraba solo porque `simulate.py` hacia `max(1, z_exceed)` y `_shock_reverted` exigia un
  episodio real: la correccion vivia en el llamante. Ahora `z_exceed_months` es dato
  OBLIGATORIO de `core.regime` (`0` = no hay episodio; ausente o `None` levanta `ValueError`,
  porque asumir 1 es justo lo que dejaba pasar baches sin choque), la rama exige
  `1 <= z_exceed_months <= 2`, y dentro de ella `blip` pide `reverted` y `shock_pending` pide
  el episodio vivo (`|z_t| >= 2`). `reverted` sin episodio ya no puede dar `blip`. Los dos
  llamantes dicen la verdad: la empresa reporta los meses del episodio o `0`, y el grupo los
  mide con `_shock_episode` en vez de escribir `1` a mano.
- **Un bache de 1,4 puntos no es un bache.** 81 de 192 filas `blip` tenian un recorrido de
  score menor que 5 puntos en su ventana de 6 meses (minimo 1,38 en `COMP_0905 2026-01`). El
  defecto estaba en `core.z_own`, no en el generador: con una MAD de medio punto —la mitad
  del universo esta por debajo de 2,1— el ruido normal del score daba `|z| ~ 2,8` y §6.2 lo
  llamaba choque. `z_own` lleva ahora un suelo de escala de 2,5 puntos
  (`max(1,4826 * MAD, 2,5)`), con lo que `|z| >= 2` implica SIEMPRE una desviacion de >= 5
  puntos respecto de la mediana previa: los mismos 5 puntos con los que §6.2 mide "por debajo
  del maximo" en `recovering`. El caso MAD = 0 sigue devolviendo 0,0.

Resultado en la generacion completa (`--seed 42 --now 2026-09-19T00:00:00+00:00`): `blip`
pasa de 192 filas / 73 empresas a 72 filas / 31 empresas, con una caida de episodio de entre
5,10 y 21,11 puntos (mediana 12,90) detras de cada una de las 72. El recorrido de score en la
ventana de 6 meses tiene mediana 13,42 y minimo 2,12: las dos unicas filas por debajo de 5
son la cola de la histeresis de §6.2 (`COMP_0099 2026-08`, seis meses despues de una caida de
13 puntos), donde la etiqueta sigue viva pero el pozo ya salio de la ventana. Los 14 casos
fijados del contrato siguen mostrando su regimen y las alertas se mueven de 839 a 820 por el
efecto del suelo de escala sobre el CUSUM.

## 2026-09-19 02:10 — XR-001 (sesión XR-001) · petición de review

Fila XR-001 `building` → `review`. Rama `xr/XR-001-mock-dataset`, 20 commits sobre
`origin/main`. **Ojo al estado del merge:** el PR #2 se mergeó en `f7f6204`, pero recogió
`0af427c`; los **9 commits posteriores (`58cb679..289bbe1`) NO están en `main`** y son
justo los arreglos de las dos revisiones adversariales. Lo que hoy vive en `main` tiene los
tres defectos:

- `test_mock_invariants.py:557` `cap_adj = level - score`: la invariante 3 es una
  tautología y pasa con cualquier `score` (demostrado poniendo `score = 0` en las 22.235
  filas y desactivando el techo: las dos mutaciones pasaban).
- `routes.ts:569` `size * (colorValue ?? 0)`: el treemap imputa 0 a las métricas ausentes
  y deja su peso en el denominador. `GROUP_0132` en `2025-03` salía `+0,10` (grupo
  mejorando) donde `group_timeline.csv` dice `−3,44` (deteriorándose).
- `core.z_own` sin suelo de escala: con una MAD de medio punto el ruido normal daba
  `|z| ≈ 2,8` y §6.2 lo llamaba choque; 81 de 192 filas `blip` eran ruido.

Verificación de la rama completa (dos pasadas consecutivas, 02:05:38 y 02:06:11):
`bash evals/smoke.sh` exit 0 y `bash evals/checks/XR-001.sh` exit 0; 46 tests Python
(21 de fórmula + 22 invariantes + 3 de contrato) y 21 de `app/api`; determinismo byte a
byte contra el dataset committeado; y prueba de mutación de que los arreglos tienen
guardia (revertir el suelo de `z_own` pone rojo 1 test, devolver el default silencioso de
`z_exceed_months` pone rojos 2). Evidencia en `plans/XR-001-mock-dataset/evidence/`.

Desviaciones del protocolo, anotadas como pide §0: el ticket empezó en el directorio
compartido y se movió al worktree a mitad de sesión (ver la lección de abajo); los builders
trabajaron en el worktree del ticket y no en uno propio, porque `.venv` y `node_modules`
están ignorados y no viajan con `git worktree`.

## XR-001 — lección: un arreglo sin guardia no es un arreglo

Dos veces en la misma sesión un test existía, estaba en verde y no medía nada:

1. La invariante 7 pasaba **vacuamente**: comprobaba que las señales de factura de las
   empresas sin facturas tuvieran `is_available = false`, y esas filas no se escribían, así
   que filtraba 0 filas. La cerró una aserción de no-vacuidad en toda invariante que filtre.
2. La invariante 3 era una **tautología**: definía `cap_adj := level − score`, con lo que
   `score` se cancelaba de los dos lados y ni el score ni el techo se verificaban. La cerró
   reconstruir `cap_adj` de `level` y `cap`, que son columnas independientes.

Y una tercera variante, la que más duele: arreglar `z_own` y `z_exceed_months` **sin añadir
el test que impide revertirlo**. El adversary lo demostró mutando `core.py` en caliente y
viendo los 42 tests seguir verdes.

La regla que sale de aquí, para cualquier test de este repo: **un test sólo cuenta si se ha
visto fallar**. En concreto — (a) toda invariante que filtre filas lleva una aserción de que
el subconjunto no está vacío; (b) ningún término de una identidad se deriva de la misma
cantidad contra la que se compara; (c) todo arreglo llega con la mutación que lo revierte y
el test que la caza. `evals/checks/XR-001.sh` no lo puede comprobar: es disciplina al
escribir el test, y es lo que el adversary tiene que buscar primero.
## 2026-09-19 · XR-003 arranca (arranque anticipado, plan §11)

- Rama `xr/XR-003-widget-shell` en worktree `../hackspain-embat-XR-003`. Fila en `building`.
- XR-001 y XR-002 siguen en `building`: se aplica el plan §11 (pasos 1–3 con fixtures locales).
  XR-002 ya tiene `index.css` y `docs/design/tokens.md` completos en su rama; XR-003 estiliza con
  los alias de shadcn (`bg-card`, `border-border`, `text-muted-foreground`), que XR-002 conserva,
  y concentra las medidas de rejilla en `dashboard/grid.ts` para que el commit
  `XR-003: adopt design tokens` toque un solo fichero.
- **Contradicción plan/código:** el plan §3.6 dice que `/company/:id` "se mantiene", pero la ruta
  que existe hoy en `App.tsx` es `/companies/:companyId`. Se resuelve a favor del plan (y de
  XR-004, que también la nombra `/company/:id`): se añade `/company/:id` como ruta hacia la
  `CompanyPage` existente, sin tocar la página ni retirar la ruta antigua.
- **Decisión de dependencia:** store propio con `useSyncExternalStore` en vez de `zustand`
  (protocolo §7: no se instalan dependencias no listadas sin preguntar).

### Paso 1 (scout): decisión de rejilla y virtualización

- **Rejilla: implementación propia** sobre CSS grid de 24 columnas con pointer events. Cero
  dependencias nuevas.
  - `react-grid-layout` queda **descartado por un crash de runtime en React 19**: arrastra
    `react-draggable`, que llama a `ReactDOM.findDOMNode`, eliminado en React 19
    (react-grid-layout/react-draggable#771, abierta desde 12/2024). No es fricción de tipos.
  - `@dnd-kit/core` (propuesto por el scout) queda descartado por el criterio del plan §3.2
    («la opción que reproduzca eso con menos dependencia»): su `KeyboardSensor` mueve por
    píxeles y habría que sobrescribir `getNextCoordinates` para movernos por celda, el resize
    por esquina hay que escribirlo a mano de todos modos, y la compactación vertical también.
    Lo que aporta sobre un `onKeyDown` propio no compensa una dependencia en modo mantenimiento
    (su autor anunció la reescritura `@dnd-kit/react`).
- **Virtualización: `@tanstack/react-virtual`** solo en el widget Buscador (1.286 filas de 24 px).
  Declara React 19 en sus peer deps y el plan §3.4 la nombra. Se pasa `useFlushSync: false`
  (TanStack/virtual#743). En jsdom no rinde filas si no se mockea `ResizeObserver` para que
  dispare su callback: el mock va en `src/test/setup.ts`.
- **`EntityPicker` NO se virtualiza** (desviación consciente del plan §3.3): renderiza como mucho
  50 coincidencias y cuenta el resto. Un buscador con filtro no necesita pintar 1.286 filas, y
  así los tests de teclado no dependen de medir alturas en jsdom.

### Pasada 1: veredicto del adversary y lecciones

- **FAIL 1 (aceptado, corregido):** `Canvas` montaba `WidgetFrame` sin `children` y el marco solo
  pintaba `{children}`, asi que `definition.component` no se invocaba desde ningun camino de
  produccion: en `/` los dos widgets salian con el cuerpo vacio. Los 7 checks pasaban igual. El
  adversary lo encontro leyendo el diff y la sesion lo encontro en paralelo abriendo el navegador.
  Corregido en `78684dc` con tres tests que lo cubren.
- **FAIL 2 (rechazado, spec aclarado):** el adversary marco como violacion de alcance que el primer
  commit mueva la fila 3 de `TASKQUEUE.md` de `todo` a `building`. La regla de `AGENTS.md` es que la
  cola es single-writer de la **sesion orquestadora** mientras la fila esta en `building`, y el
  protocolo §2.4 lo ordena explicitamente. La seccion 3 del spec decia «intocables para el builder»
  y el adversary lo leyo como absoluto: reescrita para que no vuelva a levantarse.

**Lecciones de operacion (para `compound` al cerrar):**
1. **El builder tiene que commitear su propio trabajo.** La regla «yo commiteo despues de verificar»
   choca con un adversary que restaura ficheros para probar el estado real de la rama: entre su
   restauracion y su vuelta atras, el commit del orquestador capturo el codigo roto y perdio la
   correccion. Un worktree, un escritor con commit propio.
2. **El check verde no prueba que la pantalla funcione.** Los tres defectos de integracion de esta
   pasada (cuerpo de widget vacio, el clic de fila que se traga el `setPointerCapture`, el
   `group-hover` sin nombre que enciende las 12 filas) pasaron los 7 checks y solo aparecieron al
   abrir el navegador. En un ticket de UI, la pasada no esta terminada sin mirar la pantalla.

### Rebase sobre `main` con XR-002 dentro

XR-002 se mergeo en `main` (PR #1) y su fila quedo en `done`, asi que la rama se rebaso siguiendo el
plan §11. Tres conflictos, todos resueltos a favor de `main` mas lo propio encima:

- `TASKQUEUE.md`: se conserva la fila 2 de `main` (XR-002 `done`, con PR y evidencia) y la fila 3
  propia (XR-003 `building`).
- `features/NOTES.md`: union de las dos columnas, sin descartar nada.
- `app/web/src/App.tsx`: solo la linea de `import` de React. `main` trae `Suspense, lazy` para el
  playground de tokens y XR-003 trae `useEffect` para `loadFromStorage`; el resto del fichero lo
  fusiono git solo. La ruta `/tokens` de XR-002 y las de XR-003 (`/`, `/portfolio`,
  `/company/:id`) conviven.

`index.css` y `lib/api.ts` no dieron conflicto. Tras el rebase: 48 tests en 13 ficheros y
`evals/checks/XR-003.sh` en `exit: 0`.

### Desviacion deliberada del plan §3.3: el selector de entidad mide 490 px, no 320

El plan fija un popover de 320 px con seis piezas por fila (nombre, id, grupo, score, regimen,
sparkline 64×16). Medido con las fuentes reales del proyecto, no caben:

- contenido disponible a 320 px: 294 px (310 de listbox menos 16 de `px-2`);
- lo que no puede encogerse: id 58,7 + score 18 + sparkline 64 + 5 gaps de 6 = **171 px**;
- quedan **123 px** para nombre + grupo + regimen, y solo el nombre necesita 119-128;
- peor caso real (fila con «Choque pendiente»): `scrollWidth` 374 sobre `clientWidth` 310.

Los tres repartos posibles a 320 px dejan el nombre entre 17 y 54 px, es decir ilegible. **Alfonso
decidio ensanchar a 490 px y conservar las seis piezas**, frente a las dos alternativas medidas
(acortar el contenido — `0147` en vez de `GROUP_0147` y el regimen como punto de color — o quitar
grupo y etiqueta de regimen). Queda anotado aqui porque el plan manda sobre el protocolo y esta es
una desviacion consciente de una medida que el plan da explicita.

Efecto lateral que el arreglo cubre: a 490 px el popover se sale del marco en un widget estrecho o
pegado al borde derecho, asi que se ancla por la derecha cuando no cabe hacia la derecha.

## 2026-09-19 01:20 — XR-012 (sesión XR-012)

Fila XR-012 `todo` → `building`. Rama `xr/XR-012-chart-primitives` desde `main` (`2b2ae83`),
worktree `../hackspain-embat-XR-012`. Spec y check nacieron en rojo (`exit: 1`, «No test files
found») en el commit `6baeada`.

Hallazgos de la pasada de `dataviz` que **no se arreglan en XR-012** y necesitan dueño:

- **Rampa de treemap (XR-002 / XR-008).** `--treemap-pos-1` y `--treemap-neg-1`, compuestos sobre
  `--surface-primary`, dan 1,16:1 y 1,09:1 de contraste: por debajo del suelo de 2:1 que pide el
  validador de `dataviz` para el extremo claro de una rampa ordinal. Además ΔL entre los escalones
  1 y 2 es 0,056 y 0,044, bajo el mínimo de 0,06: los dos primeros escalones no se distinguen.
  XR-012 lo mitiga con separación de 1 px en color de superficie entre tiles y con el valor como
  texto, pero la rampa sigue teniendo cuatro escalones de los que solo se leen tres.
  Reproducir: `node <skill dataviz>/scripts/validate_palette.js "#0b2533,#0a3736,#09523b,#068043" --mode dark --surface "#0c1230" --ordinal`.
- **Tonos de pilar (XR-004).** Los cinco `--chart-pillar-*` fallan el suelo de visión normal:
  `--tone-orange` ↔ `--tone-yellow` dan ΔE 8,6, por debajo de 15, o sea que ni con visión de color
  completa se distinguen bien. Bajo protanopia el peor par baja a 5,7. El carrusel de familias de
  XR-004 no puede apoyarse solo en esos tonos: necesita etiqueta o forma. XR-012 no los consume
  (`PillarBar` colorea por tramo de nota, no por identidad de pilar).
- **Verde ↔ rojo (transversal).** ΔE 6,2 bajo deuteranopia: banda 6–8, legal solo con codificación
  secundaria obligatoria. Todo widget que use el semáforo tiene que llevar el signo también en
  texto, glifo o forma. En XR-012 lo garantizan `fmtDelta` (glifo), los `aria-label` de `Sparkline`
  y `LineNoAxes`, y las tablas visualmente ocultas.
- **Régimen `shock_pending` sin token (XR-002 / XR-020).** El motor emite siete regímenes
  (`mock-data-contract.md` §2.3, `ENGINE-EMBAT.md` §6.2) y XR-002 dio token a seis.
  `charts/palette.ts` lo mapea a `--regime-blip`, que es correcto semánticamente (es un bache sin
  confirmar), pero conviene decidir si merece token propio.

Deuda anotada, sin dueño todavía: `components/activity-chart.tsx` e `invoice-chart.tsx` siguen
dibujando con recharts fuera de `src/charts/`. Son de la pestaña Datos y de otro dominio; el plan
XR-012 §3.8 los deja fuera a propósito y el test de contención los permite explícitamente.

Desviaciones del plan aceptadas en esta sesión (detalle en `features/XR-012/spec.md` §6):
el check lleva nueve líneas y no ocho (faltaba `web_test ChartTooltip`); el catálogo de `/tokens`
usa datos fijos propios porque `docs/api/examples/` no existe; y el presupuesto de la sparkline
pasa de «500 en 120 ms» a memoización comprobada de forma determinista más un techo de regresión,
porque un umbral de reloj fino hace el check dependiente de la máquina y el check ES el loop.

## 2026-09-19 01:50 — XR-012 cerrado (sesión XR-012)

Fila XR-012 lista para `review`. **La rama no toca `TASKQUEUE.md`** (protocolo §2.4, que cambió
a mitad de sesión): el cambio de estado lo hace el Gate en `main`. Rama
`xr/XR-012-chart-primitives`, once commits sobre `2b2ae83`.

- `bash evals/smoke.sh` y `bash evals/checks/XR-012.sh` en verde en dos pasadas consecutivas,
  repetidas después del arreglo del adversary. Scorer `PASS`, adversary un ticket aceptado y
  arreglado. Evidencia en `plans/XR-012-chart-primitives/evidence/`.
- **Hallazgo de producto, arreglado aquí:** `LineNoAxes` ajustaba la escala vertical al min/max
  de sus datos, así que un régimen `stable` de 0,9 pts se dibujaba con los mismos 132 px que un
  desplome de 29 pts. Sin ejes, el lector no podía notarlo. Añadido `minSpan` (por defecto 10
  pts, el dominio de un score 0–100) y fijado por test verificado por mutación. **El 10 es una
  suposición sobre el dominio del score, no una medida**: quien dibuje otra magnitud tiene que
  pasar su propio `minSpan`.
- **Desviación del protocolo §4, sin resolver:** Chrome con la extensión no estaba conectado
  (`list_connected_browsers` → `[]`), así que **no hay pares de capturas local/TR**. En su lugar,
  medidas en vivo con `getComputedStyle`/`getBoundingClientRect` contrastadas contra la
  especificación escrita de `trade-republic-tokens.md` §3, en `evidence/measures.txt`. Todas
  coinciden (148 px, 2 px, 64×16, 6 px, punto 8 px, z-index 1800). Es la misma desviación que
  aceptó XR-002, pero la decide el Gate.
- **Auditoría `web-design-guidelines` (paso 10 del plan), hecha y con dos arreglos.** El de fondo:
  un tile del treemap era focusable pero **no mostraba ningún anillo de foco**, porque el
  separador entre tiles es un `outline` puesto en el `style` inline y un inline gana a cualquier
  clase. El primer intento (recolorear el `outline` por clase) tampoco funcionaba por lo mismo;
  el anillo va ahora por `box-shadow`, verificado con Tab real y no con `.focus()`, porque
  `:focus-visible` no se activa con foco programático. Informe en
  `evidence/web-design-guidelines.txt`.
- El paso 7 del plan (migrar `ScoreChart` y las sparklines del Buscador) **no se hizo porque
  XR-003 y XR-004 no están en `main`**. Lo único migrable hoy era la sparkline dibujada a mano de
  `/tokens`, y está migrada. Cuando XR-004 entre, su criterio es que sus tests pasen sin editarlos.

## 2026-09-19 03:20 — XR-030 en `building` (sesión XR-030)

Rama `xr/XR-030-tr-redesign` en `../hackspain-embat-XR-030`, último commit `b836660` (auditoría,
spec y check en rojo). La fila sigue en `todo` en `main`: pido a la sesión padre que la pase a
`building` (protocolo §2.4: la rama no toca `TASKQUEUE.md`).

- Fase 0 hecha: `docs/design/redesign-audit.md` (Trade Republic medido en vivo / X-Ray hoy /
  decisión). Hallazgos que cambian el plan: (1) Trade Republic **no tiene orbe en el tablero**,
  solo en el login, y es un `canvas.spotlightCursor` que sigue al cursor, no CSS; (2) sus widgets
  no llevan `backdrop-filter` (solo los controles, `rgba(32,32,32,.6)` + `blur(16px)`); (3) el
  cliente `lib/api-v2.ts` y sus fixtures modelan un contrato viejo (once derivas, la peor `Band`
  A–D frente a `solid|healthy|watch|stress`), así que los tests actuales están en verde porque
  las fixtures mienten igual que el tipo.
- Desviación del protocolo §4, igual que XR-002 y XR-012: la extensión de Chrome no está
  conectada; las capturas de Trade Republic quedan en el chat y sus medidas en
  `plans/XR-030-tr-redesign/evidence/measures-tr.txt`. Las capturas locales sí van a disco
  (Chrome headless a 1440×900).
- `/goal` no existe como skill en este arnés: las pasadas de `queue-run` (builder → scorer +
  adversary, un item por pasada) se lanzan a mano con los agentes de `.claude/agents/`.
- La web del worktree corre en `http://localhost:4173` (el 5173 lo tiene la sesión padre con
  `main`; el 4173 es el otro origen que acepta la API).

## 2026-09-19 04:25 — XR-030 listo para `review` (sesión XR-030)

Rama `xr/XR-030-tr-redesign` en `../hackspain-embat-XR-030`; la fila la mueve la sesión padre
en `main`. Merge sugerido: `git merge --no-ff xr/XR-030-tr-redesign` (la rama ya incluye
`origin/main` en `3dd4047`; `TASKQUEUE.md` no se toca en la rama).

- Dos pasadas limpias consecutivas del scorer (`smoke` y `checks/XR-030.sh` en 0) y adversary
  `PASS` en los ocho items (1 con tres pasadas: dos tickets corregidos; 5 con dos: roving
  tabindex tras scroll virtual). Evidencia en `plans/XR-030-tr-redesign/evidence/` (`checks.txt`,
  `measures-tr.txt`, capturas `03-local-*.png` por CDP a 1440×900).
- Construido: tokens `--navy-1000`/glass/orbe + capa `Background`; cliente v2 alineado con la
  API (once derivas); store de selección; shell de una página (topbar, `Panel`, rejilla 12/12);
  paneles Empresas, Comparativa e Investigación; pasada de motion y accesibilidad; guía
  `docs/design/widgets.md` reescrita; `docs/design/redesign-audit.md` con medidas, motion y a11y.
- Desviaciones aceptadas: pares de capturas de Trade Republic solo en el chat (navegador
  integrado sin guardado a disco; medidas en `measures-tr.txt`); reparto de rejilla 12/24 en vez
  del 10/24 del plan (medido: a 10/24 la tabla escondía Id, Grupo y Δ3m); `/goal` inexistente en
  este arnés (pasadas de `queue-run` a mano); `design-review-animations` y `gauntlet` son de
  invocación humana: pendientes de que Alfonso las lance.
- Pendiente de decisión de Alfonso: variante de fondo (Marino por defecto; Aurora o Foco son
  cinco tokens en `index.css`) y, tras elegir, borrar `/prototypes/background`.
- Fuera de alcance, anotado: tokens huérfanos del lienzo (`--grid-cols`, `--grid-row`,
  `--widget-padding`, `--surface-widget`, `--text-widget-title`); `GLASS_CLASS` duplicada en
  `topbar.tsx` y `CompaniesPanel.tsx`; `tokens.ts` toma la última declaración de un token sin
  distinguir `@media` (bloquea `prefers-reduced-transparency`); «Menú de perfil» sin menú.

## 2026-09-19 08:10 — XR-031 en `building` (sesión XR-031)

- Rama `xr/XR-031-dashboards-research` en el worktree `../hackspain-embat-XR-031` (web en 4173;
  5173 y 8787 son de la sesión padre). Fila 31 en `building` en `main` (`c385bc1`, esta sesión
  como Gate delegado por decisión de Alfonso). Plan en
  `plans/XR-031-dashboards-research/PLAN.md`; evidencia en `.../evidence/`.
- Decisiones de Alfonso (chat): catálogo de 6 widgets con drag/resize, máx. 4 por tablero de
  usuario; Principal fijo (solo maximizar); API v2 tocable con dos cambios de mapeo; fondo
  `#020a24` con orbe azul y foco que sigue al puntero; escala al hover solo en controles y
  tarjetas; Investigación arriba a la derecha y Comparativa abajo.
- Ola 0: `features/XR-031/spec.md` y `evals/checks/XR-031.sh` (`ec97987`); línea base del check
  ≠ 0 (`evidence/check-00-baseline.txt`: `web_test widgets/` sin ficheros). Tests en rojo por tres
  builders paralelos; T1 integrado (`17a8b4c`): 29 tests web y 6 de API en rojo por la razón
  correcta. Desviación aceptada del plan, fijada por los tests: `CompanyPicker.value` es
  `{id, name} | null` y `onPick(item | null)`; `fmtSignedPoints` devuelve `{text, tone, sign}`.
- En curso: T2 (tableros/widgets/shell) y T3 (paneles) en rojo; U5a (API) y U5b (cimientos web)
  construyendo en paralelo sobre los tests de T1.

## 2026-09-19 12:40 — XR-031 olas 1–3 integradas (sesión XR-031)

- Rama `xr/XR-031-dashboards-research`, último commit de producto `c019c0d`; check completo en
  verde (`evidence/check-02-green.txt`); adversary `PASS` en U5a, U1, U5b (tras arreglar
  `fmtSizeShort`), U6, U2 (tras `Escape` en Principal), U4 (tras plural), U7 (tras el sufijo de
  mes de la identidad), U8 (tras dos vueltas de deduplicación A/B). U3 dio `red` por la escala en
  las tarjetas del catálogo: rechazado con motivo (decisión de Alfonso: «tarjetas del catálogo»
  escalan; el adversary solo ve el spec). Anotado en el spec como desviación aceptada.
- Correcciones del orquestador sobre tests de la ola 0: slots numéricos en `ComparePanel.test`,
  identidad `score = min(level, cap)` en la API (`level` ya es neto), matchers con espacio fino en
  `GroupWidget.test`, `treemapExample` en `TreemapWidget.test`, tipos de los ejemplos JSON en
  `hover.test`/`Methodology.test`, regex del nombre accesible del picker en `WidgetFrame.test`.
- Bloqueo resuelto: `Grid.tsx` y `grid.ts` colisionan en APFS (`@/dashboard/Grid` resolvía al
  módulo de matemáticas); renombrado a `grid-math.ts`.
- Smoke: `api` y `web` verdes por separado; en pasadas completas fallan por tiempo (`Sparkline`
  presupuesto 1500 ms, `/tokens` lazy `findByRole` 1 s, un `timeline` de API a 5 s) cuando hay
  otros vitest o el navegador con el orbe animado en marcha. Se repiten las dos pasadas con la
  máquina descargada (`evidence/smoke-0N.txt`).
- Verificación visual en 4173 contra API propia en 8789: Principal por grupos con desglose,
  Investigación con trío KPI + hover por mes + familias + metodología, Comparativa A/B con picker,
  tablero «Tesorería» con Mapa/Alertas/Grupo/Investigación, drag y persistencia tras recarga.
  Medidas TR/local en `evidence/measures-tr.txt`.
- En curso: U10 (docs), U11 (crossfade al maximizar, tarjetas de catálogo a dos líneas, borrado de
  `/prototypes/background` y `orb-breathe`), capturas CDP, scorer final, `compound`.

## 2026-09-19 12:30 — XR-031 listo para `review` (sesión XR-031)

- Rama `xr/XR-031-dashboards-research`; dos pasadas limpias consecutivas: orquestador
  (`evidence/smoke-06.txt`, `check-04.txt`, exit 0) y scorer (PASS, en `evidence/checks.txt`).
  Adversary PASS en todas las unidades salvo U3 (rechazado con motivo, ver arriba).
- Cierre: docs (`widgets.md` reescrita como guía de tableros y widgets, `redesign-audit.md` §8,
  `tokens.md`), `/prototypes/background` y `orb-breathe` borrados, crossfade al maximizar,
  tarjetas del catálogo a dos líneas, widget Grupo resuelve el grupo de la empresa fijada,
  tests de `/tokens` y treemap robustos a carga. Lección `compound` en `AGENTS.md` (sondas de
  adversaries antes del smoke).
- Observación sin causa hallada: en la primera carga de una pestaña del panel del navegador la
  tabla apareció en vista «Empresa» (peticiones `unit=company`); en recarga y en perfil CDP
  limpio arranca en «Grupo». No reproducido; sin efecto en tests.
- Pendiente de Alfonso: `/design-review-animations` y `/gauntlet` (invocación humana); revisar
  el copy del bloque 9 (regímenes) de la metodología; merge de la PR y `done` en la cola.
- Fuera de alcance, anotado: etiquetas del treemap se solapan en tiles densos (primitiva de
  XR-012); selección no persistida (por diseño); «Menú de perfil» sigue sin menú.

## 2026-09-19 14:40 — XR-032 en `building` (sesión XR-032)

- Plan aprobado por Alfonso (`plans/XR-032-company-research-panels/PLAN.md`): dos tableros fijos
  («Empresa» = Investigación + Investigación profunda; «Investigación» = Mapa, Empresas, Favoritos,
  Cartera, Comparativa, Alertas), buscador central 50 % con árbol de grupos y empresas, gráficas
  con transición de rango, presente al 78 % y eje de fechas, Mapa con nombres, Favoritos y Cartera,
  informe de Health pregenerado (script en `app/tools`), Inter como única fuente.
- Decisiones de Alfonso: Inter (TradeRepublicSans es propietaria), informe pregenerado y
  versionado, se mantienen los tableros de usuario (catálogo pasa a 9), elegir un grupo abre la
  ficha de grupo.
- Rama `xr/XR-032-company-research-panels` en `../hackspain-embat-XR-032` (web 4173 con
  `VITE_API_URL=http://localhost:8789`, API 8789). Fila 32 en `TASKQUEUE.md` (`acebd59`).
- Ola 0: spec + check (`74cedf3`), tres builders T escribiendo los tests en rojo en paralelo.

## 2026-09-19 16:10 — XR-032 integración de las olas 0–2 (sesión XR-032)

- Tests en rojo (T1/T2/T3: `34a6c97`, `41f8e3c`, `688086e`); baseline del check en rojo
  (`evidence/check-00-baseline.txt`). Dos builders T murieron por límite de sesión a medias y se
  retomaron con `SendMessage` sobre su worktree sin perder trabajo.
- Integrados con adversary PASS: U0 Inter (`50b32be`), U1 tableros fijos (`bb2a118`), U7 gráficas
  (`b6b7a10`), U8 Mapa (`cc7a873`). U2 API (`743c7b6`) con ticket del adversary atendido en
  `e3f0cd9` (`httpx` al grupo `reports`, `pydantic` aceptado en el spec). U3 cimientos
  (`dc76c2d`, adversary en curso) y alertas con nombre (`da99ae8`). Ejemplos de la API
  regenerados con un `company-report.json` **provisional** (`144201e`): U10 lo sustituye cuando
  Alfonso genere los informes reales.
- En curso (ola 3, en paralelo): U4 buscador + `CompanyTree`, U5 Investigación, U6 Investigación
  profunda, U9a Favoritos y Cartera. Después: U9b estrella, U11 pulido, U10 cierre.

## 2026-09-19 18:05 — XR-032 listo para `review` (sesión XR-032)

- Once unidades integradas con adversary PASS: U0 Inter (`50b32be`), U2 API + script de informes
  (`743c7b6`, ticket del adversary atendido en `e3f0cd9`), U7 gráficas (`b6b7a10`), U8 Mapa
  (`cc7a873`), U3 cimientos (`dc76c2d`), U1 tableros fijos (`bb2a118`), U9a Favoritos y Cartera
  (`fa41b0a`), U4 buscador y `CompanyTree` (`f22c180` + `afddf65`), U6 Investigación profunda
  (`e1ee616`), U5 Investigación (`1750e37`), U9b estrella (`1d0a58d`), U10 docs (`0ba07d2`) y
  U11 pulido (`b164b9f`, `84359c9`).
- Dos pasadas limpias: orquestador (`evidence/smoke-04.txt`, `check-03.txt`, exit 0) y scorer
  (`evidence/smoke-scorer.txt`, `check-scorer.txt`). Suite: API 32, web 313, `app/tools` 7.
- Evidencia en `plans/XR-032-company-research-panels/evidence/` (13 capturas + `measures-tr.txt`).
- Incidencias del loop: dos builders de tests en rojo y los de U10/U11 murieron por límite de
  cuota; se retomaron desde su worktree sin perder trabajo (lección en `AGENTS.md`).
- Pendiente de Alfonso: generar los 5 informes reales
  (`cd app/tools && uv run --group reports python gen_health_reports.py` con su `ANTHROPIC_API_KEY`;
  hasta entonces la tarjeta dice «Informe no disponible» y `docs/api/examples/company-report.json`
  lleva un informe provisional), `/design-review-animations` y `/gauntlet`, merge y `done`.
- Abierto, sin efecto visible: React avisa una vez en consola de desarrollo
  («`NaN` is an invalid value for the `height` css style property») al montar `/`. Sondas CDP con
  trampa en `CSSStyleDeclaration` y un test que espía `console.error` no lo reproducen: React
  valida el valor y no llega a asignarlo, así que la pila solo trae marcos de react-dom. No afecta
  al render ni a producción (el aviso es dev-only). Queda para un ticket aparte.
- Fuera de alcance, anotado: las etiquetas de grupo del treemap siguen solapando en zonas densas
  (primitiva de XR-012); el overlay no marca la entidad ya seleccionada en sus resultados.

## 2026-09-19 18:30 — XR-032 choca con la rama de MotherDuck (sesión XR-032)

- Mientras XR-032 estaba en vuelo, `main` avanzó con la PR #9 («api: serve MotherDuck data across
  dashboard contracts», `99ee4f0`). `git merge origin/main` sobre la rama del ticket da **9
  ficheros en conflicto y 19 hunks**: `app/api/src/app.ts`, `components/topbar.tsx`,
  `lib/api-v2.ts`, `panels/companies/CompaniesPanel.tsx`, `panels/compare/ComparePanel.tsx`,
  `panels/research/ResearchPanel.tsx`, `widgets/group/GroupWidget.tsx` y los dos del Mapa.
- **No se ha resuelto a propósito.** No es un choque textual: la PR #9 hace nulables `score`,
  `band`, `delta_1m/3m`, `regime`, `confidence` y `op_in_12m` y añade `snapshot`/`ScoreSnapshot`
  porque el dato real de MotherDuck tiene huecos. Adaptar a eso los paneles reescritos en XR-032
  es la integración con el motor real, que ya tiene su fila en la cola (XR-020), y decidir qué
  versión manda en cada hunk es del Gate.
- PR #10 queda abierta sobre `90aa9d3` (el `main` del que nació la rama), verificada y con
  evidencia. Alfonso decide el orden: si mergea XR-032 primero, la tolerancia a nulos se vuelve a
  aplicar encima de la disposición nueva; si mergea al revés, XR-032 rebasa sobre MotherDuck.

## 2026-09-19 — XR-033 fase 0: decisión de contrato y resolución de PR #10

- El Gate confirmó en esta sesión que prevalece `docs/api/v2.md`: `level` ya lleva
  descontada la penalización y `score = min(level, cap)`. Al publicar el motor se adaptará
  su salida a esa semántica; no se aplicará literalmente la identidad incompatible de
  `docs/ENGINE-CONNECTION.md` §6 ni se cambiará el contrato v2.
- La fase 0 se resuelve en un worktree temporal de `xr/XR-032-company-research-panels`,
  conservando la disposición de XR-032 y la tolerancia a nulos de la PR #9.
- XR-033 no inicia las fases del motor hasta que Alfonso haya mergeado la PR #10.
- Se resolvieron los nueve conflictos y se propagó la nulabilidad a los componentes nuevos.
  La prueba de navegador detectó y se corrigieron el score nulo mostrado como `0,0` en
  las tablas y el fallo de `KeyStats` al formatear una rama nula. Se añadieron regresiones.
- Verificación independiente previa al cierre: `DATA_SOURCE=local API_URL=http://localhost:8794
  BASE_URL=http://localhost:4173 bash evals/smoke.sh` terminó con exit 0: web 319 tests,
  API 32 tests, tools 7 tests, typecheck y build correctos. Evidencia de sesión en
  `plans/XR-033-phase0/` (gitignored); revisión y QA finales ligadas al commit en su ledger.
- `TASKQUEUE.md`, `evals/` y el motor no reciben cambios propios de esta resolución;
  las actualizaciones de esos ficheros proceden del merge de `origin/main`.

## 2026-09-19 — XR-033: cálculo temporal y línea base antes de publicar

- Base de trabajo: `66a2decb52dcdc17ea12387ea2b7761390ec6d17`, PR #10 mergeada con autorización explícita del Gate en el chat.
- Worktree: `hackspain-embat-XR-033`, rama `xr/XR-033-engine-connection`.
- `.venv/bin/python core/pipeline_embat.py` salió 0: panel de 6000 filas, 250 grupos por 24 meses, 249 grupos con score final. Salida conservada en `core/outputs/scores_embat.json` y copia en `plans/XR-033/baseline/scores_embat.json`.
- `.venv/bin/python core/evaluate.py` salió 0. Copia inmutable de referencia en `plans/XR-033/baseline/evaluation.json` y hashes en `SHA256SUMS`. M1 score@3m 0.742, score@6m 0.698; M2 rho 0.93; M3 249 grupos, mediana 51.51, sd18.9; M4 PSI0.3492.
- La API de main sigue sirviendo `static-baseline-v1`, un mes, `snapshots_only:true`. No se ha publicado todavía ninguna tabla temporal en MotherDuck.
- Discrepancia de diseño observada antes de escribir el adaptador: el motor que ahora vive en main es `embat-layered-v1` y aplica modificadores estratégicos de trayectoria y red al nivel antes del techo (`core/engine/config.py`, `strategic.py`, `__init__.py`). El plan espera `embat-temporal-v1` y deja esas señales fuera del número (§5 fase4). Se conserva la línea base sin revertir el motor ni rebautizar silenciosamente el modelo.
- Sigue vigente la decisión del Gate: v2 conserva `level` después de penalización y `score=min(level,cap)`. La adaptación debe explicar también los modificadores reales, sin esconderlos ni restar dos veces la penalización.

## 2026-09-19 — XR-033: alcance ajustado a la tanda de conexión (goal-writer)

Decisión del orquestador sobre el encargo vigente de XR-033 (conexión motor–publicación–API–UI, con builder trabajando en core/app):

- Sigue DENTRO: ambas unidades (grupo y sociedad), nulos reales, cinco rangos 1M/3M/6M/1A/Total con unidad compartida, narrativa, cinco perspectivas separadas, value_fmt, op_in_12m con moneda explícita y neteo de grupo, y strength_flags observables. `verification/phase2-api.md` los listaba como fuera de la conexión; el encargo vigente los mantiene.
- Queda FUERA: banda de perspectiva/forecast (la gráfica degrada sin ella), nuevas fórmulas de bache/recuperación, recalibración del score/PSI y cierre científico M1–M5.
- El check pierde sus dos únicas referencias obsoletas (`py_test core/tests/test_treasury_kpis.py` y `py_test core/tests/test_engine_acceptance.py`). Búsqueda dirigida: esos ficheros no existen (glob sin resultados; `git log --all` sobre ambos: 0 commits) y las únicas menciones eran el propio check y el registro histórico de `phase2-api.md` (`ERROR: file or directory not found`). Pertenecen a fases que esta tanda no ejecuta; no se rebaja ningún test real ni se añade verificación nueva. Se conservan intactos `py_test core/tests/test_engine_publication.py`, `api_test temporal-engine` y `web_test temporal-diagnostics`.
- Verificación de la tanda: el check (tres comandos existentes) más el smoke HTTP del orquestador, con los puertos propios 8796 (API) / 4176 (web). La baseline de `plans/XR-033/baseline/` no se sobrescribe; el modelo publicado sigue siendo `embat-layered-v1` con `score=min(level,cap)`.
- Limpieza: espacios finales de las líneas 3–4 de `verification/phase1-scorer.md` (los marcó `git diff --check`); la evidencia no se reescribe.
