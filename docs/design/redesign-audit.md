# Auditoría comparada: Trade Republic web (oscuro) frente a X-Ray (XR-030)

Fecha: 19/09/2026. Fuentes: `plans/00-reference/trade-republic-tokens.md` (DOM medido el 19/09),
`plans/00-reference/trade-republic-ui-analysis.md` (capturas del 18/09), medidas en vivo de esta
sesión sobre `app.traderepublic.com` a 1440×900 (`plans/XR-030-tr-redesign/evidence/measures-tr.txt`)
y lectura del código de `app/web/src`. Cuando dos fuentes discrepan manda el DOM medido.

Capturas: `plans/XR-030-tr-redesign/evidence/00-dashboard-local.png` (X-Ray antes),
`00-tokens-local.png`, y los pares `NN-<vista>-<tr|local>.png` de cada iteración. Las capturas
de Trade Republic no se pueden guardar a disco desde el navegador integrado (la extensión de
Chrome no está conectada): quedan en el chat de la sesión y sus números en `measures-tr.txt`.

## 1. Tabla por componente

| Componente | Trade Republic (medido) | X-Ray hoy | Decisión XR-030 |
|---|---|---|---|
| Fondo de página | `body #181613` (negro cálido), `html #000`. En el tablero **no hay orbe**: `canvas.spotlightCursor` fijo con `z-index: -1` y alfa 0 en todos los píxeles; el foco difuminado cálido solo existe en la pantalla de login: `radial-gradient(56% 34% at 56% 52%, rgba(255,217,173,.2), rgba(24,22,19,.2) 150%)` estático sobre la sección de login (sin animación ni blur propio; el tablero de detrás lleva `filter: blur(12px)`), más un `canvas.spotlightCursor` que sigue al puntero. | `--bg: var(--navy-950)` = `#070b1f`, plano. | Navy **más oscuro**: `--navy-1000` como fondo (candidatos medidos `#04071a` · `#030614` · `#02040e`; los tres mantienen AA: gris secundario ≥ 6,7:1, rojo ≥ 5,7:1, verde ≥ 9:1). El orbe se trae del login a la página como capa CSS pura (`radial-gradient` + `blur`, deriva lenta, `transform`/`opacity`, apagado bajo `prefers-reduced-motion`). Tres variantes en `/prototypes/background` para que Alfonso elija. |
| Superficie de widget | `widget-container`: `linear-gradient(rgba(0,0,0,.4) 0%, rgba(0,0,0,.4) 17.25%)`, radio 8, padding `0 16 16`, **sin borde, sin sombra, sin `backdrop-filter`**. | `--surface-widget: linear-gradient(180deg, alpha-white-5, alpha-black-30)`, radio 8, borde `--border-primary` solo en hover/focus. | Superficie **glass** (decisión de Alfonso, desviación deliberada de Trade Republic): `--surface-glass` (blanco al 4,5 %), `--border-glass` (blanco al 7 % como `box-shadow inset` de 1 px), `--blur-glass: 16px` (el `weak` de su escala). Radio 8 y padding `0 16 16` se copian. |
| Topbar | `header.pageHeader` 60 px, padding 16, transparente. Pestañas 14 px / 680, activa `#fff`, inactiva `#4a4c4f`, sin fondo. Chips 28 px `rgba(32,32,32,.6)` + `blur(8px)`. Avatar 28 px. | 60 px con borde inferior, pestañas de espacio reordenables, chips de salud (rotos contra la API real: `limit: 2000` > 500), menú de presets, avatar 28. | 60 px sin pestañas: marca, buscador global (input 32 px glass), indicador discreto `Mock v1 · corte 08/2026` (reutiliza `formatCutoff`), avatar. Fuera: pestañas, chips de salud, presets, banner amarillo. |
| Tabla (Research) | Cabecera 26 px, fila **28 px**, celda `padding 0 16 0 0`, 13 px / 400, gap 8; sparkline 64×16; skeleton `rgba(32,32,32,.6)` radio 6 al 25 %; hover de fila sin fondo (solo aparece la acción); cifras alineadas a la derecha. | Cabecera 26, fila 24 (`--size-table-row`), 12 px, pills a mano, virtualizada, banda vacía (`BAND_LABEL["solid"]` → `undefined`), sin flechas de teclado. | Fila **28 px** (`--size-table-row` pasa de 24 a 28), cabecera 26, 12 px en celdas y 13 px en el nombre; sparkline de `@/charts`; banda con los valores reales; teclado ↑/↓ + Enter; hover revela «Comparar». |
| Ficha de instrumento | `widgetTitle` h1 14 px / 600, padding 16 0; precio grande con variación y Bid/Ask; tabs `rgba(32,32,32,.6)` + `blur(16px)` 26 px; rango como texto plano 10–12 px / 580, activo blanco, inactivo `#4a4c4f`; gráfica stroke 2,33 px; línea base `#4a4c4f` 1,3 px `dasharray 0 3.6`; «Estadísticas clave» con `range` 26 px. | No existe ficha v2: `ScoreCard` con nombre, score, Δ, régimen, sparkline (rota: `company.sparkline_12` no existe en la API). | Panel Investigación: cabecera score 20 px / 600 + Δ con glifo + régimen + banda; `LineNoAxes` con banda de outlook hacia delante (`outlook.low/high` como Bid/Ask); rango como texto (`3M 6M 1A Máx`); `PillarBar` ×5; drivers (`value_fmt`, contribución); última alerta; titular de la narrativa. |
| Controles | Botón 26–32 px, radio 6, `rgba(32,32,32,.6)` + `blur(16px)`; `menu-trigger-pill` 26 px padding 0 8 texto `#4a4c4f`; icon-button 24 radio 6. | Pills 32 px con borde `--border-primary`, menús `div role=menu` a mano. | Pills y botones **glass** 32 px (`--surface-glass` + `--blur-glass`), radio 6, texto secundario; se conservan los menús a mano (frágil Radix en jsdom). |
| Tipografía | TradeRepublicSans; 13 px / 400 cuerpo, controles 12 (10 con UI scale pequeño), títulos 14 / 600, pestañas 14 / 680; lh 19,5 (cuerpo) y 14–18 (controles); ls 0,1 px en controles. | Geist Variable / Geist Mono; escala 11/12/13/18/20; pesos 400/500/600. | Sin cambios de familia. Título de panel 14 px / 600 (no 18: Trade Republic usa 14). Se añade `--text-panel-title: 14px`. |
| Color | `#fff` / `#4a4c4f` (secundario) / `#02ca50` / `#ff4034` / `#ff9500`. | Mismos verde, rojo y naranja; secundario `#93969a` (gray-4) por contraste. | Sin cambios de semáforo. El gris `#4a4c4f` se queda como `--content-disabled`; el secundario sigue en gray-4 (6,7:1 sobre navy-1000). |
| Motion | Duraciones 150/200, easings enter/exit/fade; keyframes reales: `pulse` (radar de sparkline, 2 s, `cubic-bezier(0,.5,.1,1)`), `widgetStackEnterMorph` (opacity 0→1 + translate 50 px→0), `portfolioPositionListItemFadeIn` (opacity 0→1 + translateY 6 px→0), `shimmer`. | Tokens declarados; solo `Canvas` y `LineNoAxes` respetan `motion-reduce`; sin regla global de `prefers-reduced-motion`. | Entrada de panel (opacity + translateY 6 px, 200 ms `--ease-enter`), cross-fade de 200 ms al cambiar de empresa, popovers 200/150, hover 150. Regla global `@media (prefers-reduced-motion: reduce)` en `index.css`. Orbe exento de los 250 ms por ser ambiente (40–60 s), y apagado bajo reduced-motion. |

## 2. Deriva cliente ↔ contrato v2 (bloqueante para los paneles)

`app/web/src/lib/api-v2.ts` y `src/test/fixtures/v2/*` se escribieron antes que la API y no se
sincronizaron. Contra `docs/api/examples/*.json`:

| Campo | Cliente | API real | Efecto hoy |
|---|---|---|---|
| `Band` | `A\|B\|C\|D` | `solid\|healthy\|watch\|stress` | Columna Banda vacía; filtro envía `band=A` → `400`. |
| `UniverseItem` | sin `branch`, `op_in_12m` | los trae | Tipo incompleto. |
| `CompanyV2.company` | `UniverseItem` | fila de `companies.csv` sin `sparkline_12` | `ScoreCard` lanza `TypeError`. |
| `Driver` | `name` | `value_fmt`, `rank`, `direction`, `value`; sin `name` | Drivers vacíos. |
| `penalty` | `number` | `{points, weakest_pillar}` | `[object Object]`. |
| `narrative` | `string` | `{headline, body, watch_next, guardrail_passed}` | `[object Object]`. |
| `alert` | `boolean` | fila de `alerts.csv` o `null` | Sin severidad ni mensaje. |
| `cap` | `number\|null` | `{code, value}\|null` | Techo ilegible. |
| `audit` | `inputs: string[]` | sin `inputs`; `data_kind`, `seed`… | `TypeError`. |
| `MetaV2` | sin `cutoff_date`, `window` | los trae | Indicador de corte sin fuente directa. |
| `getUniverse({limit: 2000})` | — | `limit` ≤ 500 | Chips de la topbar siempre en `—`. |

Decisión: se alinean tipos, fixtures y `regime.ts` con los ejemplos, y un test los contrasta
contra `docs/api/examples/*.json` para que la deriva no vuelva en silencio.

## 3. Qué se retira, qué se reutiliza

**Se retira (huérfano al quitar el lienzo):** `dashboard/Canvas`, `store`, `WidgetCatalog`,
`grid`, `types`, `Topbar` (espacios y presets), `MockBanner` (se convierte en indicador),
`widgets/WidgetFrame`, `EntityPicker`, `registry`, `register-all`, `widgets/Sparkline`,
`score-card`, `screener` como widget, `lib/portfolio-health`, y sus tests. Ninguna otra ruta
(`company`, `portfolio`, `monitor`, `tokens`) los importa.

**Se reutiliza:** de `Screener` el estado de consulta, `FilterPill`, `SortableHeader`, el
virtualizador y la paginación; de `@/charts` `LineNoAxes` (`normalize`, `forecast`, `markers`),
`Sparkline` memoizada, `PillarBar`, `ChartTooltip`, `fmtDelta`/`fmtPoints`/`fmtPct`;
`components/states`; `regime.ts` (etiquetas y colores de régimen); `formatCutoff`.

**Se queda fuera de la navegación:** `/tokens` (catálogo de desarrollo, `import.meta.env.DEV`).
La leyenda de colores (sección de paleta del catálogo) no aparece en ninguna superficie de producto.

## 4. Auditoría UX (checklist `ui-ux-pro-max`, prioridades 1→7)

| # | Hallazgo | Severidad | Dónde |
|---|---|---|---|
| 1 | Contraste: los pares medidos cumplen AA; falta medir los nuevos tokens glass (se hace en `design/tokens.test.ts`). | media | `docs/design/tokens.md` §Contraste |
| 2 | Foco visible presente en todos los controles. | ok | `focus-visible:ring-2` en toda la app |
| 3 | Tabla sin navegación ↑/↓; solo Tab + Enter. | media | `widgets/screener/Screener.tsx:419-432` |
| 4 | No existe estado «historia insuficiente» (`warmup`) en ningún widget. | media | `Screener`, `ScoreCard` |
| 5 | `prefers-reduced-motion` solo en `Canvas` y `LineNoAxes`; `Topbar`, `WidgetFrame`, `Screener` animan color sin la regla. | baja | ver §1 Motion |
| 6 | Ruido que no aporta al MVP: catálogo, selector de entidad por widget, punto de vínculo, kebab, maximizar, resize, drag, presets, pestañas, chips de salud, banner amarillo. | alta | `Canvas`, `WidgetFrame`, `Topbar`, `MockBanner` |
| 7 | Sin color literal fuera de `index.css` (única coincidencia: selector de atributo en `ui/chart.tsx`, excluido por el test). | ok | `design/tokens.test.ts` |

## 5. Riesgos aceptados

- Glass sobre navy es una desviación deliberada de Trade Republic (sus widgets no llevan
  `backdrop-filter`; sus controles sí). Se acepta porque lo fija Alfonso.
- El gris de control de Trade Republic (`rgba(32,32,32,.6)`) es neutro; sobre navy se lee sucio.
  Los tokens glass usan blanco translúcido en su lugar.
- `backdrop-filter` sobre una tabla virtualizada de 200 filas: se aplica al panel, nunca a las
  filas, y el orbe vive en una capa `contain: strict` para que el blur no se recalcule al scroll.

## 6. Motion: qué anima, qué no, y cómo se llama

Puerta de `design-find-animations` (frecuencia → propósito → velocidad → función) sobre el código
final. Vocabulario de `design-animation-vocabulary` entre paréntesis.

| Momento | Decisión | Receta |
|---|---|---|
| Carga de la página | Sí, una vez por sesión (*Stagger* + *Fade in*) | `animate-panel-enter`: opacity 0→1 y `translateY(6px)`→0, 200 ms `--ease-enter`, 40 ms de escalón por panel |
| Cambio de empresa en Investigación | Sí, decenas al día pero es un cambio de contenido completo (*Crossfade* con *Blur*) | `animate-crossfade` por `key={id}`: opacity 0→1 y `blur(2px)`→0, 200 ms `--ease-fade` |
| Menú de una pill | Sí, ocasional (*Origin-aware* *Scale in*) | `animate-menu-enter`: opacity 0→1 y `scale(.97)`→1, 150 ms `--ease-enter`, `transform-origin` en el disparador |
| Pulsar cualquier botón | Sí (*Press feedback*) | `active:scale(.97)` con transición de `transform` 150 ms; hover solo con `@media (hover: hover)` |
| Aparición de «Comparar» en la fila | Sí, sutil (*Hover effect*) | `transition-opacity` 150 ms; con la empresa en comparación se queda visible |
| Leyenda de Comparativa al añadir una empresa | Sí, ocasional (*Fade in*) | `animate-crossfade` por item |
| Fondo | Sí, ambiente (*Float* / *Idle animation*) | `orb-drift` 48 s `ease-in-out` alternate, solo `transform`; apagado bajo `prefers-reduced-motion` |
| Foco con ↑/↓ en la tabla | **No**: acción de teclado repetida cientos de veces | Cambio instantáneo |
| Ordenar, filtrar, paginar | **No**: datos que se leen | Reemplazo directo (`keepPreviousData`) |
| Cifras del score | **No**: una cifra que interpola miente 200 ms | Sin *Number ticker* |
| Dibujar la línea de la gráfica | **No**: dato funcional | Sin *Line drawing* |

`prefers-reduced-motion`: el orbe se para, las entradas se apagan (`motion-reduce:animate-none`) y
solo quedan las transiciones de color y opacidad. Revisión final con `design-review-animations`:
la invoca Alfonso (skill reservada a invocación humana).

## 7. Accesibilidad (Web Interface Guidelines, 19/09)

Corregido en la pasada 8b: foco visible en los dos buscadores (anillo en el contenedor glass), el
menú de las pills devuelve el foco al disparador y se recorre con ↑/↓/Home/End, todos los objetivos
de escritorio a ≥ 24 px, separadores de la ficha en `--content-secondary` (los `--content-tertiary`
medían 3,4:1 sobre glass), `title` en los truncados de leyenda y alerta, y una fila siempre
enfocable tras el scroll virtual. Pendiente y fuera de alcance: el botón «Menú de perfil» no tiene
menú todavía (llega con XR-018); la marca «X-Ray» no es `h1`.

## 8. XR-031 · reversión consciente y decisiones

Fecha: 19/09/2026. Fuentes: `plans/XR-031-dashboards-research/PLAN.md` §0 (decisiones de
Alfonso, chat del 19/09), `plans/XR-031-dashboards-research/evidence/measures-tr.txt` (medidas en
vivo sobre `app.traderepublic.com` a 1440×900, solo lectura) y el código de `app/web/src` tal como
queda. Las §1–§7 se conservan como estaban: describen XR-030 y siguen siendo el punto de partida.

### 8.1 Qué retiró XR-030 y qué trae de vuelta XR-031

XR-030 dejó `/` como una sola página con tres paneles fijos y retiró lienzo, registro, catálogo,
pestañas y marco con acciones (§3, hallazgo 6 de §4). Alfonso revisó el resultado en local y contra
Trade Republic y fijó una segunda iteración:

| Tema | Decisión de Alfonso | Efecto sobre XR-030 |
|---|---|---|
| Tableros | Principal **fijo** (una sola pestaña por defecto) y tableros propios con **máximo 4 widgets** elegidos desde un botón arriba a la derecha, como en Trade Republic; catálogo de **6** (Empresas, Investigación, Comparativa, Alertas, Mapa, Grupo); drag por cabecera y resize por esquina sobre 24 columnas. | **Vuelven** `Grid` (el `Canvas` histórico), `store`/`types`/`grid-math`, `registry`/`register-all`/`WidgetCatalog`, `WidgetFrame` y las pestañas. `Panel.tsx` se borra. |
| Empresas | Mitad izquierda a toda altura; **por grupos** con triángulo de desglose; paginación por el alto; columnas repensadas: quitar ruido, añadir métricas que llamen la atención. | Fuera Id, Grupo, Banda y «Comparar»; dentro punto de banda, `n`, Confianza, punto de alerta, Operativa 12 m. |
| Investigación | Arriba a la derecha. Cabecera con **solo** nombre + score + Δ + confianza; rango como **toggle liquid glass**; toggle de familias con **todos** los KPIs de la familia; documento de metodología siempre visible. | Desaparecen «Pilares del score», «Qué se movió», outlook en cabecera y titular. Llegan `Segmented`, `FamilyStats`, `Methodology`. |
| Comparativa | Dos empresas en la misma gráfica; clic en el nombre abre un popup de búsqueda. | `toggleCompare`/`MAX_COMPARE` (hasta 5) → dos slots A/B con `CompanyPicker`. |
| Hover en gráficas | Como Trade Republic: la cabecera cambia al valor del punto. | `LineNoAxes` gana `activeMonth` y `tooltip`; Investigación sin tooltip, Comparativa lo conserva. |
| Fondo | Más profundo y más azul: `#020a24`; el orbe se conserva y además un foco sigue al puntero. | `--navy-1000` pasa de `#04071a` a `#020a24`; `--orb-1` a `--blue-700`; `.spotlight` nuevo. |
| Hover con escala | Solo en controles y tarjetas internas: 1,02 en 150 ms bajo `hover:hover`. Nunca en widgets ni en filas. | Regla 9 de `widgets.md` §8. |
| API | Sí, dos cambios de mapeo con test: `series_24m` enriquecido y `/meta` con `reference` + `params`. | `app/api/src/v2/params.ts` nuevo; tres mappers. |
| Craft general | Menos textos, colores revisados, glass más limpio, micro-animaciones al estilo Trade Republic. | Sin banner de mock ni leyenda de colores; copy recortado. |

La reversión es consciente y se justifica en una frase: **Principal fijo hace opcional la
complejidad**. El tablero que abre `/` sigue siendo el MVP de tres paneles; el lienzo, el
catálogo y las pestañas solo los paga quien crea un tablero propio. Lo que no vuelve (grupos de
vínculo por color, `EntityPicker` por widget, presets, chips, banner) está en `widgets.md` §9.

### 8.2 Medidas de Trade Republic de esta sesión

| Qué | Trade Republic (medido) | X-Ray (XR-031) |
|---|---|---|
| Toggle glass de la ficha (`Resumen · Estadísticas · …`) | `role="tablist"`, activo `rgba(32,32,32,.6)` + `backdrop-filter: blur(16px)`, **26 px**, radio 6, padding `0 8`, 10–12 px / 580, inactivo `#4a4c4f`, transición `color/background .2s` | `Segmented`: 26 px (`--size-segment-sm`), radio 6, items 12 px / 580, indicador `--surface-glass-hover` + `blur(16px)` que se desliza, contenedor `--surface-glass` |
| Rango `1D 1S 1M 1A Máx` | `role="radiogroup"`/`radio`, texto plano, activo blanco, sin fondo | mismo rol, pero dentro del `Segmented` glass (decisión de Alfonso: toggle liquid glass) |
| Pestañas de tablero | `role="tab"` **14 px / 680**, activa `#fff`, inactiva `#4a4c4f`, `transition: color .2s`, «drag to reorder» | 14 px / 600 (no hay 680 en la escala), activa `--content-primary`, inactiva secundaria, 32 px de alto; sin reordenar |
| «Añadir página» | **24 × 24**, `transition: transform .2s cubic-bezier(0,0,.58,1), box-shadow .2s` | 24 × 24, `transition-transform` 200 ms, hover 1,10, pulsación 0,97 |
| Cabecera de widget | `Ajustes` 24 × 24, `Maximizar widget` y `Menú del widget` 14 × 14, título 14 / 600 | cabecera 32 px, título 14 / 600, botones 24 × 24 con icono de 14 |
| Hover en la gráfica | **la cabecera cambia al valor del punto** (304,45 € ▲0,91 % → 305,85 € ▲1,36 %), línea vertical, base punteada `#4a4c4f · 1.3 · dasharray 0 3.6`, sin tooltip | cabecera 96,3 → 91,4 pts · 03/2026, crosshair, base punteada 1,3 / `0 3.6` en `--content-disabled`, sin tooltip |
| Hover en widgets y filas | **`transform: none`** en toda la cadena de ancestros: el hover revela acciones y cambia color | escala 1,02 solo en controles y tarjetas internas; widgets y filas sin escala |
| Nombre del instrumento en la cabecera | botón `aria-label="Buscar"` (`instrumentSelector__instrumentName`) que abre el selector | `CompanyPicker`: trigger + `listbox` de 320 px con 8 filas de 32 px; en Comparativa (A y B) y en «Elegir empresa» del marco |
| «Estadísticas clave» | rejilla de dos columnas de 98 px, etiqueta gris sobre valor blanco, filas de 32–46 px, 13 px | `FamilyStats`: dos columnas, celdas de 48 px (`--size-stat-row`), etiqueta 11 px sobre valor 13 px |
| Fondo | `body #181613`; en el tablero **no hay orbe**, solo `canvas.spotlightCursor` que sigue al puntero | `body #020a24`; orbe azul con deriva de 48 s **y** foco de 700 px / blur 64 / opacidad 0,12 que sigue al puntero |

### 8.3 Desviaciones aceptadas

- **Escala 1,02 al hover solo en controles y tarjetas internas**, incluidas las filas del
  catálogo y las celdas de `FamilyStats`. Trade Republic no escala nada; Alfonso pidió el «hacerse
  más grande» ahí y solo ahí. Los dos botones `Plus` de la topbar («Añadir página», «Añadir
  widget») suben a 1,10 en 200 ms, copiando el `transform .2s` del botón homónimo de Trade
  Republic.
- **Catálogo de 320 px, no 250.** Cada fila lleva miniatura de 60 px, título y descripción; a 250
  la descripción se recorta. Se reutiliza `--size-popover-w`, el mismo ancho del `CompanyPicker`.
- **`dashboard/grid.ts` pasa a `grid-math.ts`.** En APFS, insensible a mayúsculas, `./grid`
  resolvía indistintamente a `grid.ts` y a `Grid.tsx` (y `grid.test.ts` a `Grid.test.tsx`). El
  nombre nuevo dice además lo que hay dentro: aritmética, no componente.
- **`CompanyPicker.value` es `{ id, name }`**, no un `UniverseItem`. El marco fija una empresa
  desde la ficha (`companyKey`), no desde el universo, y con dos campos le basta a cualquiera de
  los tres consumidores.
- **Glass sobre navy** sigue siendo la desviación de §5: los widgets de Trade Republic no llevan
  `backdrop-filter`; los de X-Ray sí (`--surface-glass` + `--blur-glass`), fijado por Alfonso.
- **Pestañas a 600 en vez de 680**: la escala de pesos del sistema es 400/500/600, sin
  `font-synthesis`; 680 exigiría un peso nuevo para un solo uso.
- **La API de verificación se levantó en un puerto propio**, distinto del 8787 de desarrollo
  (`API_URL` de `evals/checks/lib.sh`), para no pisar el `dev` de la sesión principal mientras se
  tomaban capturas y se corría el check. El producto sigue apuntando a 8787.

### 8.4 Motion

Puerta de `design-find-animations` (frecuencia → propósito → velocidad → función) sobre lo nuevo;
lo de XR-030 (§6) sigue vigente.

| Momento | Decisión | Receta |
|---|---|---|
| Soltar un widget arrastrado | Sí, ocasional: el widget se **asienta** en su celda en vez de saltar (*Settle*) | el residuo hasta la celda final se aplica como `transform` y se lleva a `none` en el siguiente frame con `transition-transform` 200 ms `--ease-enter`; sin muelles; la transición solo vive en reposo |
| Cambiar de opción en un `Segmented` | Sí, decenas al día pero es el toggle glass de Trade Republic (*Slide*) | indicador `span` absoluto que anima solo `transform` y `width`, 200 ms `--ease-enter`, medido con `offsetLeft`/`offsetWidth` + `ResizeObserver` |
| Mover el puntero | Sí, ambiente (*Follow*) | el foco recorre un 8 % de la distancia por frame (`lerp 0.08`) en `requestAnimationFrame`, solo `translate3d`, sin `setState`; se para bajo 0,5 px |
| Abrir el catálogo, el menú del widget o el `CompanyPicker` | Sí, ocasional (*Origin-aware* *Scale in*) | `animate-menu-enter`: opacity 0→1 y `scale(.97)`→1, 150 ms `--ease-enter`, `transform-origin` en el disparador |
| Entrada de los widgets al cambiar de tablero | Sí, una vez por cambio (*Stagger* + *Fade in*) | `animate-panel-enter` con 40 ms de escalón por widget; el `key` del lienzo la relanza |
| Hover en controles y tarjetas internas | Sí, sutil (*Hover effect*) | `scale(1.02)` 150 ms bajo `[@media(hover:hover)]`; pulsación `scale(.97)` |
| Desplegar un grupo en Empresas | Sí, sutil (*Rotate*) | `ChevronRight` gira 90° con `transition-transform` 150 ms |
| Cambiar de mes con el hover de la gráfica | **No**: las cifras se reemplazan de golpe | sin *Number ticker*; `aria-live="polite"` en el `dl` |
| Hover en un widget o en una fila | **No**: Trade Republic mide `transform: none` | cambio de fondo y aparición de la acción |
| Redimensionar con el asa | **No**: el tamaño sigue al puntero | `width`/`height` en `calc` durante el gesto, store al soltar |

`prefers-reduced-motion`: todo lo anterior lleva `motion-reduce:transition-none` o
`motion-reduce:animate-none`; la regla global de `index.css` limita las transiciones a color,
opacidad y sombra; `.spotlight` pasa a `display: none` y `Background` no engancha el `pointermove`
(tampoco bajo `hover: none`). Revisión final con `design-review-animations`: la invoca Alfonso.
