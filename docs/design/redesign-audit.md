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
