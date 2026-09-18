# NOTES — heartbeat del loop

Cada pasada de queue-run añade aqui una entrada con timestamp y la tabla actual
de TASKQUEUE.md. Es el latido: si esto no crece, el loop esta parado.

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
- El paso 7 del plan (migrar `ScoreChart` y las sparklines del Buscador) **no se hizo porque
  XR-003 y XR-004 no están en `main`**. Lo único migrable hoy era la sparkline dibujada a mano de
  `/tokens`, y está migrada. Cuando XR-004 entre, su criterio es que sus tests pasen sin editarlos.
