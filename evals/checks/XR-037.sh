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
# --- fin B1 ------------------------------------------------------------------

# --- B2: color y grafica (E9, E11, E10) --------------------------------------
# --- fin B2 ------------------------------------------------------------------

# --- B3: contenido (E13, E14, E15, E16-parcial) ------------------------------
# --- fin B3 ------------------------------------------------------------------

# --- C1: pop-up en prosa (E17) -----------------------------------------------
# --- fin C1 ------------------------------------------------------------------

# --- C2: filtros del Mapa (I3.b-front) ---------------------------------------
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
