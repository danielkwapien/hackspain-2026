---
feature: XR-003
depends_on: [XR-001, XR-002]
parallel: true
conflicts_with: []
lane: amplio
verify: evals/checks/XR-003.sh
max_attempts: 3
---
# Spec: XR-003

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-003: <item>") y termina la pasada.

## 1. Objetivo

La ruta `/` es un tablero de widgets estilo Trade Republic: topbar con espacios de trabajo
persistidos, lienzo de 24 columnas con widgets que se mueven, redimensionan, duplican y eliminan,
marco de widget con selector de entidad y vinculo por color, y dos widgets vivos (Buscador de
empresas y Tarjeta de score) que se comunican por ese vinculo.

## 2. Comportamiento (escenarios verificables)

- DADO el store del tablero CUANDO se anaden, mueven, redimensionan, duplican y eliminan widgets,
  se cambia la entidad de un `linkGroup` y se lee `localStorage` con una version antigua o ausente
  ENTONCES el layout respeta los limites de la rejilla, compacta en vertical, propaga la entidad
  solo dentro del mismo `linkGroup` y migra al preset por defecto, persistiendo bajo
  `xray.dashboard.v1`.
  # -> web_test layout-store
- DADO el tablero CUANDO se crean, renombran, reordenan y activan espacios de trabajo, y cuando se
  arrastra, redimensiona, maximiza o mueve por teclado un widget del lienzo ENTONCES el espacio
  activo se persiste, el preset por defecto en el primer arranque se llama "Cartera", cada item de
  la rejilla es focusable y se mueve con flechas mas modificador, y Escape restaura un widget
  maximizado.
  # -> web_test workspaces
- DADO un widget montado en su marco CUANDO tiene entidad ENTONCES la cabecera muestra el nombre de
  la entidad como boton (`aria-label="Cambiar empresa"`) que abre el selector; CUANDO no la tiene
  ENTONCES muestra el titulo del tipo; y el menu de la cabecera invoca duplicar, eliminar y cambiar
  vinculo sobre el store. Todos los controles de la cabecera tienen nombre accesible.
  # -> web_test WidgetFrame
- DADO el selector de entidad abierto CUANDO se escribe un id, un nombre o un grupo ENTONCES la
  lista filtra por los tres campos, cada fila muestra score, etiqueta de regimen y sparkline, la
  navegacion con flechas y Enter selecciona, Escape cierra, y en `mode: "multi"` devuelve
  `entities[]` en orden de seleccion respetando `max`.
  # -> web_test EntityPicker
- DADO el widget Buscador sobre `/api/v2/universe` CUANDO se ordena por una columna, se cambia una
  pill de filtro o se hace clic en una fila ENTONCES la tabla pinta las filas con cifras tabulares,
  la ordenacion y los filtros reescriben la consulta y resetean la paginacion, el clic fija la
  entidad en el `linkGroup` del widget y "Abrir" navega a `/company/:id`.
  # -> web_test Screener
- DADO el widget Score CUANDO recibe una entidad por el vinculo ENTONCES muestra nombre, score,
  delta con signo coloreado, regimen y sparkline de 12 meses leidos de `/api/v2/companies/:id`, y
  un estado de error con causa y reintentar cuando la API responde 404.
  # -> web_test ScoreCard
- DADO `/api/v2/meta` con `data_kind === "mock"` CUANDO se carga el tablero ENTONCES el banner de
  datos simulados es visible bajo la topbar, y no se pinta cuando `data_kind` no es `mock`.
  # -> web_test MockBanner

## 3. Fuera de alcance

- `app/api` y `datasets_mocked/`: no se tocan (los sirve XR-001).
- `app/web/src/routes/company.tsx`, `monitor.tsx` y `portfolio.tsx`: no se reescriben. Solo se
  anade la ruta `/company/:id` como alias de la pagina de empresa existente.
- Widgets Empresa completo, Comparador, Watchlist, Treemap, Alertas, Drivers y replay temporal:
  tickets XR-004 en adelante. Aqui solo existen Buscador y Score simple.
- Persistencia en servidor, exportar/importar layout, presets por rol distintos del por defecto,
  busqueda global con teclado global (XR-018) y `usePortfolioHealth` con scope distinto de
  `"universe"` (XR-010).
- `evals/`, `TASKQUEUE.md` y cualquier otra feature: intocables para el builder.
- Colores literales fuera de `index.css`: prohibidos. Todo por variable CSS.

## 4. Verificacion

- [ ] bash evals/smoke.sh          -> exit 0
- [ ] bash evals/checks/XR-003.sh  -> exit 0   # nacio en rojo sobre main
- [ ] `/` sin errores en consola del navegador; par de capturas local/TR de rejilla, cabecera de
      widget, tabla y selector de entidad en `plans/XR-003-widget-shell/evidence/`.

Lineas del check, en el mismo orden que los escenarios de la seccion 2:

```
web_test layout-store
web_test workspaces
web_test WidgetFrame
web_test EntityPicker
web_test Screener
web_test ScoreCard
web_test MockBanner
```

Los ficheros de test que satisfacen esos patrones:

```
src/dashboard/layout-store.test.ts
src/dashboard/workspaces.test.ts          (store: espacios)
src/dashboard/workspaces-canvas.test.tsx  (lienzo: drag, resize, teclado, maximizar, catalogo)
src/widgets/WidgetFrame.test.tsx
src/widgets/EntityPicker.test.tsx
src/widgets/screener/Screener.test.tsx
src/widgets/score-card/ScoreCard.test.tsx
src/dashboard/MockBanner.test.tsx
```

## 5. Prioridades (de arriba abajo)

1. `dashboard/types.ts` + `dashboard/store.ts`: modelo (`Workspace`, `LayoutItem` con
   `entities: Entity[]`, `linkGroup: green|blue|orange|gray`, `presetId`), acciones
   (`addWidget`, `moveWidget`, `resizeWidget`, `duplicateWidget`, `removeWidget`, `setEntities`,
   `applyPreset`), compactacion vertical, limites 24 columnas y persistencia versionada en
   `localStorage` bajo `xray.dashboard.v1` con migracion. -> `web_test layout-store`
2. Espacios de trabajo en el store: `createWorkspace`, `renameWorkspace`, `reorderWorkspaces`,
   `setActiveWorkspace`; preset inicial `Cartera`, `Research`, `Monitor` con `Cartera` activo.
   -> `web_test workspaces`
3. Fixtures locales `src/test/fixtures/v2/` (forma de `/api/v2/universe`, `/api/v2/companies/:id`
   y `/api/v2/meta` segun XR-001 §4.2) y cliente `lib/api-v2.ts` tipado.
4. `widgets/registry.ts` (`type`, `title`, `description`, `defaultSize`, `minSize`, `needsEntity`,
   `entityKinds`, `maxEntities`, `component`) y `widgets/WidgetFrame.tsx` con cabecera de 32 px,
   punto de `linkGroup`, nombre de entidad como boton, maximizar y menu.
   -> `web_test WidgetFrame`
5. `widgets/EntityPicker.tsx`: popover de 320 px, input con foco automatico, lista de empresas y
   grupos con score, regimen y sparkline, teclado y modos `single`/`multi`.
   -> `web_test EntityPicker`
6. `dashboard/Canvas.tsx`: rejilla CSS de 24 columnas (gap 8, fila 31, padding 16), drag por
   cabecera, resize por esquina, maximizar, movimiento por teclado y ancho por `ResizeObserver`.
   -> `web_test workspaces`
7. Topbar en `components/app-shell.tsx`: pestanas de espacios reordenables, chips de salud de
   cartera y empresas en movimiento via `lib/portfolio-health.ts`, menu de layout y catalogo de
   widgets. -> `web_test workspaces`
8. `dashboard/MockBanner.tsx` bajo la topbar cuando `meta.data_kind === "mock"`.
   -> `web_test MockBanner`
9. `widgets/screener/`: tabla densa virtualizada sobre `/api/v2/universe` con orden, pills de
   filtro, hover con "Abrir" y clic que vincula la entidad. -> `web_test Screener`
10. `widgets/score-card/`: nombre, score, delta, regimen, sparkline y estado de error.
    -> `web_test ScoreCard`
11. `docs/design/widgets.md`: como registrar un widget nuevo (10 lineas y un ejemplo).
12. Motion: entrada de popover 200 ms `--ease-enter`, salida 150 ms, drag con `transform`,
    cross-fade de 150 ms al cambiar de entidad, todo bajo `prefers-reduced-motion`.
