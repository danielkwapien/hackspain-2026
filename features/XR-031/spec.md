---
feature: XR-031
depends_on: [XR-030]
parallel: true
conflicts_with: []
lane: amplio
verify: evals/checks/XR-031.sh
max_attempts: 3
---
# Spec: XR-031

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-031: <item>") y termina la pasada.

## 1. Objetivo
`/` abre el tablero Principal fijo (Empresas por grupos a la izquierda a toda altura,
Investigacion arriba a la derecha con familias de KPIs, hover por mes y metodologia, Comparativa
A/B abajo con buscador) y el usuario puede crear tableros propios con hasta 4 widgets de un
catalogo de 6 con drag y resize, sobre un fondo navy `#020a24` con orbe azul y un foco que sigue
al puntero. El plan completo (disposicion, nombres, tests) esta en
`plans/XR-031-dashboards-research/PLAN.md` §2; este spec lo resume y fija el alcance.

## 2. Comportamiento (escenarios verificables)
- DADO la API con el mock CUANDO se piden `/api/v2/companies/:id/signals`, `/companies/:id`,
  `/companies/:id/timeline` y `/api/v2/meta` ENTONCES cada punto de `series_24m` lleva
  `value_fmt`, `u_smooth`, `weight`, `contribution`, `delta_vs_prev` e `is_available`, la ficha y
  la timeline llevan `base` con `score = base + Σ contribution − penalty`, y `/meta` expone
  `reference` del manifest y `params` del motor (λ 0,5, τ 0,45, techos, ewma, outlook, confianza).
  # `api_test v2`
- DADO el cliente `lib/api-v2.ts` CUANDO se contrastan las fixtures de `signals`, `timeline`,
  `group`, `catalog`, `alerts`, `treemap` y `meta` con `docs/api/examples/*.json` ENTONCES llevan
  todas sus claves, `CompanyV2` lleva `base` y existen `getCompanySignals`, `getCompanyTimeline`,
  `getGroupV2`, `getCatalogSignals`, `getAlerts` y `getTreemap`. # `web_test lib/api-v2`
- DADO `index.css` CUANDO se parsean los tokens ENTONCES `--navy-1000` es `#020a24` (literal mas
  oscuro que `--navy-950`), `--blue-700` es primitivo, `--orb-1` y `--spotlight` semanticos sin
  hex, `--spotlight-size/blur/opacity`, `--size-segment-sm`, `--size-stat-row` y
  `--size-popover-w` son de componente, y primario/secundario/positivo/negativo/alerta contrastan
  ≥ 4,5 sobre `--navy-1000` y sobre el glass compuesto. # `web_test design/tokens`
- DADO `LineNoAxes` CUANDO recibe `activeMonth` y `tooltip={false}` ENTONCES el crosshair sigue el
  mes controlado sin eventos de puntero, `onHover` sigue emitiendo, no hay `role="tooltip"` y la
  linea base es punteada (`0 3.6`, extremos redondos); `fmtSignedPoints`, `fmtConfidence` y
  `fmtSizeShort` formatean con U+2212 y espacio fino. # `web_test charts/`
- DADO los componentes de shell CUANDO se montan ENTONCES `Segmented` es un `radiogroup` con
  flechas ciclicas e indicador deslizante; `CompanyPicker` abre un `listbox` con hasta 8 filas de
  `/universe?q=`, teclado y foco de vuelta; la topbar muestra el `tablist` «Tableros» con
  «Principal», «Añadir pagina» (max. 8) y «Añadir widget» (deshabilitado en Principal y con 4
  widgets); `Background` pinta `[data-spotlight]` que sigue al puntero con suavizado y no lo hace
  bajo `prefers-reduced-motion`; el shell no tiene banner de mock ni leyenda de colores.
  # `web_test components/`
- DADO el modelo de tableros CUANDO se usa el store ENTONCES «Principal» es un preset fijo
  (companies 0,0,12,24 · research 12,0,12,14 · compare 12,14,12,10) que no se persiste ni admite
  cambios; los tableros de usuario admiten hasta 4 widgets, 8 tableros, mover/redimensionar dentro
  de 24 columnas con compactado, `entity` por widget, persistencia `xray.dashboards.v1` con
  validacion de JSON no confiable; `Grid` arrastra por cabecera y redimensiona por esquina solo en
  tableros desbloqueados, con teclado y maximizar; el catalogo lista 6 tipos y añade con Enter;
  `selection` guarda `compare` como slots A/B y `selectedGroup`. # `web_test dashboard/`
- DADO el registro y los widgets CUANDO se montan ENTONCES `register-all` deja seis tipos en
  orden `companies, research, compare, alerts, treemap, group`; `WidgetFrame` es una region con
  titulo, «Maximizar», menu «Duplicar/Quitar» (oculto si bloqueado) y «Elegir empresa» para los
  que necesitan entidad; `AlertsWidget`, `TreemapWidget` y `GroupWidget` pintan sus datos de
  `/alerts`, `/treemap` y `/groups/:id`, seleccionan empresa al clic y tienen estados de carga,
  vacio y error. # `web_test widgets/`
- DADO el panel Empresas CUANDO se monta ENTONCES lista grupos (`unit=group`) con triangulo de
  desglose, `n`, punto de banda ante el score, Δ1m, Δ3m, sparkline y confianza, sin Id, Grupo,
  Banda ni Comparar; desplegar pide `/groups/:id` y pinta las filiales sangradas; clic en grupo
  escribe `selectedGroup` y clic en filial `selected`; `→/←/Enter` despliegan, pliegan y
  seleccionan; la vista Empresa pagina segun el alto (600 px → 21). # `web_test panels/companies`
- DADO el panel Investigacion CUANDO se monta con una empresa ENTONCES la cabecera solo tiene
  nombre, score, Δ1m y confianza; el rango y la familia son `radiogroup`; la familia activa lista
  todas sus señales con `value_fmt`, contribucion en pts, meter y «No aplica» (nunca 0); al pasar
  el raton por la grafica la cabecera y las señales muestran el mes apuntado sin tooltip y al
  salir vuelven al corte; la metodologia esta siempre visible con λ, τ, techos, φ, bandas y la
  identidad `base + Σ contrib − penalizacion − techo = score` con las cifras de la empresa.
  # `web_test panels/research`
- DADO el panel Comparativa CUANDO se monta ENTONCES el slot A sigue a la seleccion y B esta
  vacio («Elegir empresa»); elegir B desde el picker dibuja dos series y la leyenda con Δ del
  periodo; fijar A anula la seleccion; «Quitar» vacia B; rangos en `radiogroup` con 1A por defecto
  y 3M = 4 puntos; «Base 100» normaliza; el hover enseña ambos valores. # `web_test panels/compare`

## 3. Fuera de alcance
- `datasets_mocked/`, `datasets_mocked/xray_mock/`, `core/`, `evals/` (incluido `smoke.sh`) y
  `TASKQUEUE.md`: no se tocan. `app/api` solo lo toca la unidad U5a y solo en
  `src/v2/params.ts` (nuevo), `src/v2/routes.ts` (tres mappers), `test/v2.test.ts`,
  `docs/api/v2.md` y `docs/api/examples/*`: la API sigue sin calcular finanzas.
- Rutas v1 (`routes/company.tsx`, `portfolio.tsx`, `monitor.tsx`, `lib/api.ts`, `components/
  activity-chart.tsx`, `invoice-chart.tsx`, `engine-*.tsx`, `currency-amounts.tsx`): no se
  reescriben.
- `app/web/src/charts/*`: solo `LineNoAxes` (`activeMonth`, `tooltip`, linea base punteada),
  `format.ts` (tres helpers) e `index.ts`, con sus tests. Nada mas.
- Dependencias nuevas: ninguna. Ningun color literal fuera de `index.css`. Ninguna cifra
  inventada: todo sale de la API v2 o de fixtures con su misma forma; `is_available=false` se
  pinta «No aplica», nunca 0.
- Persistencia en servidor, presets por rol (XR-013), paleta ⌘K (XR-018), replay (XR-011),
  what-if (XR-016), `/audit` (XR-024), `/group/:id` (XR-017): no.
- Tablero Principal editable: no (fijo, solo «Maximizar»). Grupos de vinculo por color entre
  widgets (XR-003): no vuelven. Reordenar pestañas: no.
- Los tests de `panels/Panel.tsx`, `toggleCompare`/`MAX_COMPARE` y los antiguos `app-shell`
  («sin catalogo») se sustituyen por los de este spec; no se debilitan ni se saltan.
- Reversion consciente de XR-030: vuelven catalogo, registro, pestañas de tablero y drag/resize,
  porque Principal queda fijo y los tableros de usuario son opcionales. Se documenta en
  `docs/design/redesign-audit.md` §3–§6 y `docs/design/widgets.md` §5–§6 (unidad U10).
- Propiedad de ficheros por unidad: la tabla de `plans/XR-031-dashboards-research/PLAN.md`
  §2.11 manda; un diff que toque ficheros de otra unidad se rechaza.

## 4. Verificacion
- [ ] bash evals/smoke.sh          → exit 0
- [ ] bash evals/checks/XR-031.sh    → exit 0   # nacio en rojo sobre main
- [ ] capturas en plans/XR-031-dashboards-research/evidence/ (00–07) y measures-tr.txt

Esta seccion puede incluir lineas web_test / api_test / py_test: en backend y en
logica de front, el test va primero y el test que FALLA es el check rojo. Escribe
la linea del test antes que el codigo, no despues.

## 5. Prioridades (de arriba abajo)
1. Tests en rojo (builder T) con los nombres del plan §2.1–§2.9, en un solo commit.
   -> `bash evals/checks/XR-031.sh` sale ≠ 0.
2. U5a API: `params.ts`, tres mappers, tests, docs y ejemplos regenerados. -> `api_test v2`
3. U5b cimientos web: `lib/api-v2.ts` + `query-keys.ts` + fixtures, `selection.ts` (slots A/B,
   `selectedGroup`), `index.css` (§2.2 y §2.8), `design/tokens.ts` + test, `Segmented`,
   `CompanyPicker`, `LineNoAxes`, `format.ts`, `docs/design/tokens.md` y `charts.md`.
   -> `web_test lib/api-v2`, `design/tokens`, `charts/`, `components/ui/segmented`,
   `components/CompanyPicker`, `dashboard/selection`
4. U1 modelo de tableros: `types.ts`, `store.ts`, `grid.ts`, `registry.ts`, `thumbnails.tsx`,
   `register-all.ts` (tres), prop `entity` en `ResearchPanel`, boot en `App.tsx`.
   -> `web_test dashboard/dashboards-store`, `dashboard/grid`, `widgets/registry`
5. U2 lienzo y marco: `Grid.tsx`, `WidgetFrame.tsx`, `useCompanyName.ts`, `use-media-query.ts`,
   `routes/dashboard.tsx`, borrado de `panels/Panel.tsx`. -> `web_test dashboard/Grid`,
   `widgets/WidgetFrame`, `components/app-shell`
6. U3 topbar, catalogo y fondo: `DashboardTabs`, `AddWidgetButton`, `WidgetCatalog`,
   `Background` con foco, tests de `topbar` y `app-shell`. -> `web_test components/topbar`,
   `dashboard/WidgetCatalog`, `components/Background`
7. U4 widgets Alertas, Mapa y Grupo + registro de seis. -> `web_test widgets/`
8. U6 Empresas por grupos con desglose y pagina por alto. -> `web_test panels/companies`
9. U7 Investigacion: cabecera de tres KPIs, `Segmented` de rango y familia, hover controlado,
   `FamilyStats`, `Methodology`. -> `web_test panels/research`
10. U8 Comparativa A/B con `CompanyPicker`. -> `web_test panels/compare`
11. Motion y pulido (`design-find-animations` → `design-animate`): asentamiento del drag,
    indicador del segmented, catalogo, foco, hover de tarjetas; `web-design-guidelines`.
12. Cierre (U10): `docs/design/widgets.md`, `redesign-audit.md`, borrado de
    `routes/prototypes/background/*` y su ruta DEV, capturas, `compound`, `features/NOTES.md`.
