# Tableros y widgets: cómo funciona la página y cómo añadir un widget

La fuente de verdad es el código de [`app/web/src`](../../app/web/src/): `routes/dashboard.tsx`,
`dashboard/{types,store,grid-math,Grid,WidgetCatalog,selection}`, `widgets/{registry,
register-all,WidgetFrame,thumbnails,useCompanyName}`, `components/{app-shell,Background,topbar,
DashboardTabs,AddWidgetButton,CompanyPicker}`, `components/ui/segmented` y el contenido de
`panels/*` y `widgets/<type>/*`. Este documento describe lo que hay allí; si los dos discrepan,
manda el código. Los colores y las medidas salen de [`docs/design/tokens.md`](tokens.md); las
gráficas, de [`docs/design/charts.md`](charts.md). Aquí no se repite ninguno de los dos.

Desde XR-031 la ruta `/` abre el tablero **Principal**, fijo, con tres widgets (Empresas por
grupos, Investigación y Comparativa), y el usuario puede crear **tableros propios** con hasta
cuatro widgets de un catálogo de seis, arrastrables y redimensionables. El lienzo, el registro y
el catálogo vuelven de XR-003 con un recorte deliberado; el contexto de esa decisión está en
[`docs/design/redesign-audit.md`](redesign-audit.md) y en §9.

## 1. Anatomía de la página

```
body (--bg)
└── AppShell            h-dvh, flex-col, overflow-hidden: la página nunca scrollea
    ├── Background      [data-orb] fijo, z-index -1: dos orbes y el foco [data-spotlight]
    ├── Topbar          60 px (--size-topbar), transparente: marca · DashboardTabs · buscador · mock · «Añadir widget» · avatar
    └── main            flex-1, overflow-auto
        └── DashboardPage   <Grid key={id} dashboard locked={isMainDashboard(id)} />
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
orbe se vea a través. Sin banner de mock, sin leyenda de colores, sin chips.

| Zona | Qué hay | Detalle |
| --- | --- | --- |
| Izquierda | Marca `X-Ray` | texto 14 px / 600 |
| Izquierda | `DashboardTabs` | `div[role="tablist"][aria-label="Tableros"]`: una pestaña por tablero y «Añadir página» |
| Centro | Buscador global | `input[aria-label="Buscar empresa"]`, 32 px (`--size-input`), glass, 320 px de ancho |
| Derecha | Indicador de mock | `span[role="status"]`, mono a `--text-micro`: `Mock v1 · corte 08/2026`; solo con `data_kind: "mock"` (clave `metaKey`) |
| Derecha | `AddWidgetButton` | 24 × 24, `aria-label="Añadir widget"`, `aria-haspopup="menu"`; abre el catálogo (§5) |
| Derecha | Avatar | botón redondo de 28 px, `aria-label="Menú de perfil"`, inicial `X` |

**El buscador escribe directamente en el store de selección** (`setSearch`); Empresas lo lee de
ahí y reescribe su consulta. Nada anima al teclear.

**Pestañas (`components/DashboardTabs.tsx`).** Una `button[role="tab"]` por `[Principal,
…tableros de usuario]`, 14 px / 600 y 32 px de alto (`--size-segment`): la activa en
`--content-primary` con `aria-selected`, las demás en secundario; hover con escala 1,02 y cambio
de color, pulsación a 0,97; clic → `setActiveDashboard`. Solo los tableros de usuario se
renombran y se quitan:

- **Doble clic** abre un `input[aria-label="Nombre del tablero"]` inline con el nombre
  seleccionado; Enter y perder el foco confirman, Escape cancela. El id en curso vive en un `ref`
  además de en el estado: un `blur` tardío tras cancelar no reabre la confirmación.
- La pestaña activa de usuario lleva una `X` de 16 px, `aria-label="Quitar tablero <nombre>"`
  (`removeDashboard`, sin confirmación). «Principal» no ofrece nada de esto: el store ya lo protege.
- **«Añadir página»**: botón `Plus` de 24 × 24, `aria-label="Añadir página"`, `transition-transform`
  de 200 ms (el `transform .2s` del botón homónimo de Trade Republic); `disabled` con
  `title="Máximo 8 tableros"`. Al pulsar, `createDashboard()` crea «Tablero N», lo activa y entra
  en renombrado con el nombre preseleccionado.

**«Añadir widget» (`components/AddWidgetButton.tsx`).** `disabled` en Principal
(`title="El tablero Principal es fijo: crea uno con «Añadir página»"`) y con cuatro widgets
(`title="Máximo 4 widgets por tablero"`). Envuelve `WidgetCatalog` como popover anclado a la
derecha; el clic fuera lo cierra y Escape lo cierra devolviendo el foco al botón (patrón
`FilterPill`).

### La ruta (`routes/dashboard.tsx`)

```tsx
const dashboard = useActiveDashboard();
return <Grid key={dashboard.id} dashboard={dashboard} locked={isMainDashboard(dashboard.id)} />;
```

Un solo lienzo para todo: Principal pasa por el mismo `Grid` que los tableros de usuario, con
`locked`. `key` remonta el lienzo al cambiar de tablero: maximizado y medida arrancan de cero y
los widgets entran escalonados otra vez. La ruta ya no tiene rejilla propia.

**Arranque (`App.tsx`).** `import "@/widgets/register-all"` puebla el registro como efecto de
importación y, con el catálogo ya lleno, `loadFromStorage((type) => getWidget(type) !==
undefined)` carga los tableros persistidos descartando los widgets de tipo desconocido.

## 2. El modelo (`dashboard/types.ts`, `dashboard/store.ts`)

```ts
type LayoutItem = { i: string; type: string; x: number; y: number; w: number; h: number; entity: string | null };
type Dashboard = { id: string; name: string; layout: LayoutItem[] };
type DashboardsState = { version: number; active: string; dashboards: Dashboard[] }; // solo de usuario
```

| Constante | Valor | Nota |
| --- | --- | --- |
| `GRID_COLUMNS` × `GRID_ROWS` | 24 × 24 | celdas del modelo; las columnas deben cuadrar con `--grid-cols` |
| `MAX_WIDGETS_PER_DASHBOARD` | 4 | por tablero de usuario |
| `MAX_DASHBOARDS` | 8 | tableros de usuario; Principal no cuenta |
| `MAIN_DASHBOARD_ID` | `"main"` | id reservado |
| `STORAGE_KEY` / `STORAGE_VERSION` | `xray.dashboards.v1` / `1` | `localStorage` |

**Principal es un preset, no un estado.** `mainDashboard()` devuelve siempre el mismo objeto
(`{ id: "main", name: "Principal" }`) con tres items de ids fijos y `entity: null`:

| Item | Tipo | Celdas (`x, y, w, h`) |
| --- | --- | --- |
| `main-companies` | `companies` | `0, 0, 12, 24`: mitad izquierda, toda la altura |
| `main-research` | `research` | `12, 0, 12, 14`: arriba a la derecha |
| `main-compare` | `compare` | `12, 14, 12, 10`: abajo a la derecha |

No se persiste, ninguna mutación lo toca y `selectActiveDashboard` lo devuelve también cuando el
id activo ya no existe. Los tableros de usuario viven en `dashboards`; `active` puede ser
`"main"` o el id de uno de ellos, y sí se persiste.

**Lectura.** `getState`, `subscribe`, `useDashboards(selector)` (`useSyncExternalStore`; el
selector devuelve primitivas o referencias del estado), `useActiveDashboard()`,
`isMainDashboard(id)`, `widgetCount(state)`, `canAddWidget(state)` (`!isMain && count < 4`).

**Mutaciones de widgets**, todas no-op (o `null`) sobre Principal:

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
activo, `active` vuelve a `"main"`), `setActiveDashboard(id)` (ignora ids desconocidos). Sin
reordenar, sin presets. Los ids son deterministas (`w1…`, `d1…`) para que los tests no dependan de
`randomUUID`; `syncCounters` los pone al día tras cargar.

**Persistencia.** Cada mutación del usuario llama a `persist()` (`setItem` con `try/catch`: en
modo privado los tableros siguen vivos en memoria); cargar o reiniciar el store no persiste.
`loadFromStorage(isKnownType)` trata el JSON como no confiable:

| Entrada | Resultado |
| --- | --- |
| Sin clave, JSON corrupto o `version ≠ 1` | estado por defecto (`active: "main"`, sin tableros) |
| Tablero sin `id` string, con id `"main"`, sin `layout` array o con nombre vacío | se descarta el tablero |
| Nombre de más de 40 caracteres | se recorta (`MAX_NAME_LENGTH`) |
| Item sin `i`/`type` string, con tipo desconocido, celdas no enteras, `x + w > 24` o `entity` que no es string ni `null` | se descarta **solo ese item**, no se recorta |
| `i` o `id` repetidos | se conserva el primero |
| Más de cuatro items | se corta a cuatro y se compacta |
| `active` que no apunta a un tablero superviviente | `"main"` |

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
| Escape | restaura: lo escucha `document`, así que funciona también en Principal y en modo apilado, donde el item no recibe el foco; un Escape ya consumido (`defaultPrevented` por un menú o un selector) no cuenta |

**Maximizar** es estado local, no va al store y no se persiste. Vale también en Principal: el item
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
| `locked` | `boolean` | Principal: sin asa, sin menú, «Elegir empresa» deshabilitado |
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
| «Elegir empresa» | solo si `definition.needsEntity` | `CompanyPicker` con `allowFollow`: muestra el nombre de la empresa fijada (`useCompanyName`: `companyKey(id)` con `select` al nombre, así comparte caché con Investigación) o «Selección» con `Link2` cuando `entity === null`; elegir escribe `setWidgetEntity(i, id)` y «Seguir la selección global» vuelve a `null`. Con `locked`, un botón deshabilitado con `title="En Principal la ficha sigue la selección"` |
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
del catálogo**. `register-all.ts` registra los seis como efecto de importación; los tres de
Principal reutilizan los paneles de `panels/` y los tres de catálogo viven en `widgets/<type>/`.

| `type` | Título | Descripción | Por defecto | Mínimo | `needsEntity` | Componente |
| --- | --- | --- | --- | --- | --- | --- |
| `companies` | Empresas | Tabla del universo por grupos, con score, Δ y régimen. | 12 × 24 | 8 × 10 | no | `CompaniesPanel` |
| `research` | Investigación | Ficha de la empresa seleccionada o fijada. | 12 × 14 | 8 × 10 | sí | `ResearchPanel entity={item.entity}` |
| `compare` | Comparativa | Dos empresas en una sola gráfica. | 12 × 10 | 8 × 6 | no | `ComparePanel` |
| `alerts` | Alertas | Bandeja de alertas del motor, la más reciente arriba. | 8 × 12 | 6 × 6 | no | `AlertsWidget` |
| `treemap` | Mapa | Treemap por grupo: tamaño cobros 12 m, color Δ3m. | 12 × 12 | 8 × 8 | no | `TreemapWidget` |
| `group` | Grupo | El grupo de la empresa seleccionada y sus filiales. | 12 × 12 | 8 × 8 | sí | `GroupWidget` |

**Miniaturas (`widgets/thumbnails.tsx`).** Seis SVG de 60 × 30 (`aria-hidden`) que sugieren la
forma de cada tipo, solo con `currentColor` y `var(--content-*)`: heredan el color del texto de
la tarjeta y no fijan ningún literal.

### El catálogo (`dashboard/WidgetCatalog.tsx`)

Popover `div[role="menu"][aria-label="Añadir widget"]` que abre `AddWidgetButton`: ancho
`--size-popover-w` (320 px: cada fila lleva miniatura + título + descripción, y a 250 se
recorta), `max-h-[350px] overflow-y-auto`, radio `--radius-card`, `bg-surface-elevated` con borde
inset glass, `absolute top-full right-0 mt-1 z-[var(--z-popover)]`, `animate-menu-enter
origin-top-right motion-reduce:animate-none`.

Una fila `button[role="menuitem"]` de 44 px por tipo registrado: miniatura de 60 px, título a
`--text-control` / 600 y descripción a `--text-micro` en secundario; hover `bg-surface-glass-hover`
+ escala 1,02 (es una tarjeta interna, no un widget); `aria-disabled` + `opacity-40` cuando
`!canAddWidget`.

Teclado: el foco entra en la primera fila al abrir; ↑/↓ cíclicos, Home y End; Enter y Espacio
añaden por el clic nativo del botón; Escape y el clic fuera los gestiona `AddWidgetButton`, que
devuelve el foco al disparador. Al añadir: `addWidget({ type, ...defaultSize })`; si devuelve
`null`, un `p[role="status"]` «Máximo 4 widgets por tablero»; si no, el menú se cierra.

## 6. El store de selección (`dashboard/selection.ts`)

Un solo objeto inmutable en memoria y suscripción con `useSyncExternalStore`, como `store.ts`.
Existe porque la selección cruza los widgets y ninguno es dueño de ella.

```ts
type SelectionState = {
  selected: string | null;
  selectedGroup: string | null;
  compare: [string | null, string | null];   // slots A y B
  search: string;
};
```

| Campo | Quién escribe | Quién lee | Regla |
| --- | --- | --- | --- |
| `selected` | Empresas (clic o Enter en una filial o fila plana); Alertas, Mapa y Grupo (clic en una fila o tile) | Investigación (`entity ?? selected`); Comparativa (A cuando no está fijada); Grupo (grupo de la seleccionada); Empresas, Alertas y Grupo (fila marcada) | un solo id o `null`; seleccionar **no** toca `compare` |
| `selectedGroup` | Empresas (clic o Enter en una fila de grupo, que además la despliega) | Grupo (`entity ?? selectedGroup ?? …`); Empresas (fila de grupo marcada) | un solo id o `null` |
| `compare` | Comparativa (`setCompareSlot` desde los dos `CompanyPicker` y «Quitar») | Comparativa | `[A, B]`; **A vacío sigue a `selected`**; `setCompareSlot(slot, id)` vacía el otro slot si ya tenía ese id: **nunca A = B** |
| `search` | Topbar y el filtro de Empresas | Topbar y Empresas | los dos inputs son el mismo campo |

Acciones: `select`, `selectGroup`, `setCompareSlot(0 | 1, id | null)`, `clearCompare`,
`setSearch`, `resetSelection`. Lectura: `useSelection(selector)`; el selector devuelve primitivas
o referencias del estado, nunca un objeto nuevo por render. Desaparecen `toggleCompare`,
`removeCompare` y `MAX_COMPARE`.

**No persiste.** Ni `localStorage`, ni servidor, ni URL: el demo arranca siempre limpio. Lo que
sí persiste es el layout (§2), y por separado.

## 7. Los seis widgets

Todos consumen la API v2 por `lib/api-v2.ts` con React Query y las claves de `lib/query-keys.ts`
(`companyKey`, `companySignalsKey`, `companyTimelineKey`, `groupKey`, `universeKey`, `alertsKey`,
`treemapKey`, `pickerKey`, `metaKey`, `catalogKey`: dos widgets que piden lo mismo comparten caché
solo si escriben la misma clave), importan las gráficas solo de `@/charts` y traducen régimen y
banda con `lib/regime.ts`. Cada uno tiene su test al lado, que es lo que ejecuta el check.

### Empresas por grupos (`panels/companies/CompaniesPanel.tsx` + `tree.ts`)

El «Research» de Trade Republic sobre `/api/v2/universe`, ahora **por grupos**: `unit: "group"`
por defecto pide hasta 500 grupos en una sola página (`limit 500, offset 0`, sin paginador) y
cada grupo desplegado pide `/groups/:id` (`useQueries` con `groupKey`) y mete sus `companies[]`
como filas hijas sangradas. `tree.ts` es aritmética pura: `flattenTree(groups, expanded, children,
failed)` produce la lista `TreeRow` (`group` · `company` · `loading` · `error`) que recorre el
virtualizador, y `pageSizeFor(alto, 28)` (`clamp(floor(alto / 28), 10, 500)`) da la página de la
vista `Empresa`, medida con `ResizeObserver` sobre el `rowgroup` que scrollea (600 px → 21); otro
tamaño de página vuelve a `offset 0`.

La consulta sigue siendo un solo objeto y la clave de React Query; el servidor ordena y filtra;
`keepPreviousData` evita el parpadeo a esqueleto. Controles glass de 32 px: filtro (`aria-label=
"Filtrar empresas"`, escribe el `search` del store), `FilterPill` Banda y Régimen, `FilterPill`
Grupo **solo en la vista plana** (el árbol ya agrupa), unidad Empresa / Grupo (`role="group"` con
`aria-pressed`; cambiar de unidad limpia Grupo) y `SortableHeader` con `aria-sort`.

Columnas (cabecera 26 px en micro secundario, fila 28 px, gap 8; el nombre conserva ≥ 300 px a
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

Fuera: Id, el texto de Grupo, el texto de Banda y el botón «Comparar». Las columnas se ocultan por
`@container`, no por ancho de ventana; nada se solapa y nada desplaza en horizontal. En la vista
`Empresa` no hay Desglose, `n` ni Operativa (serían columnas enteras de `—`).

A11y y teclado: `role="treegrid"` (`table` en la vista plana) con `aria-label="Empresas"`; filas
`role="row"` con `aria-level` 1 | 2, `aria-expanded` en grupos y `aria-selected`; celdas
`gridcell`. Roving tabindex sobre la lista aplanada (si la fila trackeada se desmonta por el
scroll, la primera montada hereda el `tabIndex=0`). `Enter` o clic activan: un grupo se despliega
**y** escribe `selectedGroup`; una filial escribe `selected`. `→` despliega (o pasa el foco al
primer hijo), `←` pliega (o sube al padre), `↑/↓/Home/End` como siempre; si la fila destino no
está montada, el virtualizador se desplaza hasta ella y un efecto la enfoca en cuanto exista.

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

### Investigación (`panels/research/ResearchPanel.tsx`, `FamilyStats.tsx`, `Methodology.tsx`, `hover.ts`, `forecast.ts`)

`ResearchPanel({ entity = null })`: `id = entity ?? selected`. En Principal `entity` es siempre
`null`; en un tablero de usuario la fija «Elegir empresa» del marco. Sin id: «Selecciona una
empresa en la tabla». Consultas: `companyKey` (cabecera, gráfica, pesos), `companyTimelineKey`
(confianza, base y penalización por mes), `companySignalsKey` (familias), `metaKey` y `catalogKey`
(metodología, `staleTime: Infinity`).

De arriba abajo, en un contenedor con `key={id}` y `data-company` que entra con `animate-crossfade`
al cambiar de empresa (rango y familia viven fuera de él y sobreviven al cambio):

1. **Cabecera**: nombre (14 px / 600, truncado) y un `dl[aria-live="polite"]` con **solo tres
   KPIs**: «Score» (`fmtPoints`, `--text-figure` / 600), «Δ 1 m» (`fmtDelta`, con tono) y
   «Confianza» (`fmtConfidence`). Sin régimen, banda, outlook ni titular.
2. **Gráfica**: `Segmented` «Rango» (3M · 6M · 1A · Máx → 4, 7, 13, todos los puntos; 1A por
   defecto) alineado a la izquierda y `LineNoAxes` en una caja de **168 px fijos** (medirla
   retroalimenta: la gráfica crecería con su propio contenido) con `activeMonth`, `tooltip={false}`
   y `onHover`, serie coloreada por régimen, línea base en el primer punto visible, `forecast` de
   `buildForecast(as_of, score, outlook)` y marcadores de alerta y techo. Menos de 3 puntos
   (`MIN_HISTORY`): «Historia insuficiente: hacen falta tres meses de score».
3. **Familia**: `Segmented` «Familia» (Liquidez · Pago · Cobros · Deuda · Actividad; claves
   L/P/C/D/A; Liquidez por defecto) con el resumen del pilar a la derecha (`fmtU(value) · peso
   fmtU(weight)`), y debajo `FamilyStats`: un `dl` a dos columnas con **todas** las señales de la
   familia, una celda por señal de `min-height: var(--size-stat-row)` (48 px) que escala 1,02 al
   hover (tarjeta interna): nombre a 11 px + chip de `quality_flag` (`warmup` →
   «calentamiento»); `value_fmt` a 13 px **o «No aplica»** si `is_available === false` (nunca un
   0) con `fmtSignedPoints(contribution)` a la derecha; `PillarBar` sobre `u_smooth ?? u` y «Δ 1 m»
   con `fmtSignedPoints(delta_vs_prev)`. Señales pendientes: seis celdas skeleton; en error:
   `ErrorState` «las señales» mientras la cabecera se queda.
4. **Última alerta**, solo si `alert` no es `null`: severidad (Vigilar y Revisar en
   `--content-alert`, Urgente en `--content-negative`), mes y mensaje a dos líneas.
5. **Metodología** (`Methodology.tsx`): `section[aria-label="Cómo se calcula"]`, **siempre
   visible**, nueve bloques (nota por señal, pilares, nivel y penalización, techos, bandas,
   contribuciones e identidad, outlook, confianza, regímenes) con las fórmulas en `.num` sobre
   glass. **Ningún número va escrito**: todos salen de `meta.params` (λ, τ, techos, α, φ, γ, z,
   σ, `f_hist`), `meta.reference` (bandas, pesos de pilar), `catalog` (anclas y percentiles de la
   familia activa, pesos por señal) y la ficha. La identidad `base + (Σ contrib) − penalización −
   ajuste de techo = score` se imprime con las cifras de la empresa. Meta o catálogo pendientes →
   fórmulas con «…»; en error → «No se pudo cargar la metodología».

**Hover controlado.** Al pasar el ratón por la gráfica no hay tooltip: `onHover` escribe
`activeMonth` y la cabecera, el resumen de la familia, cada celda de `FamilyStats` y la identidad
de la metodología pasan a hablar del mes apuntado, con el sufijo ` · MM/AAAA`. `hover.ts` es
aritmética pura: `kpisAt(timeline, month)` da score, `score − score del mes anterior` (`null`,
es decir `—`, en el primer mes) y confianza desde la fila de `/timeline`; `signalAt(signal,
month)` da el punto de `series_24m` o, si el mes no está (banda de forecast), las cifras del
corte. Cero peticiones: todo está ya en caché. Al salir, `activeMonth` vuelve a `null` y las
cifras al corte.

Estados: `SheetSkeleton` (cabecera, caja de 168 px y seis celdas); `ErrorState` con «Reintentar»,
y con 404 el mensaje «No existe ninguna empresa `<id>` en este corte.».

### Comparativa A/B (`panels/compare/ComparePanel.tsx`)

`a = compare[0] ?? selected`, `b = compare[1]`. Fila de cabecera (`min-height: --size-row`):
`CompanyPicker` «Empresa A» con clave de color `--chart-score` · «vs» · `CompanyPicker` «Empresa
B» con `--content-accent` y placeholder «Elegir empresa» · botón `aria-label="Quitar <nombre>"`
solo con B (`setCompareSlot(1, null)`); a la derecha, `Segmented` «Rango» (1A por defecto; 3M
deja 4 puntos) y la píldora «Base 100» (`aria-pressed`, `normalize` de la primitiva). Fijar A
desde el picker anula la selección; el panel rechaza además elegir en un slot la empresa que ya se
ve en el otro (el store solo ve los slots fijados, no la seguida): nunca A = B.

**Una consulta por empresa con `useQueries` y `companyKey`**: seleccionar y comparar la misma
empresa no la pide dos veces. El rango recorta en el cliente (`slice(-n)`); la Δ del periodo de la
leyenda es siempre en puntos de score sobre los puntos visibles, también con Base 100. **El color
es la identidad del slot, no el régimen**: los puntos van sin `regime`. La leyenda es inline y la
pone el panel (trazo, nombre truncado a 180 px, Δ o «Historia insuficiente» con menos de 2
puntos). La gráfica conserva el **tooltip flotante por defecto** con ambos valores del mes (nadie
más enseña la cifra) y mide su alto con `ResizeObserver`, acotado a `[148, 360]`. El bloque lleva
`key` por pareja: cross-fade al cambiar de empresas, nada al cambiar de rango o de Base 100.

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
«Vigilar», «Revisar», «Urgente»), `company_id` mono a 11 px, mensaje a 12 px truncado con `title`,
`fmtMonth(month_detected)` mono a la derecha. Clic → `select(company_id)`; la fila de la empresa
seleccionada lleva `aria-current` y `bg-fills-accent-thin`. Hover solo de fondo.

| Estado | Qué se ve |
| --- | --- |
| Carga | seis filas skeleton, `aria-busy`, sr-only «Cargando alertas» |
| Error | `ErrorState` «las alertas» con «Reintentar» |
| Vacío | «Sin alertas en este corte» / «El motor no ha detectado deterioros que vigilar.» |

### Mapa (`widgets/treemap/TreemapWidget.tsx`)

`treemapKey({ groupBy: "group", metric })` sobre `/api/v2/treemap` con `keepPreviousData`. Mide su
hueco con `ResizeObserver` (callback ref, como `useChartHeight`) y pinta `Treemap` de `@/charts` al
tamaño medido, con `unit="pts"`, `headerHeight={16}` por grupo, `onSelect → select(id)` y
`onHover`. Cabecera interna de 24 px: a la izquierda el tile apuntado (`<nombre> · Δ3m <valor>`, o
«Pasa por encima de una empresa»), a la derecha `Segmented` «Métrica» Δ3m · Δ1m · Score, que
reescribe la consulta. **Un item con `color_value: null` no se pinta** (el contrato prohíbe
imputar 0) y el pie dice «N empresa(s) sin Δ en este corte».

| Estado | Qué se ve |
| --- | --- |
| Carga | una caja skeleton, sr-only «Cargando mapa» |
| Error | `ErrorState` «el mapa» |
| Vacío | «Sin empresas en este corte» / «El mapa se pinta cuando el universo tiene cobros que repartir.» |

### Grupo (`widgets/group/GroupWidget.tsx`)

Qué grupo se pinta, por orden: `item.entity` (leído como **id de grupo**), `selectedGroup`, el
grupo de la filial elegida desde este mismo widget (se recuerda para no volver a pedir la ficha) y,
si no, el `group_id` de la ficha de `selected` (`companyKey`, caché compartida con Investigación).
Sin ninguno: «Selecciona una empresa o un grupo» / «El grupo sigue a la selección salvo que el
widget fije uno.». Con id, `groupKey(id)` sobre `/api/v2/groups/:id`:

- Cabecera: nombre 14 px / 600 + `group_id` mono; `fmtPoints(score)` a 20 px · `fmtDelta(delta_1m)`
  · régimen · banda.
- Dispersión: `RangeBar variant="segmented"` entre la filial más débil y la más fuerte, con el
  score consolidado como valor y «Dispersión N pts» debajo.
- Filiales: `ul[role="listbox"][aria-label="Filiales"]` con una `li[role="option"]` de 28 px por
  empresa (ya ordenadas por score por la API): nombre 13 px, score mono, Δ1m, `Sparkline`;
  `aria-selected` en la seleccionada; clic, Enter o Espacio → `select(id)`.

El bloque lleva `key={id}` y `animate-crossfade`. Estados: skeleton (sr-only «Cargando grupo»),
`ErrorState` `el grupo <id>` (o `la empresa <id>` si falla la ficha que descubre el grupo), vacío
«Sin filiales en este corte».

Nota: el marco ofrece «Elegir empresa» a este widget (`needsEntity: true`) y su `CompanyPicker`
busca con `unit: "company"`, pero el widget lee `entity` como id de grupo. Fijar una empresa desde
el marco pide hoy `/groups/COMP_…`. Está anotado como pendiente; el test del widget fija un
`GROUP_…`.

## 8. Reglas para un widget nuevo

1. **Registrarlo en `widgets/register-all.ts`** con `registerWidget({ type, title, description,
   defaultSize, minSize, needsEntity, thumbnail, component })` y su miniatura en
   `widgets/thumbnails.tsx`. El orden de registro es el orden del catálogo. Principal **no** es el
   sitio: su layout es un preset fijo en `store.ts` y no admite un cuarto widget.
2. **Solo contenido.** El marco, el título, el glass, los botones y la entrada los pone
   `WidgetFrame`. El contenido recibe `{ item }` y un hueco `min-h-0 flex-1`, y decide él dónde
   scrollea (`overflow-y-auto` en su propio contenedor, como Investigación). Un `h-full` en la raíz
   si necesita medirse.
3. **Datos por `lib/api-v2.ts` y React Query, con las claves de `lib/query-keys.ts`.** Nunca una
   clave literal: la ficha de empresa es `companyKey(id)`, y así comparte caché con el marco, con
   Investigación y con Comparativa.
4. **La selección se lee del store y se escribe con sus acciones.** `useSelection(selector)` con un
   selector que devuelva primitivas o referencias del estado. Nunca una copia local de `selected`,
   `selectedGroup`, `compare` o `search`. Si el widget necesita una empresa fija, declara
   `needsEntity: true` y lee `item.entity ?? selected`; no inventa un selector propio.
5. **Estados explícitos, los cuatro**: carga (skeleton con la forma del contenido, `aria-busy`,
   `aria-live="polite"` y un texto `sr-only`), vacío (qué pasa y qué hacer, en dos líneas), error
   (`ErrorState` con `onRetry` y `context`) e historia insuficiente cuando la serie no da para
   dibujar. `is_available: false` se pinta «No aplica»; nunca un cero de relleno.
6. **Color por token, nunca un hex.** `var(--x)` o la utilidad de Tailwind de la capa semántica.
   Lo vigila `src/design/tokens.test.ts`. Régimen y banda, con `lib/regime.ts`. Las miniaturas
   también: `currentColor` y `var(--content-*)`.
7. **Cifras con `.num`** (o `font-mono tabular-nums`) y formateadas por `@/charts`: `fmtDelta`
   decide glifo, signo y color; `fmtPoints` pone la unidad; `fmtSignedPoints`, `fmtConfidence`,
   `fmtSizeShort`, `fmtU` y `fmtMonth` para el resto. Valor ausente: `—`, nunca `0`.
8. **Gráficas solo de `@/charts`**, con `label` siempre. `tooltip={false}` solo cuando la cabecera
   del widget ya enseña el valor y la unidad del mes activo (Investigación); si nadie enseña la
   cifra, el tooltip se queda (Comparativa).
9. **Motion por utilidades**: la entrada la pone `WidgetFrame`; `animate-crossfade` para un
   contenido que se reemplaza (contenedor con `key`); `animate-menu-enter` para un menú o popover
   que aparece; siempre con `motion-reduce:*`. Hover y foco a `--duration-fast`, hover solo bajo
   `[@media(hover:hover)]`; **la escala 1,02 solo en controles y tarjetas internas** (chips,
   píldoras, celdas de KPI, filas del catálogo), nunca en el widget ni en las filas de una lista:
   las filas cambian de fondo y revelan la acción. Nada anima al escribir, al ordenar ni al paginar.
10. **Densidad**: fila de lista `--size-table-row` (28 px), controles de 32 px o `--size-segment-sm`
    (26 px) para toggles, cabecera de widget de 32 px. Si una columna no cabe, se oculta por
    `@container`, no por ancho de ventana. Los tamaños por defecto y mínimos del registro están
    en celdas de una rejilla de 24 × 24 que llena la página: a 900 px de alto una fila mide 26 px.
11. **Copy** en español impersonal de tesorero
    ([`docs/dani/contrato-visual-v1.md`](../dani/contrato-visual-v1.md) §3): «Selecciona una
    empresa», «Historia insuficiente», «Sin alertas en este corte».
12. **Sin leyenda de colores, sin grupos de vínculo, sin selector de entidad propio.** El único
    selector de entidad es el «Elegir empresa» del marco, y solo para los tipos con `needsEntity`.
    Los menús y popovers se hacen a mano (`role="menu"`, `role="listbox"`), sin Radix.
13. **Un test al lado** (`widgets/<type>/<Type>Widget.test.tsx`), `widgets/registry.test.ts`
    ampliado con el tipo nuevo en su posición, y una línea `web_test` en el check de la feature.

## 9. Qué volvió de XR-003 y por qué

XR-030 retiró el lienzo, el registro, el catálogo, las pestañas y el marco con acciones porque con
tres paneles fijos no había nada que registrar ni que catalogar (tabla del §6 anterior, hoy en
[`redesign-audit.md` §3](redesign-audit.md#3-qué-se-retira-qué-se-reutiliza)). XR-031 los trae de
vuelta **porque Principal queda fijo**: la simplicidad del MVP se preserva en el tablero que abre
`/`, y toda la complejidad del lienzo es opcional, la paga solo quien crea un tablero propio.

| Vuelve | Cómo vuelve |
| --- | --- |
| `dashboard/Canvas` → `Grid.tsx` | el `Canvas` histórico restaurado y adaptado, sin librería: drag por cabecera, resize por esquina, teclado, maximizar, asentamiento; con `locked` para Principal y modo apilado |
| `dashboard/store`, `grid` → `grid-math`, `types` | el mismo motor de compactado; sin `Workspace`, `presetId`, `Entity`, `EntityKind` ni `LinkGroup`; Principal como preset no persistido; `sanitize` de JSON no confiable |
| `widgets/registry`, `register-all`, `WidgetCatalog` | el registro recortado a lo que el catálogo enseña (`needsEntity` y `thumbnail` nuevos); catálogo como popover de 320 px con teclado |
| `widgets/WidgetFrame` | el único marco, vestido con el glass del `Panel` de XR-030; `Panel.tsx` se borra |
| Pestañas en la topbar | `DashboardTabs` con «Principal» fijo, renombrado inline y «Añadir página»; sin reordenar |

Lo que **no** vuelve, y es a propósito:

| Se queda fuera | Por qué |
| --- | --- |
| Grupos de vínculo por color entre widgets (`linkGroup`, punto de vínculo) | la selección es una y global (`dashboard/selection.ts`); un segundo canal de coordinación era el ruido que la auditoría señaló |
| `EntityPicker` por widget | solo existe «Elegir empresa» en el marco, y solo para los tipos con `needsEntity` (Investigación y Grupo); el resto sigue la selección |
| Principal editable | fijo por decisión de Alfonso: sin arrastrar, redimensionar, quitar ni añadir; solo «Maximizar» |
| Presets por rol, reordenar pestañas, persistencia en servidor | fuera de alcance (XR-013 y siguientes) |
| Chips de salud, banner amarillo, `score-card`, `screener` como widget, `widgets/Sparkline`, `widgets/regime.ts` | retirados en XR-030 y siguen retirados: sus papeles los hacen Empresas, Investigación, el indicador de mock y `@/charts` |

El contexto completo (decisiones de Alfonso, medidas de Trade Republic de esta sesión,
desviaciones aceptadas y motion) está en
[`docs/design/redesign-audit.md` §8](redesign-audit.md#8-xr-031--reversión-consciente-y-decisiones).
