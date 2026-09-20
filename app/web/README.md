# web — el frontal de Kima

React 19 + Vite + Tailwind v4 + shadcn/ui, en tema oscuro, sobre la API de solo lectura de [`app/api`](../api/).

```bash
cd app && corepack pnpm --filter web dev    # 5173
corepack pnpm --filter web test
corepack pnpm --filter web build
```

`VITE_API_URL` apunta a la API; por defecto, `http://localhost:8787`. La API necesita su `MOTHERDUCK_TOKEN` para responder.

Un lienzo de tableros: dos fijos —**Empresa** e **Investigación**— y los que cree el usuario, con widgets arrastrables de un catálogo de diez. Un widget nuevo se registra en [`src/widgets/register-all.ts`](src/widgets/register-all.ts); el marco, el título y los estados los pone `WidgetFrame`, y los datos van por `lib/api-v2.ts` con las claves de `lib/query-keys.ts`.

Los tokens de diseño viven en [`src/index.css`](src/index.css) y la ruta `/tokens` los enseña en desarrollo. Las gráficas son SVG propio en [`src/charts/`](src/charts/): sin librería de gráficas y sin un solo hex literal, y hay tests que comprueban las dos cosas.

Qué significa el número que pinta: [`docs/engine.md`](../../docs/engine.md). El contrato que consume: [`docs/api/v2.md`](../../docs/api/v2.md).
