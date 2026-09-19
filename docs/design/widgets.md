# Cómo funciona la página y cómo añadir un panel

La fuente de verdad es el código de [`app/web/src`](../../app/web/src/): `routes/dashboard.tsx`,
`panels/Panel.tsx`, `components/app-shell.tsx`, `components/topbar.tsx`,
`components/Background.tsx`, `dashboard/selection.ts` y los tres paneles de `panels/*`. Este
documento describe lo que hay allí; si los dos discrepan, manda el código. Los colores y las
medidas salen de [`docs/design/tokens.md`](tokens.md); las gráficas, de
[`docs/design/charts.md`](charts.md). Aquí no se repite ninguno de los dos.

Desde XR-030 la ruta `/` es **una sola página con tres paneles fijos**: Empresas, Comparativa e
Investigación. No hay registro de widgets, ni lienzo, ni catálogo. Añadir un panel es escribir un
componente de contenido y montarlo en la rejilla; el contexto de esa decisión está en
[`docs/design/redesign-audit.md`](redesign-audit.md).

## 1. Anatomía de la página

```
body (--bg)
└── AppShell            h-dvh, flex-col, overflow-hidden: la página nunca scrollea
    ├── Background      [data-orb] fijo, z-index -1
    ├── Topbar          60 px (--size-topbar), transparente
    └── main            flex-1, overflow-auto
        └── DashboardPage   rejilla de tres Panel
```

### El marco (`components/app-shell.tsx`)

`AppShell` es una columna de la altura exacta de la ventana y sin desbordamiento. **La página
nunca scrollea**: si lo hiciera, la barra del navegador robaría unos 15 px de ancho y la rejilla
mediría corto. El scroll vive en `<main>`, que lo necesita para las rutas largas que siguen
montadas fuera de la navegación (`/portfolio`, `/company/:id`, `/monitor`); la página de paneles
ocupa `main` entero y cada panel scrollea por su cuenta.

El fondo lo pinta `body` (`--background`), no el `div` del marco: el orbe va en una capa fija con
`z-index: -1` y un fondo en el marco lo taparía.

### El fondo (`components/Background.tsx`)

Un `div[data-orb][aria-hidden="true"].orb-layer` con dos hijos, `.orb` y `.orb.orb--2`. El
componente no lleva ningún literal: color, tamaño, deriva y variante viven en `index.css`
(`.orb-layer`, `.orb`, tokens `--orb-*`, ver [tokens.md §Glass y orbe](tokens.md#glass-y-orbe)).

Trade Republic no tiene orbe en el tablero, solo en el login y como canvas que sigue al cursor.
Aquí se trae a la página como CSS puro por decisión de producto. Dos cosas que parecen detalle y
no lo son:

- **`contain: strict` en la capa.** El blur del orbe no se recalcula al hacer scroll en la tabla
  de 200 filas.
- **Bajo `prefers-reduced-motion` la capa no anima.** La regla global de `index.css` pone
  `animation: none` a `[data-orb]` y a sus hijos; el orbe se queda quieto, no desaparece.

### La topbar (`components/topbar.tsx`)

`header[role="banner"]` de `--size-topbar` (60 px), padding 16, fondo transparente para que el
orbe se vea a través. Sin pestañas, sin chips, sin menú de presets.

| Zona | Qué hay | Detalle |
| --- | --- | --- |
| Izquierda | Marca `X-Ray` | texto 14 px / 600 |
| Centro | Buscador global | `input[aria-label="Buscar empresa"]`, 32 px (`--size-input`), glass, 320 px de ancho |
| Derecha | Indicador de mock | `span[role="status"]`, mono a `--text-micro`: `Mock v1 · corte 08/2026` |
| Derecha | Avatar | botón redondo de 28 px, `aria-label="Menú de perfil"`, inicial `X` |

**El buscador escribe directamente en el store de selección** (`setSearch`), no en un estado
propio: el panel Empresas lo lee de ahí y reescribe su consulta. Nada anima al teclear.

**El indicador solo aparece con `data_kind: "mock"`.** Consulta `/api/v2/meta` (`getMeta`,
clave `["meta"]`) y, mientras carga o si falla, no afirma nada sobre el origen del dato. El corte
sale del último mes de `meta.months` con `formatCutoff` (`2026-08` → ` · corte 08/2026`).

### La rejilla (`routes/dashboard.tsx`)

```tsx
<div className="grid h-full grid-cols-1 auto-rows-[minmax(360px,auto)] p-4
                xl:grid-cols-[12fr_12fr] xl:grid-rows-[minmax(280px,2fr)_3fr]"
     style={{ gap: "var(--grid-gap)" }}>
  <Panel id="companies" title="Empresas"      index={0} className="xl:row-span-2">…</Panel>
  <Panel id="compare"   title="Comparativa"   index={1}>…</Panel>
  <Panel id="research"  title="Investigación" index={2}>…</Panel>
</div>
```

| Ancho | Columnas | Filas | Resultado |
| --- | --- | --- | --- |
| `>= 1280 px` (`xl:`) | `12fr 12fr` | `minmax(280px, 2fr) 3fr` | Empresas a la izquierda a toda altura; a la derecha Comparativa (≈ 40 % del alto) sobre Investigación |
| `< 1280 px` | `1` | `minmax(360px, auto)` por panel | los tres apilados, 360 px como mínimo cada uno |

La rejilla llena el `main` (`h-full`) y cada panel recorta su propio contenido: el scroll vive
dentro de cada uno, nunca en la página. El único token de rejilla que se consume es `--grid-gap`
(8 px); `--grid-cols`, `--grid-row` y `--widget-padding` siguen declarados en `index.css` pero
ningún componente los lee.

A 1440 px cada columna mide 700 px. Ese número importa: fija cuántas columnas caben en la tabla
de Empresas (ver §4).

## 2. El marco `Panel` (`panels/Panel.tsx`)

| Prop | Tipo | Nota |
| --- | --- | --- |
| `id` | `string` | fija el `id` del `h2` (`${id}-title`) y el `aria-labelledby` |
| `title` | `string` | el nombre de la región para el lector de pantalla |
| `children` | `ReactNode` | el contenido; ocupa el resto del alto (`min-h-0 flex-1`) |
| `actions` | `ReactNode` | opcional: hueco a la derecha de la cabecera. Hoy ningún panel lo pasa |
| `className` | `string` | opcional: solo lo usa Empresas para `xl:row-span-2` |
| `index` | `number` | posición en la entrada escalonada; por defecto 0 |

Lo que pinta:

- `section[role="region"]` con `aria-labelledby` al `h2`, para que el lector de pantalla salte
  entre Empresas, Comparativa e Investigación.
- **Glass**: `bg-surface-glass`, borde de 1 px como `shadow-[inset_0_0_0_1px_var(--border-glass)]`,
  `backdrop-blur-[var(--blur-glass)]`, radio `--radius-card`, padding `0 16 16` (`px-4 pb-4`).
- **Cabecera de 32 px** (`--size-row`) con el título a `--text-panel-title` (14 px) y peso 600,
  truncado. Trade Republic usa 14, no 18: el token `--text-widget-title` (18) ya no lo consume
  ningún panel.
- **Entrada escalonada**: `animate-panel-enter` con `animationDelay: index * 40 ms`. El tercer
  panel arranca a 80 ms, nunca más tarde. Lleva `motion-reduce:animate-none`.
- `overflow-hidden` y `min-h-0`: el marco recorta y el contenido decide dónde scrollea.

Lo que **no** hace, y es a propósito:

- **Sin hover de borde.** El panel es un marco, no un control: no cambia al pasar por encima.
- **Sin acciones propias.** Ni kebab, ni maximizar, ni arrastrar, ni redimensionar, ni selector
  de entidad, ni punto de vínculo. Si un panel necesita controles, los pinta él en su contenido
  (como hacen los rangos de Comparativa) o los pasa por `actions`.
- **No consulta datos ni pinta estados.** Carga, vacío y error son del contenido.

## 3. El store de selección (`dashboard/selection.ts`)

Un solo objeto inmutable en memoria y suscripción con `useSyncExternalStore`. Existe porque la
selección cruza los tres paneles y ninguno es dueño de ella.

```ts
type SelectionState = { selected: string | null; compare: string[]; search: string };
const MAX_COMPARE = 5;
```

| Campo | Quién escribe | Quién lee | Regla |
| --- | --- | --- | --- |
| `selected` | Empresas (`select`, clic o Enter en una fila) | Investigación (qué ficha cargar); Empresas (`aria-selected` y foco inicial) | un solo id o `null`. Seleccionar **no** añade a `compare` |
| `compare` | Empresas (`toggleCompare` desde «Comparar»); Comparativa (`removeCompare` desde la leyenda) | Comparativa (qué series pedir); Empresas (`aria-pressed` del botón) | sin repetidos, orden de inserción, máximo 5: con cinco, `toggleCompare` de un sexto se ignora |
| `search` | Topbar (buscador global) y Empresas (su propio filtro) | Topbar y Empresas (`value` del input y `q` de la consulta) | los dos inputs son el mismo campo |

Acciones: `select(id | null)`, `toggleCompare(id)`, `removeCompare(id)`, `setSearch(value)`,
`resetSelection()`. Lectura: `useSelection(selector)`; el selector debe devolver primitivas o
referencias del estado, nunca un objeto nuevo por render.

**No persiste.** Ni `localStorage`, ni servidor, ni URL: el demo arranca siempre limpio. La
persistencia de layout era una necesidad del lienzo de widgets, que ya no existe.

## 4. Los tres paneles

Los tres consumen la API v2 por `lib/api-v2.ts` con React Query, importan las gráficas solo de
`@/charts` y traducen régimen y banda con `REGIME_LABEL` / `REGIME_CLASS` / `BAND_LABEL` /
`BAND_CLASS` de `lib/regime.ts`. Cada uno tiene su test al lado (`*.test.tsx`), que es lo que
ejecuta el check de la feature.

### Empresas (`panels/companies/CompaniesPanel.tsx`)

El «Research» de Trade Republic: tabla densa y virtualizada sobre `/api/v2/universe`
(`getUniverse`, clave `["universe", query]`).

**La consulta es un solo objeto y es la clave de React Query.** Cada pill y la ordenación la
reescriben con `offset: 0`. La búsqueda no vive aquí: viene del store, y el `offset` guarda para
qué búsqueda vale (`page.search`), así que cambiar la búsqueda vuelve a la primera página sin
efectos ni consultas dobles. `placeholderData: keepPreviousData`: reordenar no parpadea a
esqueleto, la tabla anterior aguanta hasta que llega la nueva.

**El servidor ordena y filtra.** Aquí no se reordena nada: se manda el parámetro y se pinta la
respuesta tal cual llega. `limit` es 200 (`PAGE_SIZE`) y el resto se pagina.

Controles, todos glass de 32 px:

| Control | Qué hace |
| --- | --- |
| Filtro `aria-label="Filtrar empresas"` | escribe el mismo `search` del store que la topbar |
| `FilterPill` Banda | `BANDS` con `BAND_LABEL` (los cuatro valores reales de la API) |
| `FilterPill` Régimen | los siete regímenes con `REGIME_LABEL` |
| `FilterPill` Grupo | opciones sacadas de los `group_id` en pantalla; el elegido se queda aunque el filtro deje fuera a los demás |
| Unidad (`role="group"`) | Empresa / Grupo con `aria-pressed`; cambiar de unidad limpia Grupo |
| `SortableHeader` | `aria-sort`; un clic ordena descendente, el segundo invierte |

`FilterPill` es un menú hecho a mano (`role="menu"`, `aria-haspopup`, `aria-expanded`, cierra
con Escape y con clic fuera) porque el popover de Radix es frágil en jsdom. El menú entra con
`animate-crossfade`.

Estados explícitos:

| Estado | Qué se ve |
| --- | --- |
| Carga | `TableSkeleton`: ocho filas de 28 px con una barra glass por columna, `aria-busy` y texto `sr-only` «Cargando empresas» |
| Error | `ErrorState` con causa y «Reintentar» (`refetch`) |
| Vacío | «Ninguna empresa cumple los filtros» + «Quita un filtro o cambia la búsqueda.» |
| Paginado | solo si `total > rows.length`: «1-200 de N», Anteriores / Siguientes |

La tabla:

- **`div` con roles ARIA, no `<table>`.** Virtualizar exige posicionar cada fila y
  `display: flex`, y un `<table>` con ese display pierde igualmente sus roles nativos.
- **Fila de 28 px** (`ROW_HEIGHT`, debe cuadrar con `--size-table-row`) y cabecera de 26
  (`TABLE_HEADER_HEIGHT`, sin token). Las dos van en píxeles porque el virtualizador
  (`useVirtualizer`, `overscan: 10`) estima con el número.
- **Columnas**: Empresa (13 px, el resto del ancho, `title` con `nombre · id`), Id, Grupo,
  Score, Δ1m, Δ3m, Régimen, 12 m (`Sparkline points={row.sparkline_12} regime={row.regime}`),
  Banda y una de acciones. Las cortas tienen ancho fijo medido sobre su contenido más largo;
  Empresa se queda el resto.
- **Las diez columnas no caben a 1440 px** (700 px de panel, 668 útiles). Por eso se ocultan por
  **`@container`**, no por ancho de ventana: Grupo solo desde `@3xl` (768 px de contenedor); Id y
  Δ3m desde 656 px. A 1280 px (588 útiles) el nombre sigue teniendo sitio. Nada se solapa y nada
  desplaza en horizontal.
- **Cifras**: Score con una decimal y coma, sin unidad (la cabecera ya dice qué es); Δ1m y Δ3m
  con `fmtDelta` sin el sufijo ` pts`, porque en 52 px no cabe y sobra. Glifo y color los decide
  `fmtDelta`.
- **Teclado**: roving tabindex (una sola fila entra en el orden de tabulación: la última
  enfocada, si no la seleccionada, si no la primera). ↑/↓ mueven el foco, Home/End saltan a los
  extremos, Enter o clic seleccionan (`select`). Si la fila destino no está montada, el
  virtualizador se desplaza hasta ella y un efecto la enfoca en cuanto exista.
- **Fila seleccionada** en `bg-fills-accent-thin` y `aria-selected="true"`. Hover en
  `bg-surface-glass`, solo con `[@media(hover:hover)]`.
- **«Comparar» aparece en hover y en foco** (`opacity-0` → `group-hover/row` y
  `group-focus-within/row`), y se queda visible en `--content-accent` cuando la fila ya está en
  `compare` (`aria-pressed="true"`). La etiqueta no cambia: el estado va en `aria-pressed` y en
  el color. El botón para la propagación para que pulsar no seleccione, y las teclas dentro del
  botón son suyas.
- **Sin `backdrop-blur` en las filas.** Son 200 filas virtualizadas; el blur se queda en el panel.

### Comparativa (`panels/compare/ComparePanel.tsx`)

Las empresas de `compare` en un solo `LineNoAxes`.

**Una consulta por empresa con `useQueries`, con la misma clave que Investigación**
(`["company-v2", id]`, `getCompanyV2`): seleccionar y comparar la misma empresa no la pide dos
veces.

Estados explícitos, en este orden:

| Estado | Qué se ve |
| --- | --- |
| `compare` vacío | «Añade empresas desde la tabla» + «Pasa por encima de una fila de Empresas y pulsa Comparar.» |
| Alguna consulta en error | `ErrorState` de la primera fallida, contexto `la empresa <id>`, «Reintentar» relanza solo esa |
| Alguna consulta cargando | `CompareSkeleton`: tres píldoras y una caja de 148 px |
| Serie con menos de 2 puntos (`MIN_POINTS`) | no se dibuja; en su fila de leyenda pone «Historia insuficiente» en vez de la Δ |

Rangos como texto, `role="group" aria-label="Rango"`, cada uno con `aria-pressed`:

| Rango | Puntos que se dibujan |
| --- | --- |
| `3M` | los 4 últimos |
| `6M` | los 7 últimos |
| `1A` | los 13 últimos (por defecto) |
| `Máx` | todos |

**El rango recorta en el cliente** (`points.slice(-n)`) porque la API no pagina la `timeline`.

**«Base 100» es `normalize` de la primitiva**, sin rehacer nada aquí. La Δ del periodo de la
leyenda se calcula siempre en puntos de score sobre los puntos visibles (último menos primero,
con `fmtDelta`), también con Base 100: el rebase es una lectura visual, no un cambio de magnitud.

**Con varias series el color es la identidad de la serie, no su régimen.** Los puntos van sin
`regime` y el color sale de la posición en `compare`: `--chart-score`, `--content-accent`,
`--chart-pillar-collections`, `--chart-pillar-activity`, `--chart-pillar-debt`. No existe un
token de serie de comparativa; los pilares aquí no significan nada, solo prestan color.

**La leyenda es inline y la pone el panel**, porque `LineNoAxes` no la pinta: un trazo corto del
color, el nombre (truncado a 180 px), la Δ y un botón `aria-label="Quitar <nombre>"` que llama a
`removeCompare`. No hay ningún panel de leyenda de colores.

**El alto de la gráfica se mide** con `ResizeObserver` sobre el hueco que deja la fila de
controles, acotado a `[148, 360]` (148 es `--size-chart-large`; 360 evita que se estire en
pantallas altas). El contenedor se monta después de cargar, por eso el ref es un callback.

Props relevantes de `LineNoAxes`: `series` (solo las dibujables), `normalize`, `label`
(«Score de N empresas (nombres), rango …»), `unit="pts"`, `height`.

### Investigación (`panels/research/ResearchPanel.tsx` + `forecast.ts`)

La ficha de la empresa seleccionada sobre `/api/v2/companies/:id` (`getCompanyV2`, clave
`["company-v2", id]`), al estilo de la ficha de instrumento de Trade Republic. De arriba abajo:
cabecera, titular de la narrativa, gráfica, pilares, drivers y última alerta.

Estados explícitos:

| Estado | Qué se ve |
| --- | --- |
| Sin selección | «Selecciona una empresa» + «Haz clic en una fila de Empresas para verla aquí.» |
| Carga | `SheetSkeleton`: cabecera, caja de 148 px y cinco barras |
| Error | `ErrorState` con «Reintentar»; con 404 (`ApiError.status === 404`) el mensaje es «No existe ninguna empresa `<id>` en este corte.» |
| `timeline` con menos de 3 puntos (`MIN_HISTORY`) | en el hueco de la gráfica: «Historia insuficiente» + «Hacen falta al menos tres meses de score para dibujar la trayectoria.» El resto de la ficha se pinta |

**Cross-fade al cambiar de empresa.** El contenido va en un `div` con `key={id}` y
`data-company={id}`: al cambiar `selected`, React lo desmonta y monta el nuevo, que entra con
`animate-crossfade` (`motion-reduce:animate-none`). **El rango vive fuera de ese contenedor**,
en `ResearchPanel`, para que sobreviva al cambio: quien compara empresas a 6M no quiere volver
a 1A con cada clic.

Cabecera: nombre (14 px / 600) e id (mono, `--text-micro`); score con `fmtPoints` a
`--text-figure` (20 px); Δ1m con `fmtDelta` (glifo, signo y color); etiqueta de régimen y de
banda. A la derecha, un `dl` con «Outlook 6 m» (`fmtPoints(low) · fmtPoints(high)`, el Bid/Ask de
Trade Republic) y «Confianza» (`fmtU`). Debajo, el titular de la narrativa truncado a una línea.

Gráfica, en una caja de **alto fijo** de 168 px:

- **El alto es fijo, no medido.** Medirlo con `ResizeObserver` sobre un `flex-1` retroalimenta:
  el contenedor crece con su propio contenido (SVG `preserveAspectRatio="none"` más la capa HTML
  absoluta), la gráfica se pinta más alta que su caja y pisa las secciones de abajo. Comparativa
  puede medir porque la gráfica es lo único que hay debajo de sus controles; aquí no.
- Rangos `3M 6M 1A Máx` como texto con `aria-pressed`, mismos puntos que Comparativa (4, 7, 13,
  todos), `1A` por defecto.
- `series`: una, con `regime` por punto, así cada tramo toma el color de su régimen.
- `baseline`: el primer punto visible (`{ value: first.score, label: fmtMonth(first.month) }`).
- `forecast`: `buildForecast(as_of, score, outlook)`. La API publica dos horizontes (`h3`, `h6`)
  y una banda final (`low`, `high`); `forecast.ts` los convierte en seis meses `as_of+1 … +6`
  interpolados linealmente: el centro pasa por `h3` en +3 y por `h6` en +6, y `low`/`high` van
  desde el score de hoy hasta la banda del +6. Es aritmética pura, sin React, con su propio test.
- `markers`: `alert` en `alert.month_detected` si ese mes está en el rango visible; `cap` en
  `as_of` si la empresa tiene techo.
- `label` «Score de `<nombre>`, `<rango>`», `unit="pts"`.

Pilares (`section[aria-label="Pilares del score"]`): cinco filas `96px 1fr 44px` con etiqueta,
`PillarBar value label variant="plain"` (un `role="meter"` cada una) y la nota con `fmtU`, o `—`
(`EMPTY_VALUE`) si no es finita. Etiquetas: Liquidez, Pago propio, Cobros, Deuda, Actividad. El
pilar más débil, si `penalty.points > 0`, va en `--content-alert` con la penalización en puntos
al lado.

Drivers (`section[aria-label="Qué se movió"]`): los cinco primeros por `rank`, sin `PENALTY` ni
`CAP` (ya viven en pilares y marcadores). Cada uno: `value_fmt` (o el `signal_id` si falta), la
contribución con `fmtDelta` y «vs mes ant.» con `fmtDelta(delta_vs_prev)`.

Alerta (`section[aria-label="Última alerta"]`), solo si `alert` no es `null`: severidad como
texto (`watch` → Vigilar y `review` → Revisar en `--content-alert`; `urgent` → Urgente en
`--content-negative`), mes con `fmtMonth` y el mensaje a dos líneas.

## 5. Reglas para un panel nuevo

1. **Montarlo en `routes/dashboard.tsx` dentro de un `Panel`** con `id`, `title` e `index`. La
   rejilla está escrita para tres: un cuarto panel es una decisión de rejilla, no de registro. No
   hay dónde registrar nada.
2. **Solo contenido.** El marco, el título, el glass y la entrada los pone `Panel`. El contenido
   recibe un hueco `min-h-0 flex-1` y decide él dónde scrollea (`overflow-y-auto` en su propio
   contenedor, como Investigación).
3. **Datos por `lib/api-v2.ts` y React Query.** La ficha de empresa se pide siempre con la clave
   `["company-v2", id]` para compartir caché con los otros paneles.
4. **La selección se lee del store y se escribe con sus acciones.** `useSelection(selector)` con
   un selector que devuelva primitivas o referencias del estado. Nunca una copia local de
   `selected`, `compare` o `search`.
5. **Estados explícitos, los cuatro**: carga (skeleton con la forma del contenido, `aria-busy`,
   `aria-live="polite"` y un texto `sr-only`), vacío (qué pasa y qué hacer, en dos líneas), error
   (`ErrorState` con `onRetry` y `context`) e historia insuficiente cuando la serie no da para
   dibujar. Nunca un cero de relleno donde falta el dato.
6. **Color por token, nunca un hex.** `var(--x)` o la utilidad de Tailwind de la capa semántica
   (`text-content-secondary`, `bg-surface-glass`, `border-border-glass`…). Lo vigila
   `src/design/tokens.test.ts`. Régimen y banda, con `lib/regime.ts`.
7. **Cifras con `font-mono tabular-nums`** y formateadas por `@/charts`: `fmtDelta` decide glifo,
   signo y color; `fmtPoints` pone la unidad; `fmtU` y `fmtMonth` para notas y meses. Valor
   ausente: `EMPTY_VALUE` (`—`), nunca `0`.
8. **Gráficas solo de `@/charts`**, con `label` siempre. Lo que la primitiva no pone (leyenda con
   dos o más series, estados) lo pone el panel.
9. **Motion por utilidades**: `animate-panel-enter` la pone `Panel`; `animate-crossfade` para un
   contenido que se reemplaza (contenedor con `key`) o un menú que aparece, siempre con
   `motion-reduce:animate-none`. Hover y foco a `duration-[var(--duration-fast)]`, y el hover
   solo bajo `[@media(hover:hover)]`. Foco visible con `focus-visible:ring-*`. Nada anima al
   escribir ni al cambiar de página.
10. **Densidad**: fila de tabla `--size-table-row` (28 px), controles de 32 px, cabecera de panel
    de 32 px. Si una columna no cabe, se oculta por `@container`, no por ancho de ventana.
11. **Copy** en español impersonal de tesorero
    ([`docs/dani/contrato-visual-v1.md`](../dani/contrato-visual-v1.md) §3): «Selecciona una
    empresa», «Historia insuficiente», «Ninguna empresa cumple los filtros».
12. **Sin catálogo, sin leyenda de colores, sin selector de entidad por panel.** Si un panel
    necesita una empresa, la lee de `selected`; si necesita varias, de `compare`.
13. **Un test al lado** (`panels/<nombre>/<Nombre>Panel.test.tsx`) y una línea `web_test` en el
    check de la feature.

## 6. Qué se retiró en XR-030 y por qué

| Se retiró | Por qué |
| --- | --- |
| `dashboard/Canvas`, `store`, `grid`, `types` (lienzo arrastrable y layout persistido) | ruido que no aportaba al MVP: drag, resize, maximizar, presets ([auditoría §4, hallazgo 6](redesign-audit.md#4-auditoría-ux-checklist-ui-ux-pro-max-prioridades-17)) |
| `widgets/registry`, `register-all`, `WidgetCatalog` (registro y catálogo) | con tres paneles fijos no hay nada que registrar ni que catalogar |
| `widgets/WidgetFrame` | sustituido por `panels/Panel`: sin kebab, sin maximizar, sin borde en hover |
| `widgets/EntityPicker` y los vínculos por color (`linkGroup`) | la selección es una y global: `dashboard/selection.ts` |
| `Topbar` con espacios, pestañas y chips de salud | los chips pedían `limit: 2000` a una API que admite 500 y siempre mostraban `—` ([auditoría §2](redesign-audit.md#2-deriva-cliente--contrato-v2-bloqueante-para-los-paneles)) |
| `MockBanner` (banner amarillo «Datos simulados») | convertido en el indicador discreto `Mock v1 · corte MM/AAAA` de la topbar |
| `widgets/score-card` | rota contra la API real (`company.sparkline_12` no existe); su papel lo hace Investigación |
| `widgets/screener` como widget | su estado de consulta, `FilterPill`, `SortableHeader`, virtualizador y paginación viven ahora en `CompaniesPanel` |
| `widgets/Sparkline` | duplicaba la de `@/charts` |
| `widgets/regime.ts` | movido a `lib/regime.ts`, con las bandas reales (`solid`, `healthy`, `watch`, `stress`) |
| `lib/portfolio-health` | solo lo consumían los chips de la topbar |

Los tests de todos esos módulos se borraron con su código; ninguno se debilitó ni se saltó. Los
tokens `--grid-cols`, `--grid-row`, `--widget-padding`, `--surface-widget` y
`--text-widget-title` siguen declarados en `index.css` y documentados en `tokens.md`, pero hoy
ningún panel los consume.

El contexto completo (medidas de Trade Republic, deriva del contrato v2, riesgos aceptados) está
en [`docs/design/redesign-audit.md`](redesign-audit.md).
