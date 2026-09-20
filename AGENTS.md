# Trabajar en este repo

Kima: un score de salud financiera y el producto que va encima. El motor está en
`core/` (Python) y el producto en `app/` (Fastify + React). Empieza por
[`README.md`](README.md); cómo se calcula el score, en [`docs/engine.md`](docs/engine.md).

## Comandos

| Qué | Comando |
| --- | --- |
| Dev (API 8787 + web 5173) | `cd app && corepack pnpm dev` |
| Dev front / API por separado | `corepack pnpm --filter web dev` · `--filter api dev` |
| Typecheck | `cd app && corepack pnpm typecheck` |
| Test | `cd app && corepack pnpm test` |
| Build | `cd app && corepack pnpm --filter web build` |
| Tests del motor | `.venv/bin/python -m pytest core/tests -q` |
| Tests Python de `app/tools` | `cd app/tools && uv run pytest -q` |

Verificación completa antes de abrir una PR: los cuatro primeros, más los del motor.

## Reglas duras

- **`core/` no lee ni escribe dentro de `app/`.** La frontera entre los dos es una
  publicación versionada en MotherDuck, congelada en
  [`docs/publication-contract.md`](docs/publication-contract.md). La API no recalcula nada.
- **El score no puede depender de la cohorte cargada.** Anclas y techos son absolutos, y
  un mes nunca mira meses futuros. Lo comprueba `core/tests/test_isolation.py`, que es la
  garantía del test oculto.
- **Antes y después de cada cambio de fórmula se compara `core/evaluate.py`.** Si una
  métrica empeora, el cambio no entra.
- **Todo parámetro del motor vive en `core/engine/config.py`.** Ningún otro módulo del
  paquete lleva constantes sueltas.
- **Ningún hex literal en `app/web/src/**/*.tsx`**: los componentes consumen tokens. Hay un
  test que lo vigila.
- En Trade Republic, MotherDuck y cualquier cuenta real **solo se observa, nunca se escribe**.
- Prohibido `git stash`, `git reset` y `git checkout .`: solo commits de ficheros concretos.
- Commits en inglés, formato `<área>: <qué>`, sin co-author, sin atribución a IA y sin emojis.

## Trampas que ya costaron caras

- **Nunca pares un servidor con `pkill -f`**: te llevas por delante las APIs de otras
  sesiones. Por PID exacto, siempre.
- **MotherDuck limita las conexiones por token.** Con muchas APIs abiertas, las nuevas dan
  `503 source_unavailable` mientras las viejas siguen sirviendo. No es que el origen esté
  caído: sobran servidores.
- **`docs/api/examples/*.json` no son solo documentación**: `app/web/src/test/examples.ts`
  los importa como fixtures. Cambiarlos rompe el typecheck de `web`.
- **Un test verde no prueba que la pantalla funcione.** Un `Record` indexado por un dominio
  cerrado del contrato y alimentado con datos del motor es una bomba de relojería, y los
  fixtures no la ven.
- **Antes de dimensionar nada por dinero, mira la moneda**: el dataset trae 39 y no hay
  tabla de cambio. Sumar importes entre monedas da un gráfico precioso y falso.
- **El dataset original es privado** y no viaja en el repositorio. Sin `datasets/` los
  pipelines no arrancan y dos tests del motor se saltan; la API sigue sirviendo lo publicado.
