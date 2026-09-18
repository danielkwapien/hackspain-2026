#!/usr/bin/env bash
# Gate de cierre de sesion (hooks Stop y SubagentStop). Es OPT-IN: sin marcador,
# no bloquea a nadie, para que las sesiones de otros miembros del equipo pasen.
#   .loop-on  -> modo loop: smoke completo, con circuit breaker a los 3 fallos.
#   .gate-on  -> modo humano: typecheck rapido.
#   ninguno   -> exit 0 inmediato.
set -uo pipefail

# El JSON del hook llega por stdin: se consume y se ignora sin romperse por el.
if [ ! -t 0 ]; then cat >/dev/null 2>&1 || true; fi

if [ -f .loop-on ]; then
  if bash evals/smoke.sh >/tmp/hackspain2026-gate-smoke.log 2>&1; then
    rm -f .gate-fails
    exit 0
  fi

  fails=$(( $(cat .gate-fails 2>/dev/null || echo 0) + 1 ))
  echo "$fails" > .gate-fails
  if [ "$fails" -ge 3 ]; then
    echo "CIRCUIT BREAKER: marcar fila stopped" >&2
    exit 0
  fi
  echo "gate: smoke en rojo (intento $fails/3)" >&2
  tail -15 /tmp/hackspain2026-gate-smoke.log >&2
  exit 2
fi

if [ -f .gate-on ]; then
  out=$( (cd app && corepack pnpm typecheck) 2>&1 )
  if [ $? -eq 0 ]; then exit 0; fi
  echo "gate: typecheck en rojo" >&2
  echo "$out" | tail -15 >&2
  exit 2
fi

exit 0
