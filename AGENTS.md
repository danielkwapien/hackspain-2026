# Trabajar en este repo

Los agentes construyen y los comandos verifican. Cada tarea vive en la cola
(`TASKQUEUE.md`) con su spec (`features/<id>/spec.md`) y su check ejecutable
(`evals/checks/<id>.sh`), y nada se da por hecho sin un comando que pasa o falla.

## La doctrina

1. El verificador ES el loop: sin comando que pasa o falla, una tarea no entra en la cola.
2. Red-first: todo check de feature debe FALLAR sobre main antes de encolarse.
3. El que construye nunca verifica: builder, scorer y adversary son agentes separados.
4. Memoria en disco (specs, cola, lecciones, git); `evals/` es intocable para el builder.
5. Humano en dos puntos: planificar (specs y mocks) y mergear (el Gate marca done).

## Reglas duras

- `evals/` es intocable para agentes builder: es el examen. Si un check parece
  mal, se reporta, no se edita.
- `TASKQUEUE.md` es single-writer: solo `queue-run` (el orquestador del loop) y
  el Gate humano lo escriben. Ningún builder lo toca.
- Prohibido `git stash`, `git reset`, `git checkout .`: solo commits de ficheros
  concretos.
- Commits en inglés, formato `<área>: <qué>`, sin co-author, sin atribución a IA
  y sin emojis.
- En Trade Republic (y cualquier cuenta real) NUNCA se escribe: solo se observa.
  Nada de operar, mover dinero ni cambiar configuración.
- `plans/` está gitignored y nunca se commitea.

## Comandos

| Qué | Comando |
| --- | --- |
| Dev (todo el workspace) | `cd app && corepack pnpm dev` |
| Dev front (5173) | `cd app && corepack pnpm --filter web dev` |
| Dev API (8787) | `cd app && corepack pnpm --filter api dev` |
| Typecheck | `cd app && corepack pnpm typecheck` |
| Test | `cd app && corepack pnpm test` |
| Build | `cd app && corepack pnpm --filter web build` |
| Lint front | `cd app && corepack pnpm --filter web lint` |
| Tests Python | `cd app/tools && uv run pytest -q` |
| Verificación completa | `bash evals/smoke.sh` (desde la raíz) |
| Check de una feature | `bash evals/checks/<id>.sh` |

## Layout

```
app/web/        React 19 + Vite 8 + Tailwind 4 + shadcn + vitest (puerto 5173)
app/api/        Fastify 5 + tsx + vitest (puerto 8787)
app/tools/      Python (uv, pytest)
datasets/       Datos originales del reto (solo lectura)
datasets_mocked/ Datos derivados para demo
features/       Un directorio por feature: spec.md, app.html, verification/
evals/          smoke.sh + checks/ (lib.sh y un check por feature) — intocable
plans/          Planes de sesión (gitignored, nunca se commitea)
docs/           Documentación y plantillas (docs/templates/)
TASKQUEUE.md    La cola, en la raíz. Single-writer.
```

## El gate

El hook de cierre (`.claude/hooks/gate.sh`) es **opt-in**: sin marcador sale 0 y
no bloquea a nadie.

- `.loop-on` en el cwd: modo loop, corre `bash evals/smoke.sh`; circuit breaker
  a los 3 fallos seguidos (entonces deja cerrar y la fila va a stopped).
- `.gate-on` en el cwd: modo humano, corre `cd app && corepack pnpm typecheck`.
- Sin ninguno: exit 0 inmediato.

## Primitivas de check

Los checks de feature componen SOLO estas funciones de `evals/checks/lib.sh`:
`route_ok`, `text_visible` (solo HTML server-side), `api_json` (requiere jq),
`web_test`, `api_test`, `py_test`, `flow` (Playwright, opcional). Si falta una
primitiva, se reporta; no se inventa dentro del check.

## Git snapshots

Commitea cada estado estable y funcional antes de pasar a la siguiente tarea,
para tener siempre un estado conocido-bueno al que volver.

## Lecciones

- Previsualizar un worktree en el puerto 5173: `app/api` solo acepta origen 5173/4173,
  así que un segundo `dev` en 5174 devuelve la pantalla vacía con errores de CORS. Para
  a la web del directorio principal antes de levantar la del worktree. Y arranca ese
  `dev` tú desde el worktree: `preview_start` usa el directorio de trabajo principal,
  o sea `main`, y te enseña una build sin tus cambios sin avisarte de nada.
- Para quitar de tu rama un cambio en un fichero compartido (`TASKQUEUE.md`), restaura
  desde el merge-base —`git restore --source=$(git merge-base main HEAD) -- <fichero>`—
  y nunca desde `main`: si `main` avanzó, copias a tu rama filas de otros tickets y tu
  merge las reclama como tuyas.
- Un agente `builder` con `isolation: worktree` nace de `origin/main`, no de la rama de la sesión:
  su primera orden es `git merge --no-edit xr/<ticket>` y el orquestador integra su commit con
  `git cherry-pick <hash>`, nunca con `git merge` de su rama (arrastraría todo `main`).
- Los `adversary` prueban con tests temporales y a veces los dejan (`__probe*`, `zzz-*`): antes de
  cada `smoke.sh`, `git status --short` y borra lo que no sea tuyo; un test sonda ajeno rompe el typecheck.

## Decisiones

- `TASKQUEUE.md` vive en la RAÍZ del repo (no en `features/`): es el fichero que
  el equipo abre más veces y el `/goal` lo nombra literal.
- `plans/` está gitignored: los planes son de sesión, no del repo. Lo que debe
  sobrevivir se escribe en `features/<id>/spec.md` o en este fichero.
- El gate es opt-in (`.loop-on` / `.gate-on`): el repo es compartido y ninguna
  sesión de un compañero debe quedarse bloqueada por un hook que no pidió.
- `evals/checks/lib.sh` arranca los dev servers si no responden y los para al
  salir del check: los checks son autocontenidos, no asumen server levantado.
- Cuando un agente muera por límite de cuota, no relances su unidad desde cero: su worktree conserva los cambios sin commitear y `git diff` en él se aplica tal cual sobre la rama del ticket.
