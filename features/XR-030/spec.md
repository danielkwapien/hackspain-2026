---
feature: XR-030
depends_on: [XR-001, XR-003, XR-012]
parallel: true
conflicts_with: []
lane: amplio
verify: evals/checks/XR-030.sh
max_attempts: 3
---
# Spec: XR-030

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-030: <item>") y termina la pasada.

## 1. Objetivo

La ruta `/` es una sola pagina al estilo de la app web de Trade Republic (tema oscuro): fondo navy
mas oscuro que `--navy-950` con un orbe difuminado animado en CSS puro, superficies glass, topbar de
60 px sin pestanas, y tres paneles visibles a la vez a >= 1280 px (apilados por debajo): **Empresas**
(tabla densa sobre `/api/v2/universe`), **Comparativa** (varias empresas en `LineNoAxes` con
normalizacion y rangos) e **Investigacion** (la empresa seleccionada sobre `/api/v2/companies/:id`
con banda de outlook, pilares, drivers y alerta). Sin catalogo de widgets, sin lienzo arrastrable y
sin leyenda de colores en producto. Contexto y decisiones: `docs/design/redesign-audit.md`.

## 2. Comportamiento (escenarios verificables)

- DADO `app/web/src/index.css` CUANDO se leen sus tres capas ENTONCES existe el primitivo
  `--navy-1000` (mas oscuro que `--navy-950`) y `--bg` lo referencia; existen los semanticos
  `--surface-glass`, `--surface-glass-hover`, `--border-glass` y los de orbe `--orb-1`, `--orb-2`;
  existen los de componente `--blur-glass`, `--orb-size`, `--orb-blur`, `--orb-drift`,
  `--text-panel-title: 14px` y `--size-table-row: 28px`; la hoja declara
  `@media (prefers-reduced-motion: reduce)`; y `--content-secondary`, `--content-negative`,
  `--content-positive` y `--content-alert` miden >= 4,5:1 sobre `--navy-1000` y sobre
  `--surface-glass` compuesto encima.
  # -> web_test design/tokens
- DADO el cliente `lib/api-v2.ts`, `lib/regime.ts` y las fixtures `test/fixtures/v2/*` CUANDO se
  contrastan con `docs/api/examples/universe.json`, `company.json` y `meta.json` ENTONCES `Band` es
  `solid|healthy|watch|stress` y `BAND_LABEL`/`BAND_CLASS` tienen exactamente esas claves; cada
  clave de los ejemplos existe en la fixture correspondiente (`company` como fila de
  `companies.csv` sin `sparkline_12`, `penalty.points`, `narrative.headline`, `alert` objeto o
  `null`, `cap` objeto o `null`, `drivers[].value_fmt`, `audit.data_kind`, `meta.cutoff_date`,
  `meta.window`); y `getUniverse({ limit: 2000 })` pide `limit=500`.
  # -> web_test api-v2
- DADO el store `dashboard/selection.ts` CUANDO se selecciona una empresa, se anaden y quitan
  empresas a comparar y se escribe la busqueda global ENTONCES `selected` guarda un solo id,
  `compare` no repite ids, no pasa de 5 y conserva el orden de insercion, seleccionar no anade a
  `compare`, `search` se propaga a `useSelection`, y el estado no se persiste.
  # -> web_test selection
- DADO `/` con `/api/v2/meta` en `data_kind: "mock"` CUANDO se monta el marco ENTONCES la topbar
  mide `--size-topbar`, muestra la marca «X-Ray», un input `aria-label="Buscar empresa"` que
  escribe `search` en el store, y un `role="status"` con «Mock v1 · corte 08/2026»; no hay
  `role="tablist"`, ni boton «Anadir widget», ni banner «Datos simulados», ni catalogo; existe una
  capa `[data-orb]` con `aria-hidden="true"` detras del contenido; y hay tres `role="region"`
  llamados «Empresas», «Comparativa» e «Investigacion», cada uno con la clase de entrada
  `animate-panel-enter` y `motion-reduce:animate-none`.
  # -> web_test app-shell
- DADO el panel Empresas sobre `/api/v2/universe` CUANDO se ordena por columna, se cambia una pill
  (banda con valores reales, regimen, grupo, unidad) o se escribe en la busqueda ENTONCES la
  consulta se reescribe con `offset=0`; cada fila (28 px) pinta nombre, id, grupo, score, Δ1m y Δ3m
  con `fmtDelta`, regimen, sparkline de `@/charts` y banda con `BAND_LABEL`; ↑/↓ mueven el foco
  entre filas, Enter o clic seleccionan (`selected` del store, `aria-selected="true"`), el boton
  «Comparar» de la fila anade a `compare` y se marca `aria-pressed`; estados de carga, vacio y
  error con reintentar; paginacion «1-200 de N».
  # -> web_test CompaniesPanel
- DADO el panel Comparativa con `compare` no vacio CUANDO carga cada `/api/v2/companies/:id`
  ENTONCES dibuja un `LineNoAxes` con una serie por empresa, rangos `3M 6M 1A Máx` como texto con
  `aria-pressed` (por defecto `1A`; `3M` deja los 4 ultimos puntos, `6M` 7, `1A` 13, `Máx` todos),
  un toggle «Base 100» que activa `normalize`, y una leyenda inline con nombre, Δ del periodo via
  `fmtDelta` y boton `aria-label="Quitar <nombre>"` que llama a `removeCompare`; sin empresas
  muestra «Añade empresas desde la tabla»; una serie con menos de 2 puntos muestra «Historia
  insuficiente»; y no existe ningun panel de leyenda de colores.
  # -> web_test ComparePanel
- DADO el panel Investigacion CUANDO no hay seleccion ENTONCES muestra «Selecciona una empresa»;
  CUANDO `selected` carga `/api/v2/companies/:id` ENTONCES muestra nombre e id, score con
  `fmtPoints`, Δ1m con glifo de `fmtDelta`, etiqueta de regimen y de banda, un `LineNoAxes` con
  `forecast` desde `as_of` con `outlook.low`/`outlook.high` y rangos como texto, cinco
  `role="meter"` (`PillarBar`) etiquetados Liquidez, Pago propio, Cobros, Deuda y Actividad, la
  lista de drivers con `value_fmt` y contribucion en puntos, la ultima alerta con severidad y
  mensaje, y el titular de la narrativa; con `timeline` de menos de 3 puntos muestra «Historia
  insuficiente»; con 404 muestra error con «Reintentar»; y al cambiar `selected` el contenido se
  reemplaza dentro de un contenedor `data-company="<id>"` con cross-fade (`animate-crossfade`,
  `motion-reduce:animate-none`).
  # -> web_test ResearchPanel

## 3. Fuera de alcance

- `app/api/`, `datasets_mocked/`, `core/`, `evals/` (incluido `evals/smoke.sh`) y `TASKQUEUE.md`:
  no se tocan. El estado de la fila se reporta en el chat y en `features/NOTES.md`.
- Las rutas v1 (`routes/company.tsx`, `routes/portfolio.tsx`, `routes/monitor.tsx`,
  `lib/api.ts`, `components/activity-chart.tsx`, `invoice-chart.tsx`, `engine-*.tsx`,
  `currency-amounts.tsx`) no se reescriben: siguen montadas fuera de la navegacion.
- `app/web/src/charts/*`: se consume, no se reescribe (solo un arreglo si un test de panel
  destapa un bug, y entonces con su test en `charts/`).
- La ruta `/tokens` se queda como catalogo de desarrollo bajo `import.meta.env.DEV`, sin enlace
  desde el producto. La ruta `/prototypes/background` (variantes de fondo) se borra al cerrar el
  ticket, una vez elegida la variante.
- Treemap, watchlist, replay temporal, bandeja de alertas, grupo `/group/:id`, presets por rol,
  paleta de comandos, persistencia en servidor: tickets XR-006 en adelante.
- Ninguna dependencia nueva sin pasar por `design-pick-ui-library` y anotarlo aqui. Ningun color
  literal fuera de `index.css`. Ninguna cifra inventada: todo sale de la API v2 o de las fixtures
  con su misma forma.
- Los tests de los modulos retirados (`dashboard/workspaces*`, `layout-store`, `WidgetFrame`,
  `EntityPicker`, `Screener`, `ScoreCard`, `MockBanner`) se borran junto con su codigo; no se
  debilitan ni se saltan.

## 4. Verificacion

- [ ] bash evals/smoke.sh          -> exit 0
- [ ] bash evals/checks/XR-030.sh  -> exit 0   # nacio en rojo sobre la rama
- [ ] `/` sin errores en consola; pares de capturas local/TR de topbar, tabla y ficha a 1440×900
      en `plans/XR-030-tr-redesign/evidence/` (alto de fila, tipografia y radios dentro de ±2 px)

Lineas del check, en el mismo orden que los escenarios de la seccion 2:

```
web_test design/tokens
web_test api-v2
web_test selection
web_test app-shell
web_test CompaniesPanel
web_test ComparePanel
web_test ResearchPanel
```

Ficheros de test que satisfacen esos patrones:

```
src/design/tokens.test.ts                     (existente; se amplia con los tokens de XR-030)
src/lib/api-v2.test.ts
src/dashboard/selection.test.ts
src/components/app-shell.test.tsx
src/panels/companies/CompaniesPanel.test.tsx
src/panels/compare/ComparePanel.test.tsx
src/panels/research/ResearchPanel.test.tsx
```

## 5. Prioridades (de arriba abajo)

1. Tokens y fondo: `index.css` con `--navy-1000`, `--bg`, glass, orbe, `--text-panel-title`,
   `--size-table-row: 28px`, regla global de `prefers-reduced-motion`, keyframes
   `panel-enter` (opacity 0→1, translateY 6px→0, 200 ms `--ease-enter`), `crossfade` (opacity,
   200 ms `--ease-fade`) y `orb-drift` (transform, `--orb-drift`); `components/Background.tsx`
   con la capa `[data-orb]` de la variante elegida por Alfonso; `docs/design/tokens.md` al dia.
   -> `web_test design/tokens`
2. Contrato: `lib/api-v2.ts` alineado con `docs/api/v2.md` §3 (tipos `Band`, `UniverseItem`,
   `CompanyRow`, `Driver`, `Penalty`, `Narrative`, `AlertRow`, `Cap`, `Audit`, `MetaV2`, `limit`
   recortado a 500), `lib/regime.ts` (movido desde `widgets/regime.ts`, bandas reales) y fixtures
   `test/fixtures/v2/*` con la forma de los ejemplos. -> `web_test api-v2`
3. Store `dashboard/selection.ts` (`useSyncExternalStore`, sin persistencia): `selected`,
   `compare` (max 5), `search`; acciones `select`, `toggleCompare`, `removeCompare`, `setSearch`,
   `resetSelection`. -> `web_test selection`
4. Shell: `components/app-shell.tsx` (Background + Topbar + `main`), `components/topbar.tsx`
   (marca, buscador global, indicador de mock con `formatCutoff`, avatar), `panels/Panel.tsx`
   (marco glass: cabecera 32 px, titulo 14/600, `role="region"`, `animate-panel-enter`),
   `routes/dashboard.tsx` con la rejilla de tres paneles (>= 1280 px: Empresas 12/24 a la
   izquierda, Comparativa e Investigacion apilados a la derecha (2fr/3fr); por debajo, columna
   unica). El reparto 10/24 del plan se descarto tras medirlo a 1440x900: dejaba la tabla en
   551 px y escondia Id, Grupo y Δ3m; con 12/24 (700 px por panel) se ven todas menos Grupo, que
   entra a partir de 768 px de contenedor.
   Retirada de `dashboard/Canvas`, `store`, `WidgetCatalog`, `grid`, `types`, `Topbar`,
   `MockBanner`, `widgets/*` (salvo lo movido), `lib/portfolio-health` y sus tests.
   -> `web_test app-shell`
5. Panel Empresas `panels/companies/CompaniesPanel.tsx` reutilizando de `Screener` el estado de
   consulta, `FilterPill`, `SortableHeader`, virtualizador y paginacion; sparkline de `@/charts`;
   teclado ↑/↓; fila 28 px; «Comparar» en hover y foco. -> `web_test CompaniesPanel`
6. Panel Comparativa `panels/compare/ComparePanel.tsx`: `useQueries` por id, `LineNoAxes` con
   `normalize` y rangos, leyenda inline con Δ y quitar. -> `web_test ComparePanel`
7. Panel Investigacion `panels/research/ResearchPanel.tsx`: cabecera, `LineNoAxes` con
   `forecast` (meses `as_of+1..+6`, `h3`/`h6` interpolados, `low`/`high`), `PillarBar` x5,
   drivers, alerta, narrativa, estados; cross-fade al cambiar de empresa.
   -> `web_test ResearchPanel`
8. Pasada de motion (`design-animate`): hover de filas 150 ms, popovers 200/150, entrada de
   paneles y cross-fade ya definidos, todo bajo `prefers-reduced-motion`; revision con
   `design-review-animations`.
9. Cierre: `docs/design/widgets.md` reescrito como guia de paneles, borrado de
   `/prototypes/background`, pares de capturas finales en `plans/XR-030-tr-redesign/evidence/`.
