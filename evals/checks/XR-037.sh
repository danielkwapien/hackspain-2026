#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# XR-037 · Kima. Se ejecuta contra servidores levantados DESDE ESTE WORKTREE:
#   API_URL=http://localhost:8798 BASE_URL=http://localhost:4199 bash evals/checks/XR-037.sh
# `ensure_server` reutiliza cualquier servidor que ya escuche en API_URL, y en
# 8787/5173 vive la sesion del Gate sobre main: con los puertos por defecto esto
# verificaria codigo de otra rama y saldria verde en falso.

# --- A1: datos y contrato (H1, H2, I3.b-backend) -----------------------------
# H1 · el pais del perfil manda en el directorio, el declarado viaja al lado y
# la industria llega a la ficha. COMP_1105 no declara pais y su perfil dice Chile.
api_json '/api/v2/companies/COMP_1105' \
  '.company.country == "Chile" and .company.country_declared == null
   and .company.industry == "industria y manufactura"'
# H1 · el grupo tiene pais propio y agrega los de sus filiales (GROUP_0090: 4).
api_json '/api/v2/groups/GROUP_0090' \
  '.group.country == "España"
   and (.group.countries | sort) == ["Alemania", "España", "Países Bajos", "Portugal"]'
# H2 · /meta deja de anunciar params y reference; params_version se queda.
api_json '/api/v2/meta' \
  '(has("params") | not) and (has("reference") | not)
   and (.params_version | startswith("sha256:"))'
# I3.b-backend · la dimension industry existe: 10 buckets, las 1.286 sociedades
# dentro y ninguna en «unknown».
api_json '/api/v2/treemap?group_by=industry' \
  '(.groups | length) == 10 and ([.groups[].items[]] | length) == 1286
   and ([.groups[] | select(.key == "unknown")] | length) == 0'
# I3.b-backend · agrupar por pais ya usa el normalizado: 38 buckets limpios, sin
# «unknown» (1.056 hoy) ni los `ES`/`ESPAÑA` de `companies.country`.
api_json '/api/v2/treemap?group_by=country' \
  '(.groups | length) == 38
   and ([.groups[] | select(.key == "unknown" or .key == "ES" or .key == "ESPAÑA")] | length) == 0'
# El mismo contrato sobre la publicacion real en miniatura y sobre el mock.
api_test test/temporal-engine.test.ts
api_test test/v2.test.ts
# --- fin A1 ------------------------------------------------------------------

# --- A2: alertas (I2) --------------------------------------------------------
# Las cuatro causas nuevas (band_drop, cap_applied, concentration, score_drop)
# se deciden en el SQL de `core/publish_alerts.py`; el test las ejerce sobre un
# libro minimo en DuckDB local, sin tocar MotherDuck ni las tablas originales.
py_test core/tests/test_publish_alerts.py
# --- fin A2 ------------------------------------------------------------------

# --- A3: limpieza de front (E3, E5, E12, I3.a, I1, I0) -----------------------
# E3 · la version del motor no se pinta con datos reales; solo la avisa el mock.
web_test src/components/topbar.test.tsx
# E5 · fuera la narrativa bajo el nombre. E12 · el delta del pilar sin «· 1A».
web_test src/panels/research/ResearchPanel.test.tsx
# I0 · Investigacion abre primero y el localStorage viejo ya no lo tapa.
web_test src/dashboard/fixed/fixed.test.ts
# I1 · el widget se titula «Busquedas» y su columna «n» pasa a «Filiales».
web_test src/widgets/registry.test.ts
web_test src/panels/companies/CompanyTree.test.tsx
# I3.a · el raton sobre una ficha del Mapa no reescribe la linea del censo.
web_test src/widgets/treemap/TreemapWidget.test.tsx
# --- fin A3 ------------------------------------------------------------------

# --- B1: marca, identidad y jerarquia (E2, E1, E4, E6, E7, E8) ---------------
# E2 · la marca es «Kima» con su logo y su inicial; «X-Ray» ya no vive en el front.
web_test src/components/topbar.test.tsx
web_test src/components/app-shell.test.tsx
# E1 · el demo arranca con COMP_0169 (la matriz de GROUP_0090) ya seleccionada, no
# con el lienzo vacio y el «Selecciona una empresa o un grupo en el buscador».
web_test src/dashboard/selection.test.ts
# E4 · el titulo del widget usa --text-widget-title (18 px), no --text-panel-title.
web_test src/widgets/WidgetFrame.test.tsx
# E7.c · un solo baremo de color para la confianza, para que la ficha y
# «Estadisticas clave», que ensenan la misma cifra, no diverjan.
web_test src/lib/regime.test.ts
web_test src/widgets/research-deep/KeyStats.test.tsx
# E6, E7, E8 · el nombre en --text-figure, el score sin «pts» con su delta desnudo
# al lado y la fila de identidad en burbujas, con el regimen escrito con su color
# (la compensacion obligatoria de E9) y el dinero a la derecha.
web_test src/panels/research/ResearchPanel.test.tsx
web_test src/panels/research/EntityIdentity.test.tsx
# --- fin B1 ------------------------------------------------------------------

# --- B2: color y grafica (E9, E11, E10) --------------------------------------
# E9 · el score va siempre en --chart-score, que pasa a ser el aqua apagado, y
# Liquidez se muda al primitivo nuevo --tone-rose para no chocar con el.
web_test src/design/tokens.test.ts
# E9, E11 · `scoreChart` sin regimen en los puntos y sin baseline, `pillarChart`
# con el score en azul detras, y la leyenda de dos puntos sobre la grafica.
web_test src/panels/research/SheetChart.test.tsx
# E9, E11 · lo mismo sobre el panel de verdad: en la vista de familia las dos
# lineas se distinguen (rosa contra azul) y ya no hay baseline punteada.
web_test src/panels/research/ResearchPanel.test.tsx
# E10 · la seleccion de picos: extremos locales por prominencia, descarte por
# solapamiento y el valor actual dentro.
web_test src/charts/peak-labels.test.ts
# E10 · el presupuesto de burbujas por rango, que vive en RANGES.
web_test src/panels/research/series.test.ts
# E10 · la burbuja se pinta en la capa HTML, nunca en el SVG, y `peaks` por
# defecto 0: la Comparativa, que superpone dos series, no pinta ninguna.
web_test src/charts/LineNoAxes.test.tsx
# --- fin B2 ------------------------------------------------------------------

# --- B3: contenido (E13, E14, E15, E16-parcial) ------------------------------
# E13 · «Senales» ya no repite la fila de pilares ni triplica las perspectivas:
# en su sitio va la fila de tesoreria, con las cuatro senales publicadas de
# mejor cobertura (buffer_days, cash_trend, neg_cash_share, net_ocf_ratio) y las
# dos cifras del libro de clientes. Sin burn rate: no esta publicado y
# `buffer_days` ya es el runway.
web_test src/panels/research/TreasuryRow.test.tsx
# E13 · las dos ultimas tarjetas salen del endpoint de contrapartes de XR-036,
# medido sobre el corte real y no sobre un fixture.
api_json '/api/v2/companies/COMP_0169/counterparties?side=ar' \
  '.summary.n_counterparties > 0 and .summary.effective_counterparties > 0
   and (.summary.overdue_total | type) == "number"'
# E14 · «Contexto»: fuera `current_health` (que es el nivel del score otra vez),
# cuatro tarjetas con etiqueta en espanol escrita en el front, barra 0-100, dos
# claves de evidencia traducidas y el ajuste al score solo con `modifier_applied`.
web_test src/panels/research/StrategicCards.test.tsx
# E14 · el porque sigue vivo en la publicacion: `current_health` viaja con
# `label: null` y solo algunas perspectivas mueven de verdad el score.
api_json '/api/v2/companies/COMP_0169' \
  '([.strategic_signals[] | select(.name == "current_health" and .label == null)] | length) == 1
   and ([.strategic_signals[] | select(.modifier_applied == true)] | length) >= 1'
# E14 · el diccionario de etiquetas y de evidencia se indexa con degradado: un
# codigo que el motor publique y el front no conozca no tumba la tarjeta.
web_test src/lib/definitions.test.ts
# E15 · las fortalezas bajan bajo la grafica como «Conclusion»: la fila pasa a
# seis columnas y vuelve a cinco cuando la empresa no tiene ninguna.
web_test src/panels/research/KpiRow.test.tsx
# E15 · lo mismo sobre el panel de verdad, con las dos filas hermanas en glass.
web_test src/panels/research/ResearchPanel.test.tsx
# E15 · y la ficha de grupo, que lleva su dinero a la fila de identidad como la
# de empresa: `SheetFacts` deja de existir.
web_test src/panels/research/GroupSheet.test.tsx
# E16-parcial · Investigacion profunda pierde «Health score» y abre en Liquidez:
# el `Segmented` se queda en las cinco familias.
web_test src/widgets/research-deep/ResearchDeepWidget.test.tsx
# --- fin B3 ------------------------------------------------------------------

# --- C1: pop-up en prosa (E17) -----------------------------------------------
# --- fin C1 ------------------------------------------------------------------

# --- C2: filtros del Mapa (I3.b-front) ---------------------------------------
# I3.b · el dato que sostiene los cuatro filtros viaja en una fila por sociedad,
# al lado de `groups`: las 1.286, los 38 paises del perfil, las 10 industrias y
# las 541 sin ERP, que son exactamente las que recupera la opcion «Sin ERP» (sin
# ella desaparece el 42 % del universo al filtrar y nadie sabe por que).
api_json '/api/v2/treemap' \
  '(.companies | length) == 1286
   and ([.companies[].country] | unique | length) == 38
   and ([.companies[].industry] | unique | length) == 10
   and ([.companies[] | select(.erp == null)] | length) == 541'
# I3.b · el front: `UniverseValue` deja de ser la cadena `"country:ES"` y pasa a
# ser `{ list, country, industry, erp }` aplicado en AND. Con los cuatro en su
# defecto entra el universo entero, «Sin ERP» es una opcion de verdad, los tres
# de dimension viven en un cajon (seis desplegables a 432 px se van a tres
# renglones y le comen 64 px al mapa) y el cruce que lo vacia dice que filtro
# corta y ofrece quitarlo.
web_test src/widgets/treemap/TreemapHeader.test.tsx
web_test src/widgets/treemap/TreemapWidget.test.tsx
# --- fin C2 ------------------------------------------------------------------

# --- Invariantes del lote (orquestador) --------------------------------------
# La marca nueva viaja en el HTML que sirve el server.
text_visible / 'Kima'
# Ninguna sociedad pierde su pais: el perfil manda y el declarado sobrevive.
api_json '/api/v2/treemap' \
  '[.companies[] | select(.country != null and .country != "")] | length == 1286'
api_json '/api/v2/treemap' \
  '[.companies[] | select(.country_declared != null and .country_declared != "")] | length == 230'
# --- fin invariantes ---------------------------------------------------------
