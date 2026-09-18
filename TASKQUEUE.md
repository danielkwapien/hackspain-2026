# TASKQUEUE.md — Cola de tickets X-Ray (UI/UX y datos mock)

**Single-writer:** solo la sesión orquestadora de cada ticket (mientras la fila está en `building`) y el
Gate (Alfonso) escriben aquí. `done` lo marca **solo** el Gate al mergear en `main`.
**Estados:** `todo → building → review → done | stopped`. La *frontier* son las filas en `todo` cuyas
`depends_on` están todas en `done`.
**Planes:** `plans/<ticket>/PLAN.md` (carpeta local, no versionada). Protocolo de sesión:
`plans/00-reference/session-protocol.md`. Cada fila lleva su rama `xr/<ticket>-<slug>`.
**Lanes:** `contenido` (una pantalla o módulo), `amplio` (varios módulos; exige `delta.md`),
`cerrado` (nunca automatizado).
**Reparto:** Alfonso = UI/UX y datos mock (esta cola). El motor de score real lo lleva otro compañero
fuera de esta cola; su punto de integración es el ticket XR-020.

## Cola

| # | Ticket | Título | Lane | Depende de | Estado | Dueño | Int. | Rama / PR | Plan |
|---|---|---|---|---|---|---|---|---|---|
| 0 | XR-000 | Arnés de loop engineering + skills de diseño en `.claude/`, `evals/`, `AGENTS.md`, plantillas | amplio | — | done | sesión padre | 0 | main `d707076` | — |
| 1 | XR-001 | Dataset mock completo del motor (`datasets_mocked/`) + API v2 que lo sirve | amplio | XR-000 | building | sesión XR-001 | 0 | xr/XR-001-mock-dataset (spec+check en `c44cf9e`) | plans/XR-001-mock-dataset/PLAN.md |
| 2 | XR-002 | Sistema de tokens Embat × Trade Republic, tipografía, semántica de datos, playground `/tokens` | contenido | XR-000 | review | sesión XR-002 | 0 | xr/XR-002-design-tokens `562f2af` (evidencia en plans/XR-002-design-tokens/evidence/) | plans/XR-002-design-tokens/PLAN.md |
| 3 | XR-003 | Shell de tablero: topbar con espacios, rejilla 24 col de widgets (drag/resize/dup), marco con selector de entidad y vínculo, widget Buscador y Score simple | amplio | XR-001, XR-002 (arranque anticipado permitido: plan §11, pasos 1–3) | todo | | 0 | xr/XR-003-widget-shell | plans/XR-003-widget-shell/PLAN.md |
| 4 | XR-004 | Widget Empresa: cabecera score/outlook, gráfica con banda y régimen, carrusel de familias, tabs Señales/Alertas/Datos, ruta `/company/:id` | amplio | XR-003 | todo | | 0 | xr/XR-004-company-widget | plans/XR-004-company-widget/PLAN.md |
| 5 | XR-005 | Widget Comparador: varias empresas en una gráfica, rangos, normalización a 100, leyenda con Δ | contenido | XR-004 | todo | | 0 | xr/XR-005-compare-widget | plans/XR-005-compare-widget/PLAN.md |
| 6 | XR-006 | Widget Watchlist (Favoritos): añadir/quitar, sparkline, Δ1m/Δ3m, última alerta, persistido | contenido | XR-003 | todo | | 0 | xr/XR-006-watchlist | plans/XR-006-watchlist/PLAN.md |
| 7 | XR-007 | Widget Mi grupo (Tu cartera): filiales del grupo, score de grupo, dispersión, filial más débil | contenido | XR-004 | todo | | 0 | xr/XR-007-group-widget | plans/XR-007-group-widget/PLAN.md |
| 8 | XR-008 | Widget Mapa (treemap): agrupar por grupo/país/ERP, tamaño = cobros, color = Δ3m, filtros en pills | contenido | XR-003 | todo | | 0 | xr/XR-008-treemap | plans/XR-008-treemap/PLAN.md |
| 9 | XR-009 | Widget Alertas (Monitor): bandeja con severidad, filtros, detalle, marcar revisada; sustituye `/monitor` | contenido | XR-004 | todo | | 0 | xr/XR-009-alerts-widget | plans/XR-009-alerts-widget/PLAN.md |
| 10 | XR-010 | Widget Salud de cartera (Tu rendimiento): score medio ponderado, empresas en movimiento, gráfica grande | contenido | XR-003 | todo | | 0 | xr/XR-010-portfolio-health | plans/XR-010-portfolio-health/PLAN.md |
| 11 | XR-011 | Replay temporal: scrubber global de mes en topbar, play/pause, todos los widgets siguen `as_of`, toasts de alerta | amplio | XR-004, XR-009 | todo | | 0 | xr/XR-011-replay | plans/XR-011-replay/PLAN.md |
| 12 | XR-012 | Sistema de gráficas compartido: primitivas (línea sin ejes, sparkline, barra de rango, área de banda, treemap), tooltips, colores por régimen | amplio | XR-002 | todo | | 0 | xr/XR-012-chart-primitives | plans/XR-012-chart-primitives/PLAN.md |
| 13 | XR-013 | Presets de tablero por rol (CFO de grupo, Analista de riesgo, Monitor) y exportar/importar layout | contenido | XR-006, XR-007, XR-008 | todo | | 0 | xr/XR-013-presets | plans/XR-013-presets/PLAN.md |
| 14 | XR-014 | Motion y pulido global: transiciones, hover, skeletons, vacíos, teclado, reduced-motion; auditoría `design-review-animations` | contenido | XR-004 | todo | | 0 | xr/XR-014-motion-polish | plans/XR-014-motion-polish/PLAN.md |
| 15 | XR-015 | Auditoría UX/a11y (`web-design-guidelines`) y contraste en todas las vistas; correcciones | contenido | XR-014 | todo | | 0 | xr/XR-015-ux-audit | plans/XR-015-ux-audit/PLAN.md |
| 16 | XR-016 | Widget Drivers / Explicación: «qué se movió», penalización y techos, narrativa; what-if ligero (mover una señal y ver el score) | contenido | XR-004 | todo | | 0 | xr/XR-016-drivers-whatif | plans/XR-016-drivers-whatif/PLAN.md |
| 17 | XR-017 | Página de grupo `/group/:id`: widget de grupo maximizado + filiales + intercompany | contenido | XR-007 | todo | | 0 | xr/XR-017-group-page | plans/XR-017-group-page/PLAN.md |
| 18 | XR-018 | Búsqueda global (⌘K): empresas, grupos, widgets, espacios | contenido | XR-003 | todo | | 0 | xr/XR-018-command-palette | plans/XR-018-command-palette/PLAN.md |
| 19 | XR-019 | QA visual recurrente contra Trade Republic: checklist por widget, pares de capturas, diff de tokens | contenido | XR-004 | todo | | 0 | xr/XR-019-visual-qa | plans/XR-019-visual-qa/PLAN.md |
| 20 | XR-020 | Integración con el motor real: adaptador de exports del motor → mismas tablas/endpoints v2, flag mock/real, tests de contrato | amplio | XR-001 | todo | | 0 | xr/XR-020-engine-integration | plans/XR-020-engine-integration/PLAN.md |
| 21 | XR-021 | Despliegue público: web en Vercel, API en Cloud Run/Vercel, variables, prueba desde otro dispositivo | cerrado | XR-011 | todo | | 0 | xr/XR-021-deploy | plans/XR-021-deploy/PLAN.md |
| 22 | XR-022 | Demo: guion, casos narrativos fijados, seed del tablero de demo, vídeo para el jurado | cerrado | XR-021 | todo | | 0 | xr/XR-022-demo | plans/XR-022-demo/PLAN.md |
| 23 | XR-023 | Notificación de alertas a Slack (webhook) durante el replay | contenido | XR-011 | todo | | 0 | xr/XR-023-slack-webhook | plans/XR-023-slack-webhook/PLAN.md |
| 24 | XR-024 | Panel de auditoría: versión de parámetros, hash de entradas, catálogo de señales, trazabilidad de un score | contenido | XR-016 | todo | | 0 | xr/XR-024-audit-panel | plans/XR-024-audit-panel/PLAN.md |

## Frontier actual

XR-001 y XR-002 (en cuanto XR-000 esté `done`). Se pueden ejecutar **en paralelo** en dos sesiones:
no comparten ficheros (XR-001 toca `datasets_mocked/` y `app/api`; XR-002 toca `app/web/src/index.css`
y `design/`).

## Orden recomendado de sesiones

1. XR-001 ∥ XR-002 → 2. XR-003 → 3. XR-004 ∥ XR-012 → 4. XR-005 ∥ XR-006 ∥ XR-008 → 5. XR-007 ∥ XR-009 ∥
XR-010 → 6. XR-011 ∥ XR-016 → 7. XR-013 ∥ XR-014 ∥ XR-018 → 8. XR-015 ∥ XR-019 ∥ XR-020 → 9. XR-021 → 10. XR-022 ∥ XR-023 ∥ XR-024

## Reglas de esta cola

- Un ticket = una sesión = una rama. La sesión lee su plan, escribe spec y check en rojo, y ejecuta el
  loop con `/goal` (texto exacto en el protocolo §3).
- Tickets `design: true` usan Chrome con Trade Republic **solo para mirar**.
- `review` significa: dos pasadas limpias, adversary `PASS`, evidencia en `plans/<ticket>/evidence/`.
- Alfonso mergea a `main` y marca `done`. Nadie más.
- Si un ticket se para tres veces en el mismo item, pasa a `stopped` y el problema se arregla en el
  plan o en el spec, no en el código.
