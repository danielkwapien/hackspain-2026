#!/usr/bin/env bash
set -euo pipefail
CHECK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$CHECK_DIR/lib.sh"

# XR-038 · Kima, segunda pasada de UI. Se ejecuta contra servidores levantados
# DESDE ESTE WORKTREE:
#   API_URL=http://localhost:8790 BASE_URL=http://localhost:4180 bash evals/checks/XR-038.sh
# `ensure_server` reutiliza cualquier servidor que ya escuche en API_URL, y en
# 8787/5173 vive la sesion del Gate sobre main: con los puertos por defecto esto
# verificaria codigo de otra rama y saldria verde en falso.
#
# El check se reparte en `XR-038.parts/`, un fichero por fase, porque seis
# agentes en paralelo escribiendo el mismo fichero se pisan. Cada parte compone
# las primitivas de lib.sh y nada mas; el orden de carga es el de las fases.

for part in F0 F1 F2 F3 F4 F5 F6 F7; do
  [ -f "$CHECK_DIR/XR-038.parts/$part.sh" ] || continue
  echo "== XR-038: $part =="
  source "$CHECK_DIR/XR-038.parts/$part.sh"
done

# --- Invariantes del lote (orquestador) --------------------------------------
echo "== XR-038: invariantes =="
# La marca sigue viajando en el HTML que sirve el server.
text_visible / 'Kima'
# --- fin invariantes ---------------------------------------------------------
echo "XR-038: OK"
