---
feature: XR-012
depends_on: [XR-002]
parallel: true
conflicts_with: []
lane: amplio
verify: evals/checks/XR-012.sh
max_attempts: 3
---
# Spec: XR-012

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-012: <item>") y termina la pasada.

## 1. Objetivo

`app/web/src/charts/` contiene seis primitivas de grafica (`LineNoAxes`, `Sparkline`,
`RangeBar`, `PillarBar`, `TreemapLayout`+`Treemap`, `ChartTooltip`) mas `format.ts` y
`palette.ts`, todas alimentadas solo por los tokens `--chart-*`, `--regime-*`, `--band-*`
y `--treemap-*` de XR-002, con catalogo vivo en `/tokens` y ningun componente fuera de
`src/charts/` dibujando SVG de serie ni importando recharts.

## 2. Comportamiento (escenarios verificables)

- DADO un valor numerico de dominio CUANDO se formatea con `fmtPoints`, `fmtDelta`,
  `fmtPct`, `fmtU`, `fmtMonth`, `fmtMonthLong` o `fmtSize` ENTONCES sale con coma decimal,
  millares con punto, signo menos U+2212 (nunca guion), espacio fino antes de la unidad, y
  `fmtDelta` devuelve glifo (`▲`/`▼`/`—`) y token de color aplicando el umbral de neutro
  |Δ| < 0,5.   # -> web_test charts/format
- DADO `src/index.css` CUANDO `palette.ts` expone los tokens que consumen las primitivas
  ENTONCES todos existen en la hoja, `regimeToken` cubre los seis regimenes, `bandToken`
  las cuatro bandas, `treemapToken` los ocho escalones y ningun fichero de `src/charts/`
  contiene un hex literal.   # -> web_test charts/palette
- DADO una serie de puntos CUANDO se renderiza `Sparkline` ENTONCES mide 64x16 por
  defecto, colorea por el signo del Δ con umbral de neutro 0,5, expone un `aria-label` que
  nombra la direccion en palabras (codificacion secundaria obligatoria por `dataviz`), es
  un componente memoizado sin estado y 500 instancias montan dentro del presupuesto.
  # -> web_test Sparkline
- DADO `min`, `max` y `value` CUANDO se renderiza `RangeBar` ENTONCES el punto se posiciona
  proporcionalmente, los valores fuera de rango se recortan a los extremos, y la variante
  `segmented` pinta los cuatro tokens de banda.   # -> web_test RangeBar
- DADO una nota `u ∈ [0,1]` CUANDO se renderiza `PillarBar` ENTONCES `pillarTone` mapea
  0,7/0,5/0,3 a positivo/alerta/negativo, la variante `diverging` centra el cero y escala
  por el maximo absoluto de la tabla, y nunca hay texto dentro de la barra.
  # -> web_test PillarBar
- DADO series, baseline, forecast y markers CUANDO se renderiza `LineNoAxes` ENTONCES no
  hay ejes ni rejilla ni area bajo la serie, hay un `path` por tramo de regimen con su
  token, la baseline va punteada en el primer punto del rango, la banda de outlook se
  dibuja solo hacia delante desde `from` y con opacidad <= 0,18, `normalize` rebasa cada
  serie a 100 en el primer punto, los marcadores `cap`/`alert`/`warmup` aparecen, el hover
  muestra la linea vertical y el tooltip, y el componente expone `aria-label` de resumen
  mas una tabla visualmente oculta.   # -> web_test LineNoAxes
- DADO un mes, un valor y una etiqueta secundaria CUANDO se renderiza `ChartTooltip`
  ENTONCES el mes sale `MM/YYYY`, el valor lleva su unidad, cada fila lleva la clave de
  serie como trazo (no caja) y los nombres se insertan como texto, nunca como HTML.
  # -> web_test ChartTooltip
- DADO una lista de items con tamano CUANDO se calcula `TreemapLayout` ENTONCES el layout
  squarified llena el rectangulo exacto y es determinista, los grupos se colocan por suma
  de tamanos antes que sus items, y `Treemap` usa cuatro escalones de intensidad, oculta
  la etiqueta bajo el umbral de tamano y expone una tabla visualmente oculta con todos los
  valores.   # -> web_test Treemap
- DADO el arbol `app/web/src` CUANDO se busca `recharts` ENTONCES solo aparece en
  `src/charts/`, en `components/ui/chart.tsx` y en los dos graficos de Dani
  (`activity-chart.tsx`, `invoice-chart.tsx`), y la superficie publica `src/charts/index.ts`
  exporta las seis primitivas mas los formateadores sin reexportar recharts.
  # -> web_test migration

## 3. Fuera de alcance

- Ningun widget nuevo. No se crean `widgets/`, rutas nuevas ni pantallas.
- No se toca `app/api`, `datasets_mocked/`, el contrato de datos ni `evals/`.
- No se instala ninguna dependencia nueva (ni de graficas ni de posicionamiento).
- No se toca `components/ui/chart.tsx` (wrapper legado de shadcn) ni
  `components/activity-chart.tsx` ni `components/invoice-chart.tsx`: viven en la pestana
  Datos y son de otro dominio. Se anota como deuda en `features/NOTES.md`.
- No se cambia `src/index.css`: la paleta la fija XR-002 y este ticket la consume. Los
  FAIL medidos con el validador de `dataviz` sobre la rampa de treemap y sobre los tonos
  de pilar se anotan como hallazgo, no se arreglan aqui.
- No se migra `ScoreChart` ni las sparklines del Buscador: XR-003 y XR-004 no estan en
  `main`. El paso 7 del plan se reduce a dejar la primitiva lista y a fijar por test la
  regla de contencion de recharts.
- No se anade leyenda dentro de las primitivas: con dos o mas series la leyenda la pone el
  widget consumidor. Se documenta en `docs/design/charts.md`.

## 4. Verificacion
- [ ] bash evals/smoke.sh          → exit 0
- [ ] bash evals/checks/XR-012.sh  → exit 0   # nacio en rojo sobre main
- [ ] captura de la seccion «Graficas» de `/tokens` en plans/XR-012-chart-primitives/evidence/

Esta seccion puede incluir lineas web_test / api_test / py_test: en backend y en
logica de front, el test va primero y el test que FALLA es el check rojo. Escribe
la linea del test antes que el codigo, no despues.

## 5. Prioridades (de arriba abajo)
1. `src/charts/format.ts` + `format.test.ts`: coma decimal, U+2212, espacio fino,
   `fmtDelta` con glifo, token de color y umbral de neutro 0,5.
2. `src/charts/palette.ts` + `palette.test.ts`: tokens tipados leidos de `index.css`,
   sin hex literal en `src/charts/`.
3. `src/charts/Sparkline.tsx` + test: 64x16, color por signo, `aria-label` con la
   direccion, memoizado, presupuesto de 500 instancias.
4. `src/charts/RangeBar.tsx` + test: punto proporcional, recorte, variante `segmented`.
5. `src/charts/PillarBar.tsx` + test: `pillarTone`, variante `diverging`.
6. `src/charts/ChartTooltip.tsx` + test: `MM/YYYY`, valor con unidad, clave de trazo,
   nombres como texto.
7. `src/charts/LineNoAxes.tsx` + test: tramos por regimen, baseline punteada, banda solo
   hacia delante con opacidad <= 0,18, `normalize`, marcadores, hover, a11y.
8. `src/charts/TreemapLayout.ts` + `Treemap.tsx` + tests: squarified exacto y
   determinista, grupos primero, cuatro escalones, umbral de etiqueta, tabla oculta.
9. `src/charts/index.ts` + `migration.test.ts`: superficie publica y contencion de
   recharts.
10. Seccion «Graficas» en `src/routes/tokens.tsx` y `docs/design/charts.md`.

## 6. Desviaciones anotadas (manda `dataviz`, plan §9)

- **CVD verde/rojo.** `node scripts/validate_palette.js "#02ca50,#ff4034,..." --mode dark
  --surface "#0c1230"` da ΔE 6,2 (deutan) para `#ff4034`↔`#02ca50`: banda 6–8, legal SOLO
  con codificacion secundaria obligatoria. De ahi tres reglas que el plan no pedia
  explicitamente: `Sparkline` expone la direccion en palabras en su `aria-label`;
  `Treemap` lleva tabla visualmente oculta (el plan solo la pedia en `LineNoAxes`); el
  signo viaja siempre en el glifo de `fmtDelta`, nunca solo en el color.
- **Marcadores de 4 px.** `dataviz` pide marca >= 8 px. Se concilia con el anillo de 2 px
  en color de superficie que el propio `dataviz` exige sobre marcas superpuestas: punto de
  4 px + anillo de 2 px = 8 px de diametro exterior. La interaccion no pasa por el punto
  sino por el crosshair, asi que no hace falta diana de 24 px.
- **Baseline y linea central punteadas.** `dataviz` prohibe rejilla punteada, pero aqui no
  son rejilla: son referencia y proyeccion, los dos casos que el propio `dataviz` reserva
  al guion. Se mantienen punteadas.
- **Rampa de treemap.** `--treemap-*-1` compuesto sobre `--surface-primary` da 1,16:1
  (pos) y 1,09:1 (neg), bajo el suelo de 2:1, y ΔL 1→2 de 0,056 < 0,06. No se corrige aqui
  (la paleta es de XR-002): se mitiga con separacion de 1 px en color de superficie entre
  tiles y con el valor como texto, y se anota en `features/NOTES.md` para XR-002/XR-008.
- **Tonos de pilar.** Los cinco `--chart-pillar-*` fallan el suelo de vision normal
  (ΔE 8,6 < 15 entre `--tone-orange` y `--tone-yellow`). XR-012 no los consume: `PillarBar`
  colorea por tramo, no por identidad de pilar. Se anota para XR-004.
- **Linea del check que el plan §7 omite.** El plan §5 y §6 exigen tests de `ChartTooltip`
  pero §7 no lista su linea. El check lleva nueve lineas, no ocho.
