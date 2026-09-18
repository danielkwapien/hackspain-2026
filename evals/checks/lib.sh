#!/usr/bin/env bash
# Primitivas para checks de feature: un check son 3-6 lineas componiendo estas
# funciones. Si BASE_URL/API_URL no responden, la lib arranca los dev servers en
# segundo plano y los para al salir del check (ver AGENTS.md, Decisiones).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5173}"
API_URL="${API_URL:-http://localhost:8787}"
LIB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
_lib_pids=""
_lib_started=0

_lib_stop_servers() {
  local pid
  for pid in $_lib_pids; do
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done
}

# ensure_server: deja web y api respondiendo. Idempotente; no arranca lo que ya vive.
ensure_server() {
  [ "$_lib_started" = "1" ] && return 0
  _lib_started=1

  if ! curl -sf -o /dev/null "$API_URL"; then
    nohup bash -c "cd '$LIB_ROOT/app' && corepack pnpm --filter api dev" \
      >/tmp/xray-dev-api.log 2>&1 &
    _lib_pids="$_lib_pids $!"
  fi
  if ! curl -sf -o /dev/null "$BASE_URL"; then
    nohup bash -c "cd '$LIB_ROOT/app' && corepack pnpm --filter web dev" \
      >/tmp/xray-dev-web.log 2>&1 &
    _lib_pids="$_lib_pids $!"
  fi
  [ -n "${_lib_pids// /}" ] && trap _lib_stop_servers EXIT

  local url
  for url in "$API_URL" "$BASE_URL"; do
    local ok=0
    for _ in $(seq 1 60); do
      if curl -sf -o /dev/null "$url"; then ok=1; break; fi
      sleep 2
    done
    if [ "$ok" != "1" ]; then
      echo "FAIL ensure_server $url (120s sin responder; log en /tmp/xray-dev-*.log)"
      exit 1
    fi
  done
}

# route_ok <ruta> <status>: la ruta del front responde con el status esperado.
route_ok() {
  ensure_server
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL$1")
  [ "$status" = "$2" ] || { echo "FAIL route_ok $1 $2 (obtenido: $status)"; exit 1; }
}

# text_visible <ruta> <texto>: el texto aparece en el HTML que sirve el server.
# OJO: web es una SPA de Vite; esto SOLO ve HTML server-side (index.html). Para
# contenido renderizado por React usa web_test o flow.
text_visible() {
  ensure_server
  curl -s "$BASE_URL$1" | grep -qF -- "$2" || { echo "FAIL text_visible $1 $2"; exit 1; }
}

# api_json <ruta> <expr-jq>: la API responde un JSON que cumple la expresion jq.
api_json() {
  ensure_server
  command -v jq >/dev/null 2>&1 || { echo "FAIL api_json $1 (falta jq en el PATH)"; exit 1; }
  curl -s "$API_URL$1" | jq -e "$2" >/dev/null \
    || { echo "FAIL api_json $1 $2"; exit 1; }
}

# web_test <patron>: vitest de app/web filtrado por patron de fichero.
web_test() {
  ( cd "$LIB_ROOT/app" && corepack pnpm --filter web exec vitest run "$1" ) \
    || { echo "FAIL web_test $1"; exit 1; }
}

# api_test <patron>: vitest de app/api filtrado por patron de fichero.
api_test() {
  ( cd "$LIB_ROOT/app" && corepack pnpm --filter api exec vitest run "$1" ) \
    || { echo "FAIL api_test $1"; exit 1; }
}

# py_test <ruta>: pytest del venv raiz sobre la ruta indicada (desde la raiz).
py_test() {
  ( cd "$LIB_ROOT" && .venv/bin/python -m pytest -q "$1" ) \
    || { echo "FAIL py_test $1"; exit 1; }
}

# flow <spec>: OPCIONAL. Ejecuta un spec de Playwright de app/web/e2e/. Playwright
# no esta instalado por defecto: si un check lo usa, instalarlo antes.
flow() {
  ensure_server
  ( cd "$LIB_ROOT/app/web" && corepack pnpm exec playwright test "e2e/$1" ) \
    || { echo "FAIL flow $1"; exit 1; }
}
