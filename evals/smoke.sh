#!/usr/bin/env bash
# Verificacion completa del repo: typecheck + test + build del front (+ pytest de
# app/tools si tiene tests), con lock global para que dos builds pesados nunca
# corran a la vez (backpressure). macOS no trae flock: el lock es un mkdir atomico.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK=/tmp/hackspain2026-smoke.lock

_smoke_release() { rmdir "$LOCK" 2>/dev/null || true; }

# mkdir es atomico: gana quien lo crea. Espera hasta 10 min.
got_lock=0
for _ in $(seq 1 600); do
  if mkdir "$LOCK" 2>/dev/null; then
    got_lock=1
    trap _smoke_release EXIT
    break
  fi
  sleep 1
done
if [ "$got_lock" != "1" ]; then
  echo "FAIL smoke: no se pudo adquirir el lock en 10 min" >&2
  exit 1
fi
echo "smoke: lock adquirido ($(date +%T))"

run_step() {
  local nombre="$1"; shift
  echo "== smoke: $nombre =="
  if ! "$@"; then
    echo "FAIL smoke: $nombre" >&2
    exit 1
  fi
}

run_step "corepack pnpm typecheck" bash -c "cd '$ROOT/app' && corepack pnpm typecheck"
run_step "corepack pnpm test" bash -c "cd '$ROOT/app' && corepack pnpm test"
run_step "corepack pnpm --filter web build" bash -c "cd '$ROOT/app' && corepack pnpm --filter web build"

if [ -d "$ROOT/app/tools/tests" ]; then
  run_step "uv run pytest -q (app/tools)" bash -c "cd '$ROOT/app/tools' && uv run pytest -q"
fi

echo "smoke: OK ($(date +%T))"
