# Primitivas de gráfica de X-Ray

La fuente de verdad es [`app/web/src/charts/`](../../app/web/src/charts/). Este documento
describe lo que hay allí; si los dos discrepan, manda el código. Los colores salen todos de
[`docs/design/tokens.md`](tokens.md) (XR-002): en `src/charts/` no hay un solo hex literal, y
hay un test que lo comprueba recorriendo los ficheros.

**Los widgets importan solo de `@/charts`.** Lo que no está en `src/charts/index.ts` es
interior de la primitiva (geometría, escalas, layout de treemap) y puede cambiar sin avisar.
Sus tests lo importan por ruta directa; los widgets, nunca.

**Ninguna primitiva usa `recharts`.** Las seis son SVG y CSS propios. La regla que se mantiene
es más floja que el hecho: una primitiva *podría* usar recharts por dentro, pero nunca en su
firma. Hoy ninguna lo hace, y `migration.test.ts` fija que `recharts` no aparezca fuera de
`src/charts/`, `components/ui/chart.tsx` y los dos gráficos de la pestaña Datos.

## La regla que reconcilia el contrato visual: sin ejes, pero con unidad

`docs/dani/contrato-visual-v1.md` §4 prohíbe «gráficos sin ejes **ni unidades**». La firma
visual de Trade Republic, que copiamos a propósito, es la gráfica **sin ejes**. No son
incompatibles, porque lo que el anti-patrón persigue es una serie sin referencia numérica:

> La gráfica no lleva ejes, pero el valor **y su unidad** aparecen siempre en tres sitios: el
> tooltip al pasar por encima, la cabecera del widget que la contiene, y el `aria-label` de la
> gráfica. Además, toda primitiva que codifique magnitud en color continuo lleva una `<table>`
> visualmente oculta con todos los valores.

Así el dato nunca queda detrás del hover, que es exactamente lo que el anti-patrón evita.

Desde XR-032 hay una cuarta referencia y una aclaración: el **eje de fechas** bajo `LineNoAxes`
(etiquetas de mes, sin línea de eje: ver `time-scale.ts` más abajo) sitúa cada punto en el
tiempo, y la **burbuja ⓘ** que acompaña a cada KPI de la ficha no es una primitiva de gráfica:
es `components/ui/info-tip.tsx` y explica qué mide la cifra, no su valor; las definiciones salen
de `lib/definitions.ts`, nunca de `src/charts/`.

## Por qué el color nunca viaja solo

El validador de `dataviz` mide **ΔE 6,2 bajo deuteranopía** entre `--content-negative`
(`#ff4034`) y `--content-positive` (`#02ca50`) sobre `--surface-primary`. Eso cae en la banda
6–8, que es legal **solo con codificación secundaria obligatoria**. De ahí, y no del gusto de
nadie, salen estas cuatro reglas:

| Dónde | Codificación secundaria |
| --- | --- |
| Cualquier delta | `fmtDelta` devuelve glifo `▲`/`▼`/`—` además del color |
| `Sparkline` | `aria-label` que dice «sube», «baja» o «estable» en palabras |
| `LineNoAxes` | régimen en palabras en el tooltip y en el `aria-label`, más tabla oculta |
| `Treemap` | valor con signo como texto en el tile, y tabla oculta con todos los valores |

Reproducir la medida:

```bash
node <skill dataviz>/scripts/validate_palette.js "#02ca50,#ff4034" --mode dark --surface "#0c1230"
```

## Las seis primitivas

### `LineNoAxes`

La gráfica grande del producto: score de empresa, de grupo, salud de cartera y comparador.

| Prop | Tipo | Nota |
| --- | --- | --- |
| `series` | `{ id, points: { month, value, regime? }[], color? }[]` | `month` en `YYYY-MM`; **la timeline completa**, no la recortada al rango |
| `from` | `string` | primer mes visible; sin él se ve toda la historia |
| `axis` | `boolean` | por defecto `true`: eje de fechas de `AXIS_HEIGHT` (16 px) bajo el SVG |
| `baseline` | `{ value, label? }` | línea punteada horizontal de referencia |
| `forecast` | `{ from, points, low, high }` | `low`/`high` en paralelo a `points`, índice a índice |
| `markers` | `{ month, kind: 'cap' \| 'alert' \| 'warmup', color? }[]` | |
| `height` | `number` | por defecto 148 (`--size-chart-large`) |
| `normalize` | `boolean` | rebasa cada serie a 100 en su primer punto |
| `label` | `string` | **obligatoria**: encabeza el `aria-label` y la tabla oculta |
| `unit` | `string` | por defecto `pts` |
| `minSpan` | `number` | recorrido vertical mínimo del dominio; por defecto **10** |
| `onHover` | `(month \| null) => void` | avisa del mes apuntado; `null` al salir (150 ms) |
| `activeMonth` | `string \| null` | **controlado** cuando no es `undefined`: el crosshair sigue este mes y el puntero solo avisa por `onHover`; `null` lo apaga; un mes fuera del eje no dibuja nada |
| `tooltip` | `boolean` | por defecto `true`; con `false` hay crosshair y `onHover`, pero ningún `role="tooltip"` |

Tokens: `--regime-*` por tramo, `--chart-1` sin régimen, `--chart-2` en la banda,
`--content-disabled` en la baseline, `--alpha-white-30` en el crosshair, `--alpha-white-10`
en el corte de `from`, `--alpha-white-5` en el warm-up, `--content-secondary` en las etiquetas
del eje y `--content-tertiary` en las del horizonte.

**El eje de tiempo vive en `charts/time-scale.ts`** (aritmética pura, sin React) y se exporta:
`buildTimeScale({ history, forecast?, from? })` devuelve `axis` (toda la historia más el
horizonte), `visible` (desde `from`), `present`, `x(month)` en unidades del `viewBox` (600),
`pct(month)` y `nearest(ratio)`. Tres reglas que fija:

- **El presente cae siempre en el mismo sitio.** Con forecast, en `HISTORY_SHARE = 0,78` del
  ancho (`x = 468`), y el horizonte reparte el 22 % restante hasta el borde; sin forecast, en
  el borde derecho. Cambiar de 3M a Máx no mueve el corte: los meses visibles se estiran o
  encogen a su izquierda, como en la ficha de Trade Republic.
- **Un comando por mes del eje completo.** `d` no cambia de longitud entre rangos: los meses
  anteriores a `from` colapsan a `x = 0` con la `y` del primer punto visible (comandos
  degenerados, invisibles), y los meses fuera de un tramo repiten su extremo. Es lo que
  `transition: d` necesita para interpolar; si el número de comandos cambiara, el navegador
  saltaría a la nueva forma sin animar. Un tramo de régimen sin ningún mes visible lleva
  `stroke-opacity: 0`. Banda y centro del forecast son `<path>` con la misma transición, y
  la baseline un `<path>` de dos comandos de borde a borde. **`d` se anima por CSS; nunca en
  JS**, y `motion-reduce` la apaga. Chromium y Firefox interpolan; Safari cae al salto.
- **Ticks contados desde el último mes**, para que el presente siempre lleve etiqueta
  (`axisTicks`): `n ≤ 7` todos los meses visibles, `n ≤ 13` cada tercero, `n > 13` cada
  sexto. Con forecast, `+3` y `+6` se añaden al final en `muted`. Etiqueta `fmtMonthShort`
  (`ago 26`), `.num` en `--text-micro`, colocada por porcentaje con los extremos pegados al
  borde. **Sin línea de eje.**

El hover (`pick`) solo salta a meses visibles: nunca a uno oculto ni al horizonte. La tabla
oculta lista solo los visibles, y la escala vertical se calcula sobre ellos.

- **Sin ejes verticales, sin rejilla, sin área bajo la serie.** Línea de 2 px.
- **Un `<path>` por tramo de régimen.** El punto donde cambia el régimen pertenece a los dos
  tramos, para que la línea no se rompa.
- **La banda de outlook no se dibuja nunca sobre el pasado** y su opacidad es 0,18 como techo.
- Escala vertical: el dominio son los valores dibujados, incluida la baseline, así que la
  referencia siempre entra en el encuadre.
- **`minSpan` existe porque una gráfica sin ejes puede mentir.** Ajustando el dominio al min/max
  de los datos, un régimen `stable` que recorre 0,7 pts se dibuja ocupando los 132 px útiles: sin
  ejes, el lector no tiene forma de ver que está mirando ruido amplificado 190 veces. Con el
  suelo por defecto de 10 pts, ese vaivén ocupa un 7 % del alto y se lee plano, mientras que una
  caída de 30 pts sigue llenando la gráfica. **El 10 es una suposición sobre el dominio del score
  (0–100), no una medida**: si un widget dibuja otra magnitud, tiene que pasar su propio
  `minSpan`. Lo fija el test «a flat series stays flat instead of filling the height».
- **Sin leyenda.** Con dos o más series la pone el widget consumidor.
- **La baseline es punteada, no discontinua**: `stroke-dasharray="0 3.6"` con extremos
  redondos y 1,3 px, como la línea de referencia de Trade Republic. El guion sigue reservado
  a la proyección (`forecast-center`).
- **`tooltip={false}` solo cuando la cabecera del widget ya muestra el valor y la unidad del
  mes activo** (Investigación: el hover reescribe la cabecera y las señales vía `onHover` +
  `activeMonth`). Si nadie enseña la cifra, el tooltip se queda: es una de las tres
  posiciones donde vive la unidad de la regla de arriba.

**Cuándo NO usarla:** para una serie de 12 puntos dentro de una celda de tabla (eso es
`Sparkline`); para comparar magnitudes sin eje de tiempo (eso es una barra).

### `Sparkline`

| Prop | Tipo | Nota |
| --- | --- | --- |
| `points` | `readonly number[]` | **en la escala del dato**, no normalizados |
| `width` / `height` | `number` | por defecto 64 × 16 (`--size-sparkline-w/-h`) |
| `regime` | `Regime` | si se pasa, manda sobre el signo del Δ |
| `dot` | `boolean` | marca el último punto |

Tokens: `--content-positive/-negative/-secondary` por signo, o `--regime-*`.

Es la primitiva con más instancias (1.286 filas en el Buscador): **memoizada, sin estado, sin
`ResizeObserver` y con tamaño fijo por props**. El test lo comprueba de forma determinista
contando llamadas, no con un cronómetro.

**Cuándo NO usarla:** cuando el lector tenga que leer un valor concreto. Una sparkline dice
forma, no cifra; la cifra va en la columna de al lado.

### `RangeBar`

Las «Estadísticas clave» de Trade Republic: dónde cae un valor dentro de su rango.

| Prop | Tipo | Nota |
| --- | --- | --- |
| `min` / `max` / `value` | `number` | `value` se **recorta** a `[min, max]` |
| `labels` | `{ min: string; max: string }` | 11 px en `--content-secondary` |
| `markers` | `{ value, color }[]` | por ejemplo la mediana del universo |
| `variant` | `'plain' \| 'segmented'` | `segmented` pinta las cuatro bandas al 40 % |

Track de 6 px sobre `--surface-raised`; punto de 8 px en `--content-primary` con borde `--bg`.
`role="meter"`. Si `max === min`, el punto va al centro en vez de dividir por cero.

**Cuándo NO usarla:** para un porcentaje de un total (eso es `PillarBar`), ni como control de
entrada; hoy solo muestra, no edita.

### `PillarBar`

| Prop | Tipo | Nota |
| --- | --- | --- |
| `value` | `number` | nota `u ∈ [0,1]` en `plain`; contribución en puntos en `diverging` |
| `label` | `string` | va al `aria-label`, nunca dentro de la barra |
| `variant` | `'plain' \| 'diverging'` | |
| `maxAbs` | `number` | solo `diverging`: el máximo absoluto de **su tabla** |

`pillarTone(u)` es **la única definición de estos umbrales en el producto**: `≥ 0,6`
positivo, `0,45–0,6` alerta, `< 0,45` negativo. Nadie los repite.

Dos reglas de signo distintas, y es a propósito: `fmtDelta` aplica un suelo de ruido de
**0,5 pts** porque un delta de score por debajo de eso no es movimiento; la variante
`diverging` **no** lo aplica, porque una contribución se escala contra el máximo de su propia
tabla y ahí 0,3 pts sí puede ser la tercera contribución más grande.

**Cuándo NO usarla:** nunca metas el valor dentro de la barra; el texto va fuera.

### `TreemapLayout` + `Treemap`

`TreemapLayout` es aritmética pura, sin JSX y sin React: `layout(items, {width, height, ratio})`
y `layoutGrouped(groups, {width, height, headerHeight})`. Algoritmo **squarified** (Bruls,
Huizing & van Wijk, 2000), sin dependencia externa. Es **determinista**: desempata por `id` con
un comparador explícito, no confía en la estabilidad del `sort` del motor. `size` 0, negativo,
`NaN` o infinito cuenta como 0.

`Treemap` pinta ese layout con `--treemap-pos-1..4` / `--treemap-neg-1..4` según la magnitud
de `color_value` en cuatro tramos (`intensityStep`). Teclado: tiles focusables en orden de
tamaño descendente, Enter/Space seleccionan.

**Etiquetas como el heatmap de Trade Republic** (`treemap-label.ts`, aritmética pura): el
`name` (o el `id` si no hay) en negrita, arriba a la izquierda, con cuerpo por área del tile
(`tileFontSize`: `--text-tile` desde 20 000 px², `--text-body` desde 8 000, `--text-micro` por
debajo) y el valor `.num` debajo. `showsLabel` decide nombre y valor desde 2,4 cuerpos de alto,
solo el nombre desde 1,3, y nada por debajo o si no caben dos caracteres de ancho: el dato
sigue en el `aria-label` y en la tabla oculta, ambos por `name`. El nombre se corta con «…»
al ancho útil (`truncateLabel`, 0,56 em por carácter) y el valor se omite si no cabe; nunca
`overflow: hidden`.

`unit` es `pct`, `pts` o `delta`. Con `delta` el tile muestra `fmtDelta` **sin unidad**
(`▲ +1,3`) en el tono del signo; el `aria-label` y la tabla llevan la unidad. Cada grupo puede
traer `label` (título de la banda, truncado; el nombre manda) y `delta: number | null`
(`▲/▼ Δ` `.num` micro a su lado si cabe; «Sin Δ» si es `null`, nunca 0 imputado).

Dos cosas que parecen decoración y no lo son:

- **La separación de 1 px en `--bg` entre tiles.** Sin ella, un tile del escalón 1 no se
  distingue del fondo: el validador lo mide a 1,16:1, por debajo del suelo de 2:1.
- **La tabla visualmente oculta.** El treemap codifica magnitud en color continuo, y una escala
  continua sin vista de tabla es un anti-patrón de accesibilidad.

`currency` **no tiene valor por defecto**: sin moneda el tamaño sale como cifra pelada. Un
treemap cuyo tamaño es un recuento no puede inventarse un `EUR`.

**Cuándo NO usarlo:** con menos de ~10 items (una barra ordenada se lee mejor), o cuando el
lector tenga que comparar dos tiles con precisión: el área es mala para eso.

### `ChartTooltip`

Un solo tooltip para todas las gráficas. `--surface-tooltip`, radio `--radius-control`, padding
8, `z-index: var(--z-tooltip)`. **Sin flecha y sin sombra difusa** (contrato visual §4).

| Prop | Tipo | Nota |
| --- | --- | --- |
| `month` | `string` | `YYYY-MM`; la cabecera lo formatea a `MM/YYYY` |
| `rows` | `{ label, value, color? }[]` | **una fila por serie**, siempre todas |
| `x` | `number` | porcentaje 0..100; vuelca el anclaje por encima de 80 |

- **El valor manda** (`--content-primary`, peso 600) y la etiqueta va detrás: es la jerarquía
  de la leyenda invertida, porque aquí el lector ya sabe qué serie es y lo que quiere es la cifra.
- **Clave de serie como trazo corto, nunca una caja rellena**: a esta densidad una caja es tinta
  con peso de dato haciendo el trabajo de una etiqueta.
- Los textos entran como hijos de React, que escapan. Nunca `dangerouslySetInnerHTML`: los
  nombres de serie vienen de datos.

## Formateadores

`src/charts/format.ts` es la única fuente de formato de dominio, y se exporta también a los
widgets. Reutiliza `src/lib/format.ts` y añade encima tres reglas tipográficas: coma decimal y
millares con punto, **signo menos U+2212** (nunca el guion ASCII) y **espacio fino U+2009**
antes de la unidad.

| Función | Salida |
| --- | --- |
| `fmtPoints(47.3)` | `47,3 pts` |
| `fmtDelta(2.4)` | `{ text: '▲ +2,4 pts', glyph: '▲', tone: 'var(--content-positive)', sign: 1 }` |
| `fmtDelta(0.2)` | neutro: `— 0,2 pts`, `var(--content-secondary)` |
| `fmtPct(3.9)` | `+3,9 %` |
| `fmtU(0.7)` | `0,70` |
| `fmtMonth('2026-06')` | `06/2026` |
| `fmtMonthLong('2026-06')` | `junio de 2026` |
| `fmtMonthShort('2026-08')` | `ago 26` (etiqueta del eje; minúscula, sin punto) |
| `fmtSize(32477.26, 'EUR')` | `EUR 32.477,26` |
| `fmtSizeShort(26233293.89, 'EUR')` | `EUR 26,2 M` (`EUR 485 k`, `EUR 950`) |
| `fmtSignedPoints(0.2)` | `{ text: '+0,2 pts', tone: 'var(--content-positive)', sign: 1 }`; bajo 0,05 pts, `0,0 pts` sin signo y secundario |
| `fmtConfidence(0.81)` | `81 %` |

`fmtDelta` es la única función que decide **signo, color y glifo** a la vez, y la única que
conoce el umbral de neutro de 0,5 pts. `tone` sale ya como `var(--x)`, listo para un `style`:
devolver el nombre pelado sería una trampa, porque CSS ignora `color: "--content-positive"` en
silencio, sin error.

## Paleta

`src/charts/palette.ts` lee `index.css` en crudo y devuelve `var(--x)` tipado. Si XR-002
renombra un token, las primitivas fallan al instante en vez de pintar un `var()` vacío.

`regimeToken` cubre los **siete** regímenes del motor, no los seis con token propio:
`shock_pending` comparte color con `blip`, porque es exactamente un bache todavía sin confirmar
(`docs/alfonso/ENGINE-EMBAT.md` §6.2). Si algún día merece color propio, el sitio es XR-002.

## Catálogo vivo

La sección «Gráficas» de la ruta `/tokens` (solo desarrollo) pinta todas las variantes sobre
datos fijos. Es la referencia visual para los tickets siguientes y la superficie de captura para
la evidencia.
