# Tableros y widgets: cómo funciona la página y cómo añadir un widget

La fuente de verdad es el código de [`app/web/src`](../../app/web/src/): `routes/dashboard.tsx`,
`dashboard/{types,store,fixed,grid-math,Grid,WidgetCatalog,selection,watchlist}`,
`widgets/{registry,register-all,WidgetFrame,thumbnails,useCompanyName}`,
`components/{app-shell,Background,topbar,DashboardTabs,AddWidgetButton,SearchTrigger,
EntitySearchOverlay,CompanyPicker,FavoriteStar}`, `components/ui/{segmented,dialog,info-tip}`,
`lib/{definitions,entity}` y el contenido de `panels/*` y `widgets/<type>/*`. Este documento
describe lo que hay allí; si los dos discrepan, manda el código. Los colores y las medidas salen
de [`docs/design/tokens.md`](tokens.md); las gráficas, de [`docs/design/charts.md`](charts.md).
Aquí no se repite ninguno de los dos.

Desde XR-032 la ruta `/` abre el tablero **Empresa**, fijo, con dos widgets a toda altura
(Investigación e Investigación profunda) que siguen a la entidad elegida en el **buscador
central** de la topbar; la segunda pestaña fija, **Investigación**, mezcla Mapa, Empresas,
Favoritos, Cartera, Comparativa y Alertas para investigar. El usuario puede crear
**tableros propios** con hasta cuatro widgets de un catálogo de nueve, arrastrables y
redimensionables. El lienzo, el registro y el catálogo vienen de XR-031; el contexto de esa
decisión y de esta iteración está en [`docs/design/redesign-audit.md`](redesign-audit.md) y en §9.

## 1. Anatomía de la página

```
body (--bg)
└── AppShell            h-dvh, flex-col, overflow-hidden: la página nunca scrollea
    ├── Background      [data-orb] fijo, z-index -1: dos orbes y el foco [data-spotlight]
    ├── Topbar          60 px (--size-topbar), transparente: marca · DashboardTabs · SearchTrigger (centrado) · mock · «Añadir widget» · avatar
    └── main            flex-1, overflow-auto
        └── DashboardPage   <Grid key={id} dashboard locked={isFixedDashboard(id)} />
```

### El marco (`components/app-shell.tsx`)

`AppShell` es una columna de la altura exacta de la ventana y sin desbordamiento. **La página
nunca scrollea**: si lo hiciera, la barra del navegador robaría unos 15 px de ancho y la rejilla
mediría corto. El scroll vive en `<main>` (lo necesitan las rutas largas que siguen montadas fuera
de la navegación: `/portfolio`, `/company/:id`, `/monitor`); el lienzo ocupa `main` entero, cada
widget recorta su contenido y solo scrollea el lienzo si un tablero de usuario desborda.

El fondo lo pinta `body` (`--background`), no el `div` del marco: la capa del orbe es fija con
`z-index: -1` y un fondo en el marco la taparía.

### El fondo (`components/Background.tsx`)

Un `div[data-orb][aria-hidden="true"].orb-layer` con tres hijos: `.orb`, `.orb.orb--2` (apagado) y
`div[data-spotlight].spotlight`, el foco que sigue al puntero. El componente no lleva ningún
literal: color, tamaño, deriva y opacidad viven en `index.css` (`.orb-layer`, `.orb`, `.spotlight`
y los tokens `--orb-*` y `--spotlight-*`, ver [tokens.md §Glass, orbe y foco](tokens.md#glass-orbe-y-foco)).

El foco es el `spotlightCursor` de Trade Republic traído al tablero, pero sin `canvas`:

- **Sin `setState`.** Un `pointermove` pasivo en `window` escribe el destino y un bucle de
  `requestAnimationFrame` acerca la posición un 8 % por frame (`current += (target − current) ·
  0.08`) escribiendo `style.transform = translate3d(x, y, 0)`. El bucle se para cuando la
  distancia baja de 0,5 px: en reposo no hay rAF pendiente.
- **Arranca donde lo deja la hoja.** El punto inicial es `(innerWidth / 2, innerHeight · 0.4)`,
  el mismo `translate3d(50vw, 40vh, 0)` de `.spotlight`, así que el primer movimiento no salta.
- **Bajo `prefers-reduced-motion: reduce` o `hover: none` no se engancha nada.** La hoja ya
  oculta `.spotlight` en esos dos casos; el orbe se queda quieto, no desaparece.
- `contain: strict` en la capa: el blur no se recalcula al hacer scroll en la tabla.

### La topbar (`components/topbar.tsx`)

`header[role="banner"]` de `--size-topbar` (60 px), padding 16, fondo transparente para que el
orbe se vea a través, y `relative` para que el buscador se centre en él en absoluto, fuera del
flujo de las pestañas. Sin banner de mock, sin leyenda de colores, sin chips.

| Zona | Qué hay | Detalle |
| --- | --- | --- |
| Izquierda | Marca `X-Ray` | texto 14 px / 600 |
| Izquierda | `DashboardTabs` | `div[role="tablist"][aria-label="Tableros"]`: las dos pestañas fijas, un separador, las de usuario y «Añadir página» |
| Centro | `SearchTrigger` | `button[aria-haspopup="dialog"]` con aspecto de campo, 32 px (`--size-input`), glass, ancho `--size-search-w` (`min(50vw, 720px)`), `absolute left-1/2 -translate-x-1/2`; abre `EntitySearchOverlay` |
| Derecha | Indicador de mock | `span[role="status"]`, `.num` a `--text-micro`: `Mock v1 · corte 08/2026`; solo con `data_kind: "mock"` (clave `metaKey`) |
| Derecha | `AddWidgetButton` | 24 × 24, `aria-label="Añadir widget"`, `aria-haspopup="menu"`; abre el catálogo (§5) |
| Derecha | Avatar | botón redondo de 28 px, `aria-label="Menú de perfil"`, inicial `X` |

**El buscador central (`components/SearchTrigger.tsx` + `components/EntitySearchOverlay.tsx`).**
El disparador muestra un icono de lupa, «Buscar empresa o grupo…» o el nombre de la entidad
seleccionada (empresa por `useCompanyName`, grupo por `groupKey` con `select` al nombre: la misma
caché que Investigación) y un `kbd` «⌘K». `⌘K`/`Ctrl+K` se escuchan en `window`: el botón toma
el foco antes de abrir, así el diálogo se lo devuelve al cerrar. Hover a 1,01 y pulsación a 0,99.

El overlay es un `Dialog size="overlay" label="Buscar empresa o grupo"` (§8): 50 vw × hasta
70 vh (`--size-overlay-w/-h`), anclado bajo la topbar, con cabecera de 56 px (input glass de
32 px, `aria-label="Filtrar empresas y grupos"`, placeholder «Nombre, id o grupo»), el árbol en
el resto del alto y un pie de 32 px «↑↓ navegar · → desplegar · Enter elegir · Esc cerrar».

- **`q` es local al overlay.** El `search` global queda solo para el filtro de la tabla Empresas:
  escribirlo desde aquí reordenaría las tablas de otros tableros.
- Con `q` vacío pide los grupos (`universeKey({ unit: "group", q, limit: 500, offset: 0 })`,
  `keepPreviousData`); con `q` pide además las 50 empresas que casan (`unit: "company"`, `sort:
  "score"`) y las añade detrás como filas de nivel 1 con su `group_name`, bajo una cabecera
  «Empresas» cuando hay de las dos clases. Una empresa que ya cuelga de un grupo desplegado no se
  repite. Las filiales de un grupo desplegado llegan por `useGroupChildren` y `flattenTree`, como
  en Empresas.
- Pinta el **mismo `CompanyTree`** que el panel Empresas (§7), con `columns="compact"` (nombre ·
  Score · Δ1m · 12 m · estrella) y `label="Resultados"`. **Elegir una filial escribe `select` y
  elegir un grupo escribe `selectGroup`; las dos cosas cierran.** El ▸ y `→` solo despliegan.
- Teclado desde el input: `↓` baja a la fila con `tabIndex 0`, Enter elige el primer resultado
  (`preventDefault`: al cerrar el foco vuelve al disparador y no debe pulsarlo) y `↑` desde la
  primera fila devuelve el foco al input (`onExitTop`).
- Estados: `TableSkeleton` compacto, `ErrorState` «las empresas y grupos» con reintento de las
  dos consultas, «Sin resultados».

**Pestañas (`components/DashboardTabs.tsx`).** Una `button[role="tab"]` por
`[...FIXED_DASHBOARDS, ...tableros de usuario]`, 14 px / 600 y 32 px de alto (`--size-segment`):
la activa en `--content-primary` con `aria-selected`, las demás en secundario; hover con escala
1,02 y cambio de color, pulsación a 0,97; clic → `setActiveDashboard`. Entre «Investigación» y
el primer tablero de usuario hay un separador de 1 px (`border-l border-border-glass`). Solo los
tableros de usuario se renombran y se quitan:

- **Doble clic** abre un `input[aria-label="Nombre del tablero"]` inline con el nombre
  seleccionado; Enter y perder el foco confirman, Escape cancela. El id en curso vive en un `ref`
  además de en el estado: un `blur` tardío tras cancelar no reabre la confirmación.
- La pestaña activa de usuario lleva una `X` de 16 px, `aria-label="Quitar tablero <nombre>"`
  (`removeDashboard`, sin confirmación). «Empresa» e «Investigación» no ofrecen nada de esto: el
  store ya los protege.
- **«Añadir página»**: botón `Plus` de 24 × 24, `aria-label="Añadir página"`, `transition-transform`
  de 200 ms (el `transform .2s` del botón homónimo de Trade Republic); `disabled` con
  `title="Máximo 8 tableros"`. Al pulsar, `createDashboard()` crea «Tablero N», lo activa y entra
  en renombrado con el nombre preseleccionado.

**«Añadir widget» (`components/AddWidgetButton.tsx`).** `disabled` en los fijos
(`title="Este tablero es fijo: crea uno con «Añadir página»"`) y con cuatro widgets
(`title="Máximo 4 widgets por tablero"`). Envuelve `WidgetCatalog` como popover anclado a la
derecha; el clic fuera lo cierra y Escape lo cierra devolviendo el foco al botón (patrón
`FilterPill`).

### La ruta (`routes/dashboard.tsx`)

```tsx
const dashboard = useActiveDashboard();
return <Grid key={dashboard.id} dashboard={dashboard} locked={isFixedDashboard(dashboard.id)} />;
```

Un solo lienzo para todo: los fijos pasan por el mismo `Grid` que los tableros de usuario, con
`locked`. `key` remonta el lienzo al cambiar de tablero: maximizado y medida arrancan de cero y
los widgets entran escalonados otra vez. La ruta no tiene rejilla propia.

**Arranque (`App.tsx`).** `import "@/widgets/register-all"` puebla el registro como efecto de
importación y, con el catálogo ya lleno, `loadFromStorage((type) => getWidget(type) !==
undefined)` carga los tableros persistidos descartando los widgets de tipo desconocido;
`loadWatchlist()` carga los favoritos (§6).

## 2. El modelo (`dashboard/types.ts`, `dashboard/fixed/`, `dashboard/store.ts`)

```ts
type LayoutItem = { i: string; type: string; x: number; y: number; w: number; h: number; entity: string | null };
type Dashboard = { id: string; name: string; layout: LayoutItem[] };
type DashboardsState = { version: number; active: string; dashboards: Dashboard[] }; // solo de usuario
```

| Constante | Valor | Nota |
| --- | --- | --- |
| `GRID_COLUMNS` × `GRID_ROWS` | 24 × 24 | celdas del modelo; las columnas deben cuadrar con `--grid-cols` |
| `MAX_WIDGETS_PER_DASHBOARD` | 4 | por tablero de usuario |
| `MAX_DASHBOARDS` | 8 | tableros de usuario; los fijos no cuentan |
| `FIXED_DASHBOARD_IDS` | `["empresa", "investigacion"]` | ids reservados: ningún tablero de usuario puede llevarlos |
| `STORAGE_KEY` / `STORAGE_VERSION` | `xray.dashboards.v1` / `1` | `localStorage` |

**Los fijos son presets, no estado.** Viven en `dashboard/fixed/` (`empresa.ts`,
`investigacion.ts`, `index.ts`): `FIXED_DASHBOARDS = [EMPRESA, INVESTIGACION]`,
`DEFAULT_DASHBOARD_ID = "empresa"`, `isFixedDashboard(id)` y `fixedDashboard(id)`. Son objetos
únicos (snapshot estable para `useSyncExternalStore`), con `entity: null` en todos los items:
cada widget sigue a la selección.

| Tablero | Item | Tipo | Celdas (`x, y, w, h`) |
| --- | --- | --- | --- |
| **Empresa** | `empresa-research` | `research` | `0, 0, 12, 24`: mitad izquierda, toda la altura |
| | `empresa-deep` | `research-deep` | `12, 0, 12, 24`: mitad derecha, toda la altura |
| **Investigación** | `inv-treemap` | `treemap` | `0, 0, 8, 13` |
| | `inv-companies` | `companies` | `8, 0, 10, 13` |
| | `inv-favorites` | `favorites` | `18, 0, 6, 13` |
| | `inv-portfolio` | `portfolio` | `0, 13, 8, 11` |
| | `inv-compare` | `compare` | `8, 13, 10, 11` |
| | `inv-alerts` | `alerts` | `18, 13, 6, 11` |

«Investigación» cubre la rejilla en dos filas (13 + 11) sin solapes; a 1440 × 900 (fila de
26 px) cada widget deja un cuerpo de al menos 300 px, y cada item respeta el `minSize` de su tipo
registrado (`dashboard/fixed/fixed.test.ts` lo fija contra el registro completo).

Ninguna mutación los toca, no se persisten y `selectActiveDashboard` los resuelve por id
(`usuario ?? fixedDashboard(active) ?? EMPRESA`). Los tableros de usuario viven en `dashboards`;
`active` puede ser un id fijo o el de uno de ellos, y sí se persiste.

**Sin migración de `xray.dashboards.v1`.** Al quitar «Principal» (`"main"`) `STORAGE_VERSION`
sigue en 1 porque `sanitize` ya hacía lo que una migración haría: un `active` que no apunta a un
tablero superviviente ni a un fijo cae a `DEFAULT_DASHBOARD_ID`, y un tablero de usuario con id
reservado se descarta. Los tableros de usuario persistidos en XR-031 se conservan tal cual, y
subir la versión los habría borrado a cambio de nada.

**Lectura.** `getState`, `subscribe`, `useDashboards(selector)` (`useSyncExternalStore`; el
selector devuelve primitivas o referencias del estado), `useActiveDashboard()`,
`widgetCount(state)`, `canAddWidget(state)` (`!isFixedDashboard(active) && count < 4`).

**Mutaciones de widgets**, todas no-op (o `null`) sobre un tablero fijo:

| Acción | Qué hace |
| --- | --- |
| `addWidget({type, w, h, entity?}) → id \| null` | primer hueco libre (de arriba abajo, de izquierda a derecha); `null` con cuatro widgets |
| `moveWidget(i, {x, y})` | `x` recortado a `[0, 24 − w]`, `y ≥ 0`; empuja hacia abajo lo que solape y compacta |
| `resizeWidget(i, {w, h}, min?)` | respeta `minSize`, `x + w ≤ 24` (el ancho crece a la derecha; solo si el mínimo no cabe se desplaza `x`); sin techo en `y + h` |
| `duplicateWidget(i) → id \| null` | copia con la misma `entity` en el primer hueco; `null` con cuatro |
| `removeWidget(i)` | quita y compacta |
| `setWidgetEntity(i, entity)` | solo cambia ese item; no compacta |

El motor de rejilla es el «vertical compact» de react-grid-layout escrito a mano: el item movido
gana su sitio, `pushDown` baja en cascada lo que solapa (cada empujón deja al desplazado
estrictamente por debajo, así que la cascada no vuelve sobre sus pasos) y `compact` hace flotar
todo hacia arriba por `y` y luego `x`.

**Tableros.** `createDashboard(name?) → id | null` (`null` con ocho; nombre `Tablero N` por el
contador; activa el creado), `renameDashboard(id, name)`, `removeDashboard(id)` (si era el
activo, `active` vuelve a `"empresa"`), `setActiveDashboard(id)` (admite los fijos; ignora ids
desconocidos). Sin reordenar, sin presets. Los ids son deterministas (`w1…`, `d1…`) para que los
tests no dependan de `randomUUID`; `syncCounters` los pone al día tras cargar.

**Persistencia.** Cada mutación del usuario llama a `persist()` (`setItem` con `try/catch`: en
modo privado los tableros siguen vivos en memoria); cargar o reiniciar el store no persiste.
`loadFromStorage(isKnownType)` trata el JSON como no confiable:

| Entrada | Resultado |
| --- | --- |
| Sin clave, JSON corrupto o `version ≠ 1` | estado por defecto (`active: "empresa"`, sin tableros) |
| Tablero sin `id` string, con id reservado (`empresa`, `investigacion`), sin `layout` array o con nombre vacío | se descarta el tablero |
| Nombre de más de 40 caracteres | se recorta (`MAX_NAME_LENGTH`) |
| Item sin `i`/`type` string, con tipo desconocido, celdas no enteras, `x + w > 24` o `entity` que no es string ni `null` | se descarta **solo ese item**, no se recorta |
| `i` o `id` repetidos | se conserva el primero |
| Más de cuatro items | se corta a cuatro y se compacta |
| `active` que no es un fijo ni apunta a un tablero superviviente (el viejo `"main"` incluido) | `"empresa"` |

## 3. La rejilla (`dashboard/grid-math.ts`, `dashboard/Grid.tsx`)

### Medidas (`grid-math.ts`)

Aritmética pura entre píxeles y celdas, sin React, con su test al lado.

| Función | Qué devuelve |
| --- | --- |
| `gridMetrics()` | `--grid-cols` y `--grid-gap` leídos **una vez** con `getComputedStyle`; sin hoja (jsdom) cae a `24 / 8` |
| `columnWidth(W)` | `(W − 2 · 16 − gap · 23) / 24`, nunca menor que 1 |
| `rowHeight(H)` | `max(20, floor((H − 2 · 16 − gap · 23) / 24))`: a 840 px son 26 px; a 600, el mínimo de 20 |
| `pixelsToCells(dx, dy, colWidth, rowPx)` | redondeo de `dx / (col + gap)` y `dy / (row + gap)` |
| `cellStyle(item)` | `gridColumn: "x+1 / span w"`, `gridRow: "y+1 / span h"` |

**La altura de fila no es un token: se deriva del alto del lienzo** para que las 24 filas llenen
la página, como en Trade Republic (`grid-auto-rows` = alto útil / 24). El lienzo la escribe inline
en `--grid-row`; el `31px` declarado en `index.css` es solo el fallback sin JS. `GRID_PADDING`
(16) sigue en píxeles porque el sistema publica `--widget-padding` pero ningún token para el
margen interior del lienzo. Por debajo de `MIN_ROW_HEIGHT` (20 px) una fila no cabe una línea de
texto: entonces scrollea el lienzo.

### El lienzo (`Grid.tsx`)

`Grid({dashboard, locked, className})`. Un `div[data-grid]` con `display: grid`,
`repeat(var(--grid-cols), minmax(0, 1fr))` × `repeat(24, var(--grid-row))`, `gap: var(--grid-gap)`,
padding 16 y `h-full overflow-auto relative`. Se mide con `ResizeObserver` dentro de un
`useLayoutEffect`, nunca con la ventana: el lienzo no ocupa toda la ventana y hay que conocer la
fila antes del primer pintado. Cada item es un `div[data-grid-item]` con `cellStyle`, que envuelve
un `WidgetFrame` (§4) y, si se puede editar, el asa de resize.

`editable = !locked && !stacked`. Solo en ese caso el item es `role="group"`, entra en el orden de
tabulación, lleva `aria-label` con el título del widget y `title` con la pista de teclado.

| Gesto | Qué pasa |
| --- | --- |
| `pointerdown` en la cabecera (`[data-widget-drag-handle]`) | arranca **mover**, salvo que el destino sea `button`, `input` o `[role=menu]`: los controles de la cabecera son suyos |
| `pointerdown` en el asa (`[data-resize-handle]`) | arranca **redimensionar** |
| `pointerdown` en el cuerpo | nada: el puntero es del contenido y su `click` llega |
| durante el gesto | solo cambia un `transform` (mover) o `width`/`height` en `calc` (redimensionar); el item pasa a `z-10`; el store no se toca |
| `pointerup` | `pixelsToCells` y **una sola** escritura en el store (`moveWidget` / `resizeWidget` con `minSize`); si el desplazamiento en celdas es 0, nada |

**Asentamiento.** Al soltar, el residuo entre el punto de suelta y la celda que el store acabó
dando (compactada, recortada al borde: se mide contra el layout resultante, no contra el que pidió
el puntero) se aplica como `transform` y se lleva a `none` en el siguiente `requestAnimationFrame`
con `transition-transform` de 200 ms y `--ease-enter`: el widget se asienta en su celda en vez de
saltar. La transición solo vive en reposo (durante el gesto el `transform` sigue al puntero) y
lleva `motion-reduce:transition-none`. Sin muelles.

**Teclado** (con el foco en el contenedor del item; dentro mandan los controles):

| Tecla | Acción |
| --- | --- |
| Mayús + flechas | mueve una celda |
| Mayús + Alt + flechas | redimensiona una celda, respetando `minSize` |
| Intro | maximiza |
| Escape | restaura: lo escucha `document`, así que funciona también en los fijos y en modo apilado, donde el item no recibe el foco; un Escape ya consumido (`defaultPrevented` por un menú, un selector o un `Dialog`) no cuenta |

**Maximizar** es estado local, no va al store y no se persiste. Vale también en los fijos: el item
pasa a `absolute inset-4 z-[var(--z-overlay)]` y los demás se ocultan (`hidden`). Si el widget
maximizado se quita, el maximizado se deshace solo (derivado, no efecto).

**Asa de resize.** Botón de 12 × 12, `aria-label="Redimensionar widget"`, en la esquina inferior
derecha con `cursor-se-resize`; `opacity-0` hasta el hover del widget o el foco visible; ausente
con `locked`, apilado o maximizado.

**Modo apilado (`< 1280 px`).** `useMediaQuery("(max-width: 1279.98px)")` (`lib/use-media-query.ts`,
`useSyncExternalStore` sobre `matchMedia`; `false` sin `matchMedia`): una columna,
`grid-auto-rows: minmax(360px, auto)`, orden `(y, x)`, sin arrastre ni resize. El arrastre en
celdas no tiene sentido sin la rejilla.

**Tablero vacío.** `EmptyState` «Este tablero está vacío» / «Añade hasta 4 widgets desde «Añadir
widget», arriba a la derecha.».

## 4. El marco `WidgetFrame` (`widgets/WidgetFrame.tsx`)

| Prop | Tipo | Nota |
| --- | --- | --- |
| `item` | `LayoutItem` | el item del layout; el tipo se resuelve en el registro |
| `locked` | `boolean` | tableros fijos: sin asa, sin menú, «Elegir empresa» deshabilitado |
| `isMaximized` / `onMaximize` | `boolean` / `() => void` | el estado lo lleva el lienzo |
| `index` | `number` | posición en la entrada escalonada |

Lo que pinta:

- `section[role="region"]` con `aria-labelledby` al `h2`, para que el lector de pantalla salte
  entre widgets. **Glass**: la clase exacta del `Panel` de XR-030 más `h-full`
  (`bg-surface-glass`, borde inset de 1 px `--border-glass`, `backdrop-blur-[var(--blur-glass)]`,
  radio `--radius-card`, `px-4 pb-4`, `overflow-hidden`).
- **Cabecera de 32 px** (`--size-row`): un `div[data-widget-drag-handle]` (no `header`:
  testing-library lo contaría como segundo `banner` de la página) con `cursor-grab` solo si
  `!locked`; `h2` con el título del registro a `--text-panel-title` (14 px) / 600, truncado; a la
  derecha, botones de **24 × 24** (`--radius-control`, secundario, hover `bg-surface-glass-hover`
  + escala 1,02 bajo `hover:hover`, pulsación 0,97):

| Botón | Cuándo | Qué hace |
| --- | --- | --- |
| «Elegir empresa» | solo si `definition.needsEntity` | `CompanyPicker` con `allowFollow`: muestra el nombre de la empresa fijada (`useCompanyName`: `companyKey(id)` con `select` al nombre, así comparte caché con Investigación) o «Selección» con `Link2` cuando `entity === null`; elegir escribe `setWidgetEntity(i, id)` y «Seguir la selección global» vuelve a `null`. Con `locked`, un botón deshabilitado con `title="En un tablero fijo la ficha sigue la selección"` |
| «Maximizar widget» / «Restaurar widget» | siempre | `onMaximize` |
| «Menú del widget» | **oculto si `locked`** | `EllipsisVertical`, `aria-haspopup="menu"`, `aria-expanded`; abre `div[role="menu"][aria-label="Acciones del widget"]` de 160 px, `bg-surface-elevated`, `animate-menu-enter origin-top-right`, con «Duplicar» (`disabled` + `title="Máximo 4 widgets por tablero"` si `!canAddWidget`) y «Quitar» (en `--content-negative`, sin confirmación) |

- El menú es un `role="menu"` a mano, sin Radix (frágil en jsdom). Escape lo cierra y devuelve el
  foco al botón, con `stopPropagation` para que el lienzo no restaure a la vez un maximizado; el
  clic fuera lo cierra sin devolver el foco.
- **La entidad se lee del store, no de la prop.** El marco es quien la escribe y debe verse al
  instante aunque el lienzo aún no haya repintado el item; el contenido recibe el item «vivo».
- **Entrada escalonada**: `animate-panel-enter` con `animationDelay: index · 40 ms` y
  `motion-reduce:animate-none`.
- Cuerpo `div.min-h-0.flex-1` con `definition.component` (`{ item }`). Tipo desconocido → región
  «Widget desconocido» con `p[role="alert"]` «Tipo de widget desconocido».

Lo que **no** hace, y es a propósito: sin hover de borde ni escala en el marco (el marco no es un
control, los botones sí); no consulta datos de negocio ni pinta estados de carga, vacío o error:
eso es del contenido. `panels/Panel.tsx` se borró: este es el único marco.

## 5. El registro y el catálogo

### El registro (`widgets/registry.ts`, `widgets/register-all.ts`)

```ts
type WidgetDefinition = {
  type: string; title: string; description: string;
  defaultSize: { w: number; h: number }; minSize: { w: number; h: number };
  needsEntity: boolean;               // el marco ofrece «Elegir empresa»
  thumbnail: ComponentType;           // 60 × 30 para el catálogo
  component: ComponentType<{ item: LayoutItem }>;
};
```

`registerWidget`, `getWidget` y `listWidgets` sobre un `Map`: **el orden de registro es el orden
del catálogo**. `register-all.ts` registra los nueve como efecto de importación; Empresas,
Investigación y Comparativa reutilizan los paneles de `panels/` y los otros seis viven en
`widgets/<type>/`.

| `type` | Título | Descripción | Por defecto | Mínimo | `needsEntity` | Componente |
| --- | --- | --- | --- | --- | --- | --- |
| `companies` | Empresas | Tabla del universo por grupos, con score, Δ y régimen. | 12 × 24 | 8 × 10 | no | `CompaniesPanel` |
| `research` | Investigación | Ficha de la empresa seleccionada o fijada. | 12 × 14 | 8 × 10 | sí | `ResearchPanel entity={item.entity}` |
| `research-deep` | Investigación profunda | Estadísticas clave por familia, metodología e informe de Health. | 12 × 24 | 8 × 12 | sí | `ResearchDeepWidget` |
| `compare` | Comparativa | Dos empresas en una sola gráfica. | 12 × 10 | 8 × 6 | no | `ComparePanel` |
| `alerts` | Alertas | Bandeja de alertas del motor, la más reciente arriba. | 8 × 12 | 6 × 6 | no | `AlertsWidget` |
| `treemap` | Mapa | Treemap por grupo: tamaño cobros 12 m, color Δ3m. | 12 × 12 | 8 × 8 | no | `TreemapWidget` |
| `group` | Grupo | El grupo de la empresa seleccionada y sus filiales. | 12 × 12 | 8 × 8 | sí | `GroupWidget` |
| `favorites` | Favoritos | Empresas y grupos marcados con estrella. | 6 × 13 | 6 × 6 | no | `FavoritesWidget` |
| `portfolio` | Cartera | Posiciones simuladas: importe, score y tendencia. | 8 × 11 | 6 × 6 | no | `PortfolioWidget` |

**Miniaturas (`widgets/thumbnails.tsx`).** Nueve SVG de 60 × 30 (`aria-hidden`) que sugieren la
forma de cada tipo, solo con `currentColor` y `var(--content-*)`: heredan el color del texto de
la tarjeta y no fijan ningún literal.

### El catálogo (`dashboard/WidgetCatalog.tsx`)

Popover `div[role="menu"][aria-label="Añadir widget"]` que abre `AddWidgetButton`: ancho
`--size-popover-w` (320 px: cada fila lleva miniatura + título + descripción, y a 250 se
recorta), `max-h-[350px] overflow-y-auto`, radio `--radius-card`, `bg-surface-elevated` con borde
inset glass, `absolute top-full right-0 mt-1 z-[var(--z-popover)]`, `animate-menu-enter
origin-top-right motion-reduce:animate-none`.

Una fila `button[role="menuitem"]` de 44 px por tipo registrado (nueve): miniatura de 60 px,
título a `--text-control` / 600 y descripción a `--text-micro` en secundario; hover
`bg-surface-glass-hover` + escala 1,02 (es una tarjeta interna, no un widget); `aria-disabled` +
`opacity-40` cuando `!canAddWidget`.

Teclado: el foco entra en la primera fila al abrir; ↑/↓ cíclicos, Home y End; Enter y Espacio
añaden por el clic nativo del botón; Escape y el clic fuera los gestiona `AddWidgetButton`, que
devuelve el foco al disparador. Al añadir: `addWidget({ type, ...defaultSize })`; si devuelve
`null`, un `p[role="status"]` «Máximo 4 widgets por tablero»; si no, el menú se cierra.

## 6. Selección y watchlist (`dashboard/selection.ts`, `dashboard/watchlist.ts`)

### La selección

Un solo objeto inmutable en memoria y suscripción con `useSyncExternalStore`, como `store.ts`.
Existe porque la selección cruza los widgets y ninguno es dueño de ella.

```ts
type SelectedEntity = { kind: "company" | "group"; id: string };
type SelectionState = {
  selected: string | null;
  selectedGroup: string | null;
  selectedEntity: SelectedEntity | null;     // lo último elegido, empresa o grupo
  compare: [string | null, string | null];   // slots A y B
  search: string;
};
```

| Campo | Quién escribe | Quién lee | Regla |
| --- | --- | --- | --- |
| `selected` | Buscador central (filial); Empresas (clic o Enter en una filial o fila plana); Alertas, Mapa, Grupo, Favoritos, Cartera y las filiales de Investigación profunda (clic en una fila o tile) | Comparativa (A cuando no está fijada); Grupo (grupo de la seleccionada); Empresas, Alertas, Grupo, Favoritos y Cartera (fila marcada) | un solo id o `null`; seleccionar **no** toca `compare` |
| `selectedGroup` | Buscador central (grupo); Empresas (clic o Enter en una fila de grupo, que además la despliega); Favoritos (fila de grupo) | Grupo (`entity ?? selectedGroup ?? …`); Empresas (fila de grupo marcada) | un solo id o `null` |
| `selectedEntity` | **derivada**: `select(id)` la pone a `company`, `selectGroup(id)` a `group`; `select(null)` / `selectGroup(null)` solo la vacían si apuntaba a esa clase | Investigación e Investigación profunda (vía `resolveEntity`); `SearchTrigger` (nombre en el disparador) | lo último elegido, sea empresa o grupo; `selected` y `selectedGroup` siguen para los widgets que solo entienden una clase |
| `compare` | Comparativa (`setCompareSlot` desde los dos `CompanyPicker` y «Quitar») | Comparativa | `[A, B]`; **A vacío sigue a `selected`**; `setCompareSlot(slot, id)` vacía el otro slot si ya tenía ese id: **nunca A = B** |
| `search` | el filtro de la tabla Empresas | Empresas | el buscador central tiene su `q` local y no lo toca |

`resolveEntity(pinned, selectedEntity)` es la regla para un widget que acepta empresa o grupo: con
`item.entity` fijado, `GROUP_…` es grupo y cualquier otro id es empresa (`lib/entity.ts`:
`kindOf`, `isGroupId`); con `null`, la entidad global.

Acciones: `select`, `selectGroup`, `setCompareSlot(0 | 1, id | null)`, `clearCompare`,
`setSearch`, `resetSelection`. Lectura: `useSelection(selector)`; el selector devuelve primitivas
o referencias del estado, nunca un objeto nuevo por render.

**No persiste.** Ni `localStorage`, ni servidor, ni URL: el demo arranca siempre limpio. Lo que
sí persiste es el layout (§2) y la watchlist, cada uno por separado.

### La watchlist

Los favoritos (empresas o grupos) son una lista de ids en orden de inserción, en memoria con
`useSyncExternalStore` y persistida bajo `xray.watchlist.v1` (`{ version: 1, favorites }`), como
los tableros. La cartera es la constante `PORTFOLIO` (`{ id, amount }[]`, seis empresas en EUR
por importe descendente): XR-032 no la edita ni la persiste.

| Qué | Detalle |
| --- | --- |
| `DEFAULT_FAVORITES` | `COMP_0007, COMP_0001, COMP_0004, COMP_0003, COMP_0002, GROUP_0147`: las cinco empresas con informe de Health y un grupo de tres filiales |
| `ENTITY_ID` | `/^(COMP\|GROUP)_\d{4}$/`: lo que no casa se descarta al cargar |
| `toggleFavorite(id)` | añade al final o quita; persiste en los dos casos (`try/catch`: en modo privado sigue en memoria) |
| `isFavorite`, `useIsFavorite(id)`, `useWatchlist()`, `getWatchlist`, `subscribe` | lectura |
| `loadWatchlist()` | sin clave, JSON corrupto o versión ajena → la semilla **sin escribirla** (quien vacía la lista y recarga la encuentra vacía, no resembrada); con forma → los ids válidos, sin duplicados y con tope 50, aunque sean ninguno |
| `resetWatchlist(ids?)` | reinicia en memoria sin tocar `localStorage` (tests) |

La estrella es `components/FavoriteStar.tsx`: botón de 20 px con `Star` de 14, `aria-pressed`,
`aria-label` «Añadir a favoritos» / «Quitar de favoritos», `title` con el nombre; rellena en
primario cuando está marcada, contorno secundario cuando no; `stopPropagation` (no selecciona la
fila) y `tabIndex -1` (la fila ya es el control de teclado). Hover a 1,10; el relleno no anima.

## 7. Los nueve widgets

Todos consumen la API v2 por `lib/api-v2.ts` con React Query y las claves de `lib/query-keys.ts`
(`companyKey`, `companySignalsKey`, `companyTimelineKey`, `groupKey`, `universeKey`, `alertsKey`,
`treemapKey`, `pickerKey`, `metaKey`, `catalogKey`, `reportKey`: dos widgets que piden lo mismo
comparten caché solo si escriben la misma clave), importan las gráficas solo de `@/charts`,
traducen régimen y banda con `lib/regime.ts` y las etiquetas cortas y definiciones con
`lib/definitions.ts`. Cada uno tiene su test al lado, que es lo que ejecuta el check.

### Empresas por grupos (`panels/companies/CompaniesPanel.tsx`, `CompanyTree.tsx`, `useGroupChildren.ts`, `tree.ts`)

El «Research» de Trade Republic sobre `/api/v2/universe`, **por grupos**: `unit: "group"` por
defecto pide hasta 500 grupos en una sola página (`limit 500, offset 0`, sin paginador) y cada
grupo desplegado pide `/groups/:id` (`useGroupChildren`: `useQueries` con `groupKey`, reducido a
`{ children, failed, retry }`) y mete sus `companies[]` como filas hijas sangradas. `tree.ts` es
aritmética pura: `flattenTree(groups, expanded, children, failed)` produce la lista `TreeRow`
(`group` · `company` · `loading` · `error` · `section`) que recorre el virtualizador, y
`pageSizeFor(alto, 28)` (`clamp(floor(alto / 28), 10, 500)`) da la página de la vista `Empresa`,
medida con `ResizeObserver` sobre el `rowgroup` que scrollea (600 px → 21); otro tamaño de página
vuelve a `offset 0`.

Desde XR-032 el panel está partido en dos: **`CompaniesPanel`** conserva la consulta, las pills,
la unidad, el filtro, el paginado y decide qué hace Enter sobre un grupo (lo despliega **y** lo
selecciona); **`CompanyTree`** es la retícula tonta (treegrid o tabla plana, virtualizador,
`ItemCells`, `SortableHeader`, `TableSkeleton`, roving tabindex, teclado) y la comparte con el
buscador central, donde Enter sobre un grupo solo lo elige. Props: `rows`, `treeView`,
`expanded`, `onExpand`, `onCollapse`, `selected`, `selectedGroup`, `onPickCompany`,
`onPickGroup`, `onRetryGroup`, `onExitTop?`, `sort?` (sin él las cabeceras no son botones),
`scrollRef?`, `label?`, `columns?: "full" | "compact"`.

La consulta sigue siendo un solo objeto y la clave de React Query; el servidor ordena y filtra;
`keepPreviousData` evita el parpadeo a esqueleto. Controles glass de 32 px: filtro (`aria-label=
"Filtrar empresas"`, escribe el `search` del store), `FilterPill` Banda y Régimen, `FilterPill`
Grupo **solo en la vista plana** (el árbol ya agrupa), unidad Empresa / Grupo (`role="group"` con
`aria-pressed`; cambiar de unidad limpia Grupo) y `SortableHeader` con `aria-sort`.

Columnas (cabecera 26 px en micro secundario, fila 28 px, gap 8; el nombre conserva ≥ 280 px a
668 px útiles):

| Columna | Ancho | Fila de grupo | Fila de filial |
| --- | --- | --- | --- |
| Desglose | 16 | `ChevronRight` que gira 90° (`aria-label="Desplegar/Plegar <nombre>"`) | vacío; la fila lleva `pl-6` |
| Grupo / Empresa | resto | punto de alerta de 6 px + sr-only «Alerta» si `alert`; nombre 13 px; `title="<nombre> · <id>"` | igual |
| n | 28 | `n_companies_scored` | `—` |
| Score (ordenable) | 56 | punto de banda de 6 px (`bg-band-*` + sr-only) y una decimal con coma, sin unidad | igual |
| Δ1m / Δ3m (ordenables) | 52 / 52 | `fmtDelta` sin ` pts`; Δ3m solo desde 656 px de contenedor | igual |
| Régimen | 88 | `REGIME_LABEL` coloreado, solo desde `@3xl` (768 px) | igual |
| 12 m | 64 | `Sparkline` + sr-only del régimen | igual |
| Conf. | 36 | `fmtConfidence` | igual |
| Operativa 12 m | 76 | `fmtSizeShort(op_in_12m_eur, "EUR")`, solo desde `@3xl` | `—` |
| Favorito | 20 | `FavoriteStar` (§6), `columnheader` sr-only «Favorito» | igual |

**La estrella va en todas las filas y en todas las variantes**: `opacity-0` en reposo y visible
al pasar el ratón por la fila (`group-hover/row`), al enfocarla, cuando está marcada
(`aria-pressed`) o sin puntero (`hover: none`). La variante `compact` (buscador) deja nombre ·
Score · Δ1m · 12 m · estrella. Fuera: Id, el texto de Grupo, el texto de Banda y el botón
«Comparar». Las columnas se ocultan por `@container`, no por ancho de ventana; nada se solapa y
nada desplaza en horizontal. En la vista `Empresa` no hay Desglose, `n` ni Operativa (serían
columnas enteras de `—`).

A11y y teclado: `role="treegrid"` (`table` en la vista plana) con `aria-label="Empresas"`; filas
`role="row"` con `aria-level` 1 | 2, `aria-expanded` en grupos y `aria-selected`; celdas
`gridcell`. Roving tabindex sobre la lista aplanada (si la fila trackeada se desmonta por el
scroll, la primera montada hereda el `tabIndex=0`). `Enter` o clic activan: un grupo se despliega
**y** escribe `selectedGroup`; una filial escribe `selected`. `→` despliega (o pasa el foco al
primer hijo), `←` pliega (o sube al padre), `↑/↓/Home/End` como siempre, **`f` alterna el
favorito de la fila enfocada sin tocar la selección**; si la fila destino no está montada, el
virtualizador se desplaza hasta ella y un efecto la enfoca en cuanto exista.

Estilo de fila: hover `bg-surface-glass` solo bajo `hover:hover`; filial seleccionada
`bg-fills-accent-thin`; grupo seleccionado `bg-surface-glass-hover`. Sin `backdrop-blur` en las
filas. Nada escala.

| Estado | Qué se ve |
| --- | --- |
| Carga | `TableSkeleton`: ocho filas de 28 px con una barra glass por columna, `aria-busy`, sr-only «Cargando empresas» |
| Error | `ErrorState` con «Reintentar» |
| Vacío | «Ninguna empresa cumple los filtros» |
| Filiales cargando | fila hija «Cargando filiales…» con una barra glass |
| Filiales en error | fila hija «No se pudieron cargar las filiales · Reintentar» (relanza solo esa consulta) |
| Paginado (solo `Empresa`) | «1-21 de 1286 · Anteriores · Siguientes» cuando `total > filas` |

### Investigación (`panels/research/ResearchPanel.tsx`, `SheetHeader`, `SheetChart`, `MetricMenu`, `KpiRow`, `TopDrivers`, `GroupSheet`, `series.ts`, `hover.ts`, `forecast.ts`)

`ResearchPanel({ entity = null })` resuelve `resolveEntity(entity, selectedEntity)`: en los fijos
`entity` es siempre `null`; en un tablero de usuario la fija «Elegir empresa» del marco. Sin
entidad: «Selecciona una empresa o un grupo en el buscador». Con un grupo pinta `GroupSheet`;
con una empresa, `CompanySheet`. **Rango y métrica viven fuera del contenedor `key={id}`** y
sobreviven al cambio de entidad: quien compara a 6M no quiere volver a 1A. Consultas:
`companyKey` (cabecera, gráfica, pilares, drivers), `companyTimelineKey` (serie, pilares por mes,
confianza y outlook por mes) y `companySignalsKey` **solo con una familia activa**.

De arriba abajo, en un contenedor con `data-company` que entra con `animate-crossfade`:

1. **Cabecera (`SheetHeader`)**: nombre (14 px / 600, truncado) y, a la derecha, un
   `dl[aria-live="polite"]` con **cuatro KPIs**: «Score» (`fmtPoints`, `.num`), «Δ 1A» (o el
   rango activo: `rangeDelta`, puntos entre el primer mes visible y el mes activo o el corte,
   `fmtDelta` con tono; `null` = `—` con menos de dos puntos), «Confianza» (`fmtConfidence`) y
   «Outlook 6 m» (`fmtPoints(outlook.h6)`). Sin régimen, banda ni titular.
2. **Gráfica (`SheetChart`)**: una fila `flex justify-between` con `Segmented` «Rango» (3M · 6M ·
   1A · Máx → 4, 7, 13, todos los meses; 1A por defecto) a la izquierda y `MetricMenu` a la
   derecha; debajo `LineNoAxes` con **la timeline completa más `from`** (el primer mes visible),
   en una caja fija de `CHART_HEIGHT` (168) + `AXIS_HEIGHT` (16) para el eje de fechas (medirla
   retroalimenta), con `activeMonth`, `tooltip={false}` y `onHover`.
   - **Health score** (`scoreChart`): serie coloreada por régimen, baseline en el primer punto
     visible, `forecast` de `buildForecast(as_of, score, outlook)` y marcadores de alerta (si cae
     en el rango) y techo (en el corte).
   - **Una familia** (`pillarChart`): `100 · P_k` en pts con el token del pilar
     (`PILLAR_TOKEN`) y **el score fantasma detrás** (`--content-disabled`, sin régimen), sin
     banda ni marcadores; baseline en el primer valor visible del pilar.
   - Menos de 3 meses (`MIN_HISTORY`): «Historia insuficiente: hacen falta tres meses de score»;
     pilar sin puntos: «El pilar no aplica a esta empresa». El mensaje ocupa la misma caja para
     que la ficha no salte.
3. **`MetricMenu`**: botón glass de 26 px, `aria-haspopup="menu"`, que dice «Health score» o el
   nombre de la familia; abre `div[role="menu"][aria-label="Métrica de la gráfica"]` con seis
   `menuitemradio` (`METRIC_OPTIONS`: Health score · Liquidez · Pago · Cobros · Deuda ·
   Actividad), ↑/↓/Home/End, Enter o Espacio eligen y devuelven el foco, Escape cierra y se lo
   queda (el lienzo también escucha Escape), clic fuera cierra sin devolverlo. Patrón del menú de
   `WidgetFrame`, sin Radix.
4. **Fila de KPIs (`KpiRow`)**: un `dl` a tantas columnas como celdas (`grid-cols-4/5/6`). Cada
   celda: `dt` con `SHORT_LABEL` (≤ 18 caracteres) + `InfoTip` con la definición (§8), `dd` con
   el valor en `.num` a `--text-body` (o **«No aplica»**, nunca un 0) y en micro cuánto ha
   cambiado en el rango activo, con tono: con el Health score son los **cinco pilares** en pts
   (`fmtSignedPoints` de la diferencia entre el primer mes visible y el mes activo o el corte:
   «+2,1 pts · 1A»; peso 0 → «No aplica»); con una familia son **sus señales** con `value_fmt` y
   `rangeChangePct(last, first)` → `fmtPct` («−60,0 % · 1A»; `—` si alguno es `null`, el primero
   es 0 o `!is_available`). `pillarCells` y `signalCells` construyen las celdas; `KpiRow` solo
   pinta.
5. **«Señales» (`TopDrivers`)**, solo con el Health score (con una familia la fila ya lista sus
   señales): `section[aria-label="Señales"]` con un `dl` a tres columnas y **cinco** celdas, los
   `drivers` ordenados por `|contribution|` (`topDrivers`): `SHORT_LABEL` + ⓘ, `value_fmt` grande
   (14 / 600, truncado con `title`) o «No aplica», y `fmtSignedPoints(contribution)` con tono.

**Ni fórmulas ni alerta**: la metodología vive en el pop-up «Cómo se calcula» de Investigación
profunda y la alerta en sus «Estadísticas clave» y en el widget Alertas.

**Hover controlado.** Al pasar el ratón por la gráfica no hay tooltip: `onHover` escribe
`activeMonth` y la cabecera y las celdas pasan a hablar del mes apuntado, con el sufijo
` · MM/AAAA` en el Score. `hover.ts` es aritmética pura: `kpisAt(timeline, month)` da score,
confianza, `outlook_6m` y los pilares de la fila de `/timeline`; `signalAt(signal, month)` da el
punto de `series_24m` o, si el mes no está, las cifras del corte; `groupKpisAt` hace lo mismo con
la timeline de un grupo. Cero peticiones: todo está ya en caché. Al salir, `activeMonth` vuelve a
`null` y las cifras al corte. `series.ts` (puro) pone el resto: `RANGES`, `visibleSlice`,
`rangeDelta`, `rangeChangePct`, `pillarSeries` (×100, omite `null`), `topDrivers`, `groupForecast`.

**Modo grupo (`GroupSheet`).** `groupKey(id)` sobre `/api/v2/groups/:id`, con la misma anatomía:
cabecera consolidada (Score · Δ rango · Confianza **del corte** · Outlook 6 m), gráfica de
`group.timeline` con la proyección de `groupForecast` (h3 interpolado entre el score y
`outlook_6m`) y **sin menú de métrica** (el grupo no publica pilares por mes), y una `KpiRow` de
cuatro cifras sin ⓘ: «Filiales puntuadas», «Dispersión», «Más débil» y «Más fuerte» (nombre de la
filial si viene en `companies`; si no, su id). El hover mueve score, dispersión y filiales
puntuadas.

Estados: `SheetSkeleton` (cabecera, caja de la gráfica y celdas); `ErrorState` con «Reintentar»
para la ficha («la ficha de la empresa»; con 404 «No existe ninguna empresa `<id>` en este
corte.»), la historia («la historia del score») y las señales («las señales», mientras la
cabecera y la gráfica se quedan).

### Investigación profunda (`widgets/research-deep/ResearchDeepWidget.tsx`, `KeyStats`, `PillarSummary`, `SubsidiariesList`, `ActionCards`, `MethodologyDialog`, `ReportDialog`, `useCompanyReport.ts`)

`ResearchDeepWidget({ item })` resuelve `resolveEntity(item.entity, selectedEntity)`. Sin
entidad: «Selecciona una empresa o un grupo» / «La ficha sigue a la selección salvo que el widget
fije una.». Con un grupo, solo `SubsidiariesList`. Con una empresa (`companyKey`), de arriba
abajo: `Segmented` «Familia» (`METRIC_OPTIONS`: Health score · Liquidez · Pago · Cobros · Deuda ·
Actividad; fuera del contenedor `key={id}`: cambiar de empresa no devuelve al score), el cuerpo
con scroll interno (`KeyStats` con el Health score, `PillarSummary` con una familia) y, al pie,
`ActionCards` (`shrink-0`).

- **`KeyStats`** («Estadísticas clave», las de la ficha de Trade Republic): un `dl` a dos
  columnas (`grid-cols-2 gap-x-6`) de celdas de `--size-stat-cell` (56 px), `dt` gris a
  `--text-micro` sobre `dd` blanco a `--text-body` `.num`, en tres grupos con subtítulo micro en
  versalitas. **Score**: Score, Banda, Régimen, Outlook 3 m, Outlook 6 m, Banda outlook, Confianza,
  Warm-up. **Motor**: Base, Penalización («−x pts (Liquidez)» / «sin penalización»), Techo
  («NEGCASH 40» / «sin techo»), Meses de historia, Rama de cobertura, Última alerta («Vigilar ·
  06/2026» / «sin alertas»), Fortalezas. **Empresa**: Grupo (nombre por `groupKey`, o el id),
  País, Moneda, ERP, Operativa 12 m (`fmtSizeShort`), Facturas · Productos, Calidad de caja. Cada
  `dt` con definición en `KPI_DEFINITION` lleva ⓘ; ausentes → `—`, nunca 0.
- **`PillarSummary`**: la línea resumen del pilar («Liquidez · P 0,62 · peso efectivo 0,25 · 4
  de 5 señales disponibles») y `FamilyStats` (conservado de XR-031: `dl` a dos columnas con
  **todas** las señales de la familia, celdas de `--size-stat-row` que escalan 1,02 al hover,
  `value_fmt` o «No aplica», `fmtSignedPoints(contribution)`, `PillarBar`, Δ 1 m y chip de
  `quality_flag`), siempre a las cifras del corte.
- **`SubsidiariesList`** (modo grupo): `groupKey`; `ul[role="listbox"][aria-label="Filiales"]`
  con `SubsidiaryRow` (extraída de `GroupWidget` a `widgets/group/SubsidiaryRow.tsx`: nombre,
  score, Δ1m, `Sparkline`, 28 px); clic o Enter → `select(id)` y la ficha pasa a modo empresa.
  Sin toggle ni tarjetas.
- **`ActionCards`**: dos botones-tarjeta glass (`grid-cols-2 gap-2 pt-3 border-t`, hover 1,02,
  pulsación 0,97) que abren los pop-ups a pantalla completa: **«Cómo se calcula»** (`BookOpen`)
  e **«Informe de Health»** (`Sparkles`). La segunda pide `/companies/:id/report` nada más
  pintarse (`useCompanyReport`: `reportKey`, `retry: false`, `staleTime: Infinity`): con **404**
  queda `disabled` con `title="Informe no disponible para esta empresa"`; cargando, `aria-busy`;
  con informe, el subtexto «Generado el DD/MM/AAAA · modelo»; con otro error sigue activa y el
  diálogo ofrece reintentar.
- **`MethodologyDialog`**: `Dialog size="full" label="Cómo se calcula"` con `DialogHeader`
  visible (título, nombre de la empresa y cerrar) y `Methodology variant="grid"`: `BandScale`
  (`RangeBar variant="segmented"` 0–100 con el score) y `WeightsRow` (cinco `PillarBar` con
  `w_eff`) delante, y los nueve bloques de XR-031 en tarjetas glass a dos columnas. Ningún número
  va escrito: todo sale de `meta.params`, `meta.reference`, `catalog` y la ficha. Señales,
  timeline, meta y catálogo se piden bajo las mismas claves que Investigación: si ese widget ya
  las cargó no hay petición nueva.
- **`ReportDialog`**: cabecera con el chip de `risk_level` («Riesgo bajo / medio / alto» en
  positivo / alerta / negativo), `summary` destacado, `sections` como `h3 + p` a dos columnas
  desde `@3xl`, la lista «Qué vigilar» (`watch_next`) y el pie «Generado el … · modelo …».
  Skeleton mientras llega; error distinto de 404 → `ErrorState` con reintento. El informe es un
  JSON pregenerado por Claude y versionado en `app/api/data/reports/<id>.json` (cinco empresas);
  el resto responde `404 report_not_found`.

Estados del widget: `DeepSkeleton` (toggle, ocho celdas a dos columnas y dos tarjetas, `aria-busy`,
sr-only «Cargando datos»); `ErrorState` «la ficha de la empresa» (404: «No existe ninguna empresa
`<id>` en este corte.»).

### Comparativa A/B (`panels/compare/ComparePanel.tsx`)

`a = compare[0] ?? selected`, `b = compare[1]`. Fila de cabecera (`min-height: --size-row`):
`CompanyPicker` «Empresa A» con clave de color `--chart-score` · «vs» · `CompanyPicker` «Empresa
B» con `--content-accent` y placeholder «Elegir empresa» · botón `aria-label="Quitar <nombre>"`
solo con B (`setCompareSlot(1, null)`); a la derecha, `Segmented` «Rango» (1A por defecto; 3M
deja 4 puntos) y la píldora «Base 100» (`aria-pressed`, `normalize` de la primitiva). Fijar A
desde el picker anula la selección; el panel rechaza además elegir en un slot la empresa que ya se
ve en el otro (el store solo ve los slots fijados, no la seguida): nunca A = B.

**Una consulta por empresa con `useQueries` y `companyKey`**: seleccionar y comparar la misma
empresa no la pide dos veces. **El rango ya no recorta la serie**: `LineNoAxes` recibe las
timelines completas y `from` (calculado sobre la serie más larga), así el número de comandos de
`d` no cambia entre 3M y Máx y la línea se anima; sin forecast, el presente cae en el borde
derecho y el eje de fechas va debajo. La Δ del periodo de la leyenda es siempre en puntos de score
sobre los puntos visibles, también con Base 100. **El color es la identidad del slot, no el
régimen**: los puntos van sin `regime`. La leyenda es inline y la pone el panel (trazo, nombre
truncado a 180 px, Δ o «Historia insuficiente» con menos de 2 puntos). La gráfica conserva el
**tooltip flotante por defecto** con ambos valores del mes (nadie más enseña la cifra) y mide su
alto con `ResizeObserver` (`useChartHeight` resta `AXIS_HEIGHT`), acotado a `[148, 360]`. El
bloque lleva `key` por pareja: cross-fade al cambiar de empresas, nada al cambiar de rango o de
Base 100.

| Estado | Qué se ve |
| --- | --- |
| Sin A | «Elige una empresa en A» (los pickers siguen visibles) |
| Alguna consulta en error | `ErrorState` de la primera fallida, contexto `la empresa <id>`, «Reintentar» relanza solo esa |
| Alguna consulta cargando | `CompareSkeleton`: dos píldoras y una caja de 148 px |
| Serie con menos de 2 puntos | no se dibuja; en la leyenda pone «Historia insuficiente» |

### Alertas (`widgets/alerts/AlertsWidget.tsx`)

`alertsKey({ limit: 50 })` sobre `/api/v2/alerts`, ordenadas con la más reciente arriba (la API
las sirve ascendentes). `div[role="list"]` de filas `button` de 28 px a ancho completo: punto de
8 px (`watch` y `review` → `bg-content-alert`, `urgent` → `bg-content-negative`; sr-only
«Vigilar», «Revisar», «Urgente»), **el nombre de la empresa** (`company_name ?? company_id`) en
micro `.num` con el id en el `title`, mensaje a 12 px truncado con `title`,
`fmtMonth(month_detected)` `.num` a la derecha. Clic → `select(company_id)`; la fila de la empresa
seleccionada lleva `aria-current` y `bg-fills-accent-thin`. Hover solo de fondo.

| Estado | Qué se ve |
| --- | --- |
| Carga | seis filas skeleton, `aria-busy`, sr-only «Cargando alertas» |
| Error | `ErrorState` «las alertas» con «Reintentar» |
| Vacío | «Sin alertas en este corte» / «El motor no ha detectado deterioros que vigilar.» |

### Mapa (`widgets/treemap/TreemapWidget.tsx`)

`treemapKey({ groupBy, metric })` sobre `/api/v2/treemap` con `keepPreviousData`. Mide su hueco
con `ResizeObserver` (callback ref, como `useChartHeight`) y pinta `Treemap` de `@/charts` al
tamaño medido, con `unit="pts"`, `headerHeight={16}` por grupo, `onSelect → select(id)` y
`onHover`; a los tiles les llega `name` y a los grupos `label` y `delta`, así que el mapa imprime
**nombres de empresa** con cuerpo por área y **cabeceras de grupo con nombre y Δ** (la regla de
etiquetas está en `charts.md`). Una sola **línea de estado de 24 px** arriba: a la izquierda, con
hover, `<nombre> · <métrica> <valor>`; sin él, `<n> grupos · <mes> · <m> sin Δ` (los items con
`color_value: null` no se pintan: el contrato prohíbe imputar 0). Sin pie. A la derecha dos
`Segmented`: **«Agrupar»** Grupo · País · ERP (`group_by`; el bucket `unknown` se titula «Sin
dato») y **«Métrica»** Δ3m · Δ1m · Score, que reescriben la consulta.

| Estado | Qué se ve |
| --- | --- |
| Carga | una caja skeleton, sr-only «Cargando mapa» |
| Error | `ErrorState` «el mapa» |
| Vacío | «Sin empresas en este corte» / «El mapa se pinta cuando el universo tiene cobros que repartir.» |

### Grupo (`widgets/group/GroupWidget.tsx`, `SubsidiaryRow.tsx`)

Qué grupo se pinta, por orden: `item.entity` (leído como **id de grupo**), `selectedGroup`, el
grupo de la filial elegida desde este mismo widget (se recuerda para no volver a pedir la ficha) y,
si no, el `group_id` de la ficha de `selected` (`companyKey`, caché compartida con Investigación).
Sin ninguno: «Selecciona una empresa o un grupo» / «El grupo sigue a la selección salvo que el
widget fije uno.». Con id, `groupKey(id)` sobre `/api/v2/groups/:id`:

- Cabecera: nombre 14 px / 600 + `group_id` `.num`; `fmtPoints(score)` a 20 px · `fmtDelta(delta_1m)`
  · régimen · banda.
- Dispersión: `RangeBar variant="segmented"` entre la filial más débil y la más fuerte, con el
  score consolidado como valor y «Dispersión N pts» debajo.
- Filiales: `ul[role="listbox"][aria-label="Filiales"]` con una `SubsidiaryRow`
  (`li[role="option"]` de 28 px) por empresa (ya ordenadas por score por la API): nombre 13 px,
  score `.num`, Δ1m, `Sparkline`; `aria-selected` en la seleccionada; clic, Enter o Espacio →
  `select(id)`. La fila vive en `SubsidiaryRow.tsx` porque también la usa Investigación profunda.

El bloque lleva `key={id}` y `animate-crossfade`. Estados: skeleton (sr-only «Cargando grupo»),
`ErrorState` `el grupo <id>` (o `la empresa <id>` si falla la ficha que descubre el grupo), vacío
«Sin filiales en este corte».

Nota: el marco ofrece «Elegir empresa» a este widget (`needsEntity: true`) y su `CompanyPicker`
busca con `unit: "company"`, pero el widget lee `entity` como id de grupo. Fijar una empresa desde
el marco pide hoy `/groups/COMP_…`. Está anotado como pendiente; el test del widget fija un
`GROUP_…`.

### Favoritos (`widgets/favorites/FavoritesWidget.tsx`, `rows.ts`)

`useWatchlist()` (§6) y una consulta por id con `useQueries`, **por prefijo**: `groupKey` para
`GROUP_…`, `companyKey` para el resto (la misma caché que Investigación y Grupo). `rows.ts` es
aritmética pura: `favoriteRow(id, CompanyV2 | GroupV2)` reduce cualquiera de las dos fichas a
`{ id, kind, name, score, delta_1m, delta_3m, regime, band, sparkline }` (los doce últimos scores
de la timeline, como `sparkline_12` del universo).

`ul[role="listbox"][aria-label="Favoritos"]` con una `li[role="option"]` de 28 px por id, en el
orden de la lista: nombre (los grupos con un chip «G» secundario), score, Δ1m, Δ3m, `Sparkline` y
la `FavoriteStar`, aquí **siempre visible**. Clic o Enter escriben la selección de su clase
(`select` / `selectGroup`); la estrella quita la fila sin seleccionar (Enter sobre la estrella
tampoco selecciona). Cada fila tiene sus propios estados, sin tumbar a las demás: skeleton
mientras carga y «No se pudo cargar · Reintentar» si su ficha falla. Vacío: «Sin favoritos» /
«Pulsa la estrella de una fila en Empresas».

### Cartera (`widgets/portfolio/PortfolioWidget.tsx`, `portfolio-math.ts`)

Las posiciones de `PORTFOLIO` (§6: constante, no se edita) con una ficha por empresa
(`useQueries` con `companyKey`). `portfolio-math.ts` es puro y trabaja sobre lo ya cargado:
`totalInvested(positions)`, `weightedScore(rows)` (media ponderada por importe; una ficha sin
score no pesa y sin ninguna cargada es `null`, nunca 0) y `bandCounts(rows)`.

Cabecera `dl`: «Invertido» (`fmtSizeShort(total, "EUR")`), «Score medio» (`fmtPoints` o `—`) y
«En riesgo» («2 tensión · 1 vigilancia», cada cifra con su punto de tono). Debajo,
`ul[role="listbox"][aria-label="Cartera"]` con una fila de 28 px por posición: nombre, importe
(`fmtSizeShort`), score, Δ1m y `Sparkline` de los doce últimos scores; `aria-selected` en la
seleccionada; clic o Enter → `select(id)`. Fila cargando skeleton; fila en error con reintento.

## 8. Reglas para un widget nuevo

1. **Registrarlo en `widgets/register-all.ts`** con `registerWidget({ type, title, description,
   defaultSize, minSize, needsEntity, thumbnail, component })` y su miniatura en
   `widgets/thumbnails.tsx`. El orden de registro es el orden del catálogo. Los tableros fijos
   **no** son el sitio: sus layouts son presets en `dashboard/fixed/` y no admiten widgets; si un
   tipo nuevo tiene que entrar en «Investigación», se cambia el preset y `fixed.test.ts`
   comprueba que sigue cubriendo la rejilla y respeta los `minSize`.
2. **Solo contenido.** El marco, el título, el glass, los botones y la entrada los pone
   `WidgetFrame`. El contenido recibe `{ item }` y un hueco `min-h-0 flex-1`, y decide él dónde
   scrollea (`overflow-y-auto` en su propio contenedor, como Investigación). Un `h-full` en la raíz
   si necesita medirse.
3. **Datos por `lib/api-v2.ts` y React Query, con las claves de `lib/query-keys.ts`.** Nunca una
   clave literal: la ficha de empresa es `companyKey(id)`, y así comparte caché con el marco, con
   Investigación, con Favoritos y con Cartera.
4. **La selección se lee del store y se escribe con sus acciones.** `useSelection(selector)` con un
   selector que devuelva primitivas o referencias del estado. Nunca una copia local de `selected`,
   `selectedGroup`, `selectedEntity`, `compare` o `search`. Si el widget acepta empresa o grupo,
   declara `needsEntity: true` y resuelve con `resolveEntity(item.entity, selectedEntity)`; si
   solo entiende empresas, `item.entity ?? selected`. No inventa un selector propio. Favoritos van
   por `dashboard/watchlist.ts` (`useWatchlist`, `useIsFavorite`, `toggleFavorite`) y la estrella
   es `FavoriteStar`.
5. **Estados explícitos, los cuatro**: carga (skeleton con la forma del contenido, `aria-busy`,
   `aria-live="polite"` y un texto `sr-only`), vacío (qué pasa y qué hacer, en dos líneas), error
   (`ErrorState` con `onRetry` y `context`) e historia insuficiente cuando la serie no da para
   dibujar. `is_available: false` se pinta «No aplica»; nunca un cero de relleno. Un 404 que
   significa «no existe» (el informe) no es un error que reintentar: se deshabilita y se explica.
6. **Color por token, nunca un hex.** `var(--x)` o la utilidad de Tailwind de la capa semántica.
   Lo vigila `src/design/tokens.test.ts`. Régimen y banda, con `lib/regime.ts`. Las miniaturas
   también: `currentColor` y `var(--content-*)`.
7. **Cifras con `.num`** (solo `tabular-nums`: una familia, Inter) y formateadas por `@/charts`:
   `fmtDelta` decide glifo, signo y color; `fmtPoints` pone la unidad; `fmtSignedPoints`,
   `fmtConfidence`, `fmtSizeShort`, `fmtU`, `fmtPct` y `fmtMonth` para el resto. Valor ausente:
   `—`, nunca `0`. Ni `font-mono` ni pesos fuera de 500/600/700.
8. **Definiciones y etiquetas cortas en `lib/definitions.ts`**, nunca escritas en el widget:
   `SHORT_LABEL` (≤ 18 caracteres por señal), `SIGNAL_DEFINITION`, `PILLAR_DEFINITION`,
   `KPI_DEFINITION`, `FAMILY_LABEL`, `PILLAR_TOKEN` y `METRIC_OPTIONS`. Una frase por entrada,
   desde `docs/alfonso/ENGINE-EMBAT.md` §4–§6, sin cifras de la empresa (eso lo dice `value_fmt`).
   Un título que tenga definición lleva `InfoTip`.
9. **Gráficas solo de `@/charts`**, con `label` siempre y la timeline **completa** más `from`
   (nunca `slice` en el widget: el eje y la transición de rango dependen de ello). `tooltip={false}`
   solo cuando la cabecera del widget ya enseña el valor y la unidad del mes activo
   (Investigación); si nadie enseña la cifra, el tooltip se queda (Comparativa).
10. **Capas a mano, sin Radix.** Menús y popovers como `role="menu"` / `role="listbox"` (patrón
    `WidgetFrame`, `MetricMenu`); un pop-up es `components/ui/dialog.tsx` (`Dialog`: portal,
    `aria-modal`, trampa de foco cíclica, Escape consumido con `preventDefault` +
    `stopPropagation`, clic en el velo, `inert` en los hermanos, `body` sin scroll, foco devuelto
    al cerrar; `size="overlay"` para el buscador y `size="full"` para un documento) y una
    definición al pasar por encima es `components/ui/info-tip.tsx` (`InfoTip`: botón de 14 px
    `aria-label="Definición de <título>"` + `aria-describedby` a un `span[role="tooltip"]`
    **siempre montado** en un portal, `hidden` hasta hover o foco, 300 ms de retardo al hover y
    ninguno al foco ni si otra burbuja se cerró hace menos de 300 ms; Escape la oculta sin soltar
    el foco ni cerrar el diálogo que la contenga).
11. **Motion por utilidades**: la entrada la pone `WidgetFrame`; `animate-crossfade` para un
    contenido que se reemplaza (contenedor con `key`); `animate-menu-enter` para un menú o popover
    que aparece; `animate-dialog-enter` + `animate-backdrop-enter` los pone `Dialog`; siempre con
    `motion-reduce:*`. Hover y foco a `--duration-fast`, hover solo bajo `[@media(hover:hover)]`;
    **la escala 1,02 solo en controles y tarjetas internas** (chips, píldoras, celdas de KPI,
    filas del catálogo, tarjetas de acción), nunca en el widget ni en las filas de una lista: las
    filas cambian de fondo y revelan la acción (la estrella). Nada anima al escribir, al ordenar
    ni al paginar; el relleno de la estrella no anima.
12. **Densidad**: fila de lista `--size-table-row` (28 px), controles de 32 px o `--size-segment-sm`
    (26 px) para toggles, celdas de estadística de `--size-stat-cell` (56 px) o `--size-stat-row`
    (48 px), cabecera de widget de 32 px. Si una columna no cabe, se oculta por `@container`, no
    por ancho de ventana. Los tamaños por defecto y mínimos del registro están en celdas de una
    rejilla de 24 × 24 que llena la página: a 900 px de alto una fila mide 26 px.
13. **Copy** en español impersonal de tesorero
    ([`docs/dani/contrato-visual-v1.md`](../dani/contrato-visual-v1.md) §3): «Selecciona una
    empresa o un grupo», «Historia insuficiente», «Sin alertas en este corte», «Informe no
    disponible para esta empresa».
14. **Sin leyenda de colores, sin grupos de vínculo, sin selector de entidad propio.** El único
    selector de entidad es el «Elegir empresa» del marco, y solo para los tipos con `needsEntity`;
    la búsqueda global es el buscador central de la topbar, no un input en el widget.
15. **Un test al lado** (`widgets/<type>/<Type>Widget.test.tsx`), `widgets/registry.test.ts`
    ampliado con el tipo nuevo en su posición, `WidgetCatalog.test.tsx` con el recuento nuevo y
    una línea `web_test` en el check de la feature.

## 9. Qué cambió en XR-032 y por qué

XR-031 dejó `/` con un tablero «Principal» fijo de tres widgets (Empresas · Investigación ·
Comparativa), la metodología siempre visible al pie de Investigación, un `input` de búsqueda en la
topbar que escribía el `search` global, dos familias tipográficas y un catálogo de seis. Alfonso
lo revisó contra Trade Republic y pidió la iteración definitiva. Las decisiones, en una frase
cada una:

| Cambio | Cómo queda | Por qué |
| --- | --- | --- |
| «Principal» → **dos fijos** («Empresa», «Investigación») | `dashboard/fixed/`; `/` abre «Empresa»; los tableros de usuario y el catálogo se mantienen | un tablero con propósito único se lee mejor que uno mixto: la ficha en profundidad a un lado, la investigación (mapa, screener, favoritos, cartera) al otro |
| **Metodología fuera de Investigación y en pop-up** | `Methodology variant="grid"` dentro de `MethodologyDialog` (Investigación profunda); Investigación queda en cabecera · gráfica · KPIs · «Señales» | las fórmulas saturaban la ficha; en un diálogo a pantalla completa caben enteras y con visuales, y quien no las quiere no las paga |
| **Buscador global** en vez del input | `SearchTrigger` centrado al 50 % + `EntitySearchOverlay` con el árbol de Empresas; `⌘K` | el input reordenaba tablas de otros tableros y no permitía elegir un grupo; el overlay elige empresa o grupo y cierra |
| **Una sola entidad seleccionada** | `selectedEntity` derivada de `select`/`selectGroup`; `resolveEntity` | `selected` y `selectedGroup` coexistían sin saber cuál fue el último: la ficha no sabía si hablar de la empresa o del grupo |
| **Una sola familia tipográfica** | Inter Variable (`--font-sans`), `.num` = `tabular-nums`, pesos 500/600/700; fuera Geist y Geist Mono | Trade Republic usa una sola familia para texto y cifras; la monoespaciada rompía el ritmo de las tablas ([tokens.md](tokens.md#tipografía-y-cifras)) |
| **Gráficas con transición, presente fijo y eje** | `LineNoAxes` recibe la serie completa + `from`; `HISTORY_SHARE = 0,78`; `axisTicks` | cambiar de rango saltaba de forma y el presente se movía; ahora la línea se mueve y el corte se queda ([charts.md](charts.md)) |
| **Mapa con nombres** | `name`, `label` y `delta` llegan al `Treemap`; agrupar por Grupo / País / ERP; una línea de estado, sin pie | `COMP_XXXX` no dice nada a un tesorero; el heatmap de Trade Republic lleva ticker y valor en cada tile |
| **Favoritos y Cartera** | `dashboard/watchlist.ts`, `FavoriteStar` en cada fila, dos widgets nuevos | el «Research» de Trade Republic vive de favoritos; la cartera es la vista que un tesorero abre primero |
| **Informe de Health pregenerado** | `GET /companies/:id/report`, cinco JSON versionados, tarjeta deshabilitada con 404 | un informe en vivo exige clave y latencia en la demo; pregenerado es reproducible y auditable (cada cifra sale de `value_fmt`) |
| `Dialog` e `InfoTip` a mano | `components/ui/dialog.tsx`, `components/ui/info-tip.tsx`; `ui/tooltip.tsx` (Radix, sin uso) se borra | el mismo motivo que los menús: Radix es frágil en jsdom y las dos primitivas caben en un fichero cada una |
| `CompanyTree` extraído | `panels/companies/CompanyTree.tsx` + `useGroupChildren.ts` | el buscador necesita el mismo árbol; `CompaniesPanel` pasa de 1042 a ~480 líneas |

Lo que **no** cambió, y es a propósito: el lienzo, el marco, el registro, el catálogo y los
tableros de usuario de XR-031 (§3–§5); `selected` y `selectedGroup` siguen para los widgets que
solo entienden una clase; `STORAGE_VERSION` sigue en 1 (§2). Lo que sigue fuera: paleta `⌘K` de
widgets y espacios más allá del atajo del buscador, presets, replay, what-if, edición de la
cartera, persistencia en servidor, informe en vivo, drag/resize del lienzo, hover compartido entre
widgets (el `activeMonth` es local a Investigación).

El contexto completo (decisiones de Alfonso, medidas de Trade Republic de esta sesión,
desviaciones aceptadas y motion) está en
[`docs/design/redesign-audit.md` §9](redesign-audit.md#9-xr-032--dos-tableros-fijos-buscador-central-y-una-sola-fuente).
