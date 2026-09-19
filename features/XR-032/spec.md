---
feature: XR-032
depends_on: [XR-031]
parallel: true
conflicts_with: []
lane: amplio
verify: evals/checks/XR-032.sh
max_attempts: 3
---
# Spec: XR-032

Este fichero es a la vez la spec de construccion y el checklist de verificacion.
Esta escrito para re-entrar SIN memoria de la pasada anterior.

## Protocolo de cada pasada
1. Ejecuta la verificacion (seccion 4) ANTES de escribir codigo. Nunca empieces
   escribiendo: empieza descubriendo que esta fallando ahora mismo.
2. Arregla UNA cosa: el item rojo de mayor prioridad en la seccion 5.
3. Re-ejecuta la seccion 4 y demuestra que ese item esta ahora en verde.
4. Commit ("XR-032: <item>") y termina la pasada.

## 1. Objetivo
Dos tableros fijos («Empresa» con Investigación e Investigación profunda; «Investigación» con Mapa, Empresas, Favoritos, Cartera, Comparativa y Alertas), buscador central de empresas y grupos, gráficas con transición de rango, presente fijo a la derecha y eje de fechas, Mapa con nombres, Favoritos y Cartera, informe de Health pregenerado y una sola familia tipográfica (Inter), sobre el shell de XR-031.

## 2. Comportamiento (escenarios verificables)
- DADO la API v2 CUANDO se piden `/universe`, `/companies/:id/timeline`, `/alerts` y `/companies/:id/report` ENTONCES las empresas llevan `group_name`, cada fila de timeline lleva `pillars`, las alertas llevan `company_name`, el informe de una empresa con fichero se sirve y sin fichero responde `404 report_not_found`.
- DADO `/companies/COMP_0004/timeline` CUANDO se lee la primera fila ENTONCES `pillars.L.value` no es nulo.
- DADO `/universe?limit=1` CUANDO se lee el primer item ENTONCES tiene la clave `group_name`.
- DADO `index.css` CUANDO se leen los tokens ENTONCES `--font-sans` empieza por «Inter Variable», `--font-mono` no existe, los pesos son 500/600/700, `--text-tile` es 16px y ningún `.tsx` lleva `font-mono` ni `font-[NNN]`.
- DADO `lib/` CUANDO se ejecutan sus tests ENTONCES los tipos del cliente v2 casan con los ejemplos (pillars, report, group_name), `definitions` cubre las 28 señales y 5 pilares con etiquetas ≤ 18 caracteres y `entity.kindOf` distingue grupo de empresa.
- DADO `charts/` CUANDO se ejecutan sus tests ENTONCES `LineNoAxes` conserva el número de comandos de `d` entre rangos, sitúa el presente al 78 % con forecast, pinta el eje de fechas, y `Treemap` imprime nombres con tamaño por área y cabeceras de grupo con Δ.
- DADO `components/` CUANDO se ejecutan sus tests ENTONCES la topbar muestra las pestañas Empresa e Investigación y el disparador centrado del buscador; el diálogo atrapa el foco, cierra con Escape y devuelve el foco; el `InfoTip` expone `role=tooltip`; el overlay lista grupos y empresas y elegir uno cierra y selecciona.
- DADO `dashboard/` CUANDO se ejecutan sus tests ENTONCES el activo por defecto es «Empresa», «Investigación» tiene seis widgets, los fijos no admiten mutaciones, `active: "main"` persistido cae a «empresa», `selectedEntity` se deriva de `select`/`selectGroup`, la watchlist se siembra y persiste, y el catálogo ofrece nueve tipos.
- DADO `widgets/` CUANDO se ejecutan sus tests ENTONCES el registro deja nueve tipos en orden, Investigación profunda muestra estadísticas clave por familia, filiales en modo grupo y los dos diálogos (informe 200/404/500), Favoritos y Cartera pintan sus filas, y el Mapa agrupa por grupo/país/ERP con nombres y sin pie.
- DADO `panels/companies` CUANDO se ejecutan sus tests ENTONCES el árbol extraído conserva treegrid, teclado y estados, y cada fila lleva estrella de favorito (clic y tecla `f`).
- DADO `panels/research` CUANDO se ejecutan sus tests ENTONCES la cabecera muestra Score · Δ rango · Confianza · Outlook 6 m, el menú de métrica cambia la gráfica a una familia con score fantasma, la fila de KPIs lleva ⓘ y % del rango, «Señales» muestra 5 drivers, el modo grupo pinta la ficha consolidada y no hay metodología en el widget.
- DADO `panels/compare` CUANDO se ejecutan sus tests ENTONCES la Comparativa pinta el eje de fechas y conserva el número de comandos al cambiar de rango.

## 3. Fuera de alcance
- `evals/`, `TASKQUEUE.md`, `datasets_mocked/`, `core/`: intocables para builders.
- `app/api` y `app/tools`: solo la unidad U2 (`src/v2/{routes,store,app}.ts`, `test/**`, `data/reports/**`, `gen_health_reports.py`, `pyproject.toml`, `README.md`, `tests/`); rutas v1 no se reescriben.
- Dependencias nuevas: solo `@fontsource-variable/inter` (web) y `anthropic`/`httpx` (grupo `reports` de `app/tools`). Nada más.
- Sin literales de color fuera de `index.css`; toda cifra con `.num` (tabular-nums); `is_available=false` / `value null` renderiza «No aplica» o «—», nunca 0; ninguna cifra inventada.
- Paleta ⌘K de widgets/espacios (XR-018) más allá del atajo que abre el buscador; presets (XR-013); replay (XR-011); what-if (XR-016); `/audit`; `/group/:id`; edición de la cartera y persistencia en servidor; sector en el dataset; informe IA en vivo; drag/resize de `Grid`; hover compartido entre widgets.
- Los 5 informes reales (`app/api/data/reports/*.json`) los genera Alfonso con su clave; los builders solo dejan el script, la fixture y el estado «no disponible».

## 4. Verificacion
- [ ] bash evals/smoke.sh          → exit 0
- [ ] bash evals/checks/XR-032.sh    → exit 0   # nacio en rojo sobre main
- [ ] capturas en plans/XR-032-company-research-panels/evidence/ (Empresa, hover, familia, buscador, grupo, profunda, dos pop-ups, Investigación, mapa por país, estrella, catálogo de 9, reduced-motion) y measures-tr.txt

Esta seccion puede incluir lineas web_test / api_test / py_test: en backend y en
logica de front, el test va primero y el test que FALLA es el check rojo. Escribe
la linea del test antes que el codigo, no despues.

## 5. Prioridades (de arriba abajo)
1. Tests en rojo (builder T) → `bash evals/checks/XR-032.sh` ≠ 0.
2. U0 fuente única Inter (`web_test design/tokens`).
3. U2 API: `group_name`, `pillars` en timeline, `company_name` en alertas, `/report`, script de informes (`api_test v2`, `api_json`).
4. U7 gráficas: `time-scale`, comandos constantes, presente al 78 %, eje de fechas, Comparativa (`web_test charts/`, `panels/compare`).
5. U8 Mapa: nombres, cabeceras con Δ, agrupar Grupo/País/ERP, sin pie (`web_test charts/`, `widgets/`).
6. U3 cimientos: tipos v2, `definitions`, `entity`, `selectedEntity`, watchlist, `Dialog`, `InfoTip`, tokens nuevos (`web_test lib/`, `components/`, `dashboard/`).
7. U1 tableros fijos Empresa e Investigación, pestañas, `AddWidgetButton`, ruta (`web_test dashboard/`, `components/`).
8. U4 `CompanyTree` extraído, `SearchTrigger` + `EntitySearchOverlay`, topbar (`web_test components/`, `panels/companies`).
9. U9a Favoritos y Cartera + registro de nueve tipos (`web_test widgets/`, `dashboard/`).
10. U5 Investigación: cabecera, menú de métrica, `KpiRow`, `TopDrivers`, `GroupSheet` (`web_test panels/research`).
11. U6 Investigación profunda: `KeyStats`, familia, filiales, `ActionCards`, diálogos de metodología e informe (`web_test widgets/`, `panels/research`).
12. U9b estrella en `CompanyTree` (`web_test panels/companies`).
13. U11 pulido y motion; U10 docs, evidencia y `compound`.

### Desviaciones aceptadas
(se rellenan durante el loop)
