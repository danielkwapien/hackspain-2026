# NOTES — heartbeat del loop

Cada pasada de queue-run añade aqui una entrada con timestamp y la tabla actual
de TASKQUEUE.md. Es el latido: si esto no crece, el loop esta parado.

## 2026-09-19 00:43 — XR-002 (sesión XR-002)

Fila XR-002 `building` → `review`. Rama `xr/XR-002-design-tokens`, seis commits sobre `d707076`
(el arnés de XR-000, que todavía no está en `main`: la rama se sacó de ahí, no de `main`, porque
un worktree desde `main` no tiene `evals/` ni `AGENTS.md`).

- `bash evals/checks/XR-002.sh` y `bash evals/smoke.sh` en verde en dos pasadas consecutivas
  (commits `cbe27aa` y `498f636`). Evidencia en `plans/XR-002-design-tokens/evidence/`.
- Desviaciones del protocolo, anotadas como pide §0: los builders trabajaron en el worktree del
  ticket y no en uno propio (son secuenciales y el worktree ya está aislado del directorio
  compartido), y la comparación con Trade Republic se hizo con el navegador integrado de la
  sesión —Chrome con la extensión no estaba conectado—, midiendo con `getComputedStyle` en vez
  de guardar PNG del lado de TR.
- `TASKQUEUE.md` no existe en el worktree (está sin commitear en el directorio principal): la fila
  se actualizó allí.
