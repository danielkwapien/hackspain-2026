#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# XR-037 · Kima. Se ejecuta contra servidores levantados DESDE ESTE WORKTREE:
#   API_URL=http://localhost:8798 BASE_URL=http://localhost:4199 bash evals/checks/XR-037.sh
# `ensure_server` reutiliza cualquier servidor que ya escuche en API_URL, y en
# 8787/5173 vive la sesion del Gate sobre main: con los puertos por defecto esto
# verificaria codigo de otra rama y saldria verde en falso.

# --- A1: datos y contrato (H1, H2, I3.b-backend) -----------------------------
# --- fin A1 ------------------------------------------------------------------

# --- A2: alertas (I2) --------------------------------------------------------
# --- fin A2 ------------------------------------------------------------------

# --- A3: limpieza de front (E3, E5, E12, I3.a, I1, I0) -----------------------
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
