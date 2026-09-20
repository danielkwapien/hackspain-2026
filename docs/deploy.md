# Desplegar Kima en Vercel

Guía de despliegue de la demo. En español como el resto de `docs/`.

Kima son **dos piezas** y hay que desplegar las dos:

| Pieza | Qué es | Dónde va | Qué necesita |
| --- | --- | --- | --- |
| `app/web` | SPA de React + Vite, build estática (`dist/`) | Proyecto Vercel **estático** | `VITE_API_URL` en build |
| `app/api` | Fastify 5 que lee MotherDuck con DuckDB nativo | Proyecto Vercel de **funciones** | `MOTHERDUCK_TOKEN` en runtime |

El frontal **no** sirve datos: sin API desplegada la pantalla queda en el estado de
«no se pudo contactar con la API». Por eso el orden es API → web → volver a la API.

> **Aviso honesto sobre el riesgo.** El binario nativo de DuckDB
> (`@duckdb/node-bindings-linux-x64`, ~100 MB) va dentro del bundle de la función y el
> límite de Vercel son 250 MB sin comprimir. Cabe, pero es el punto donde esto se
> rompe. Si el deploy de la API falla por tamaño o por no encontrar el `.node`, salta
> al [Plan B](#plan-b-la-api-en-un-host-persistente) sin pelearte: el frontal se queda
> en Vercel igual y solo cambia `VITE_API_URL`.

---

## Antes de empezar

- Cuenta de Vercel (el plan Hobby vale; es uso no comercial) y el repo en GitHub.
- El `MOTHERDUCK_TOKEN` a mano. Está en `app/api/.env`, que está gitignored: **no se
  commitea nunca y no se pega en el proyecto web** (las variables `VITE_*` se publican
  en el JavaScript del navegador).
- Los cuatro ficheros del paso 0 commiteados y subidos a la rama que vayas a desplegar.

---

## Paso 0 — Los ficheros que hay que añadir al repo

### 1. `app/api/api/index.ts` (nuevo) — la entrada serverless

Vercel no arranca procesos: invoca una función por petición. Esta entrada construye la
app de Fastify una vez por instancia y le pasa la petición cruda.

```ts
/**
 * Entrada serverless de la API en Vercel.
 *
 * `src/server.ts` sigue siendo la entrada local (escucha en 127.0.0.1:8787). Aquí no
 * se escucha en ningún puerto: Vercel entrega `req`/`res` y Fastify los atiende. La
 * instancia se cachea por contenedor para no reabrir la conexión de MotherDuck en
 * cada petición.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

let ready: Promise<FastifyInstance> | null = null;

function instance(): Promise<FastifyInstance> {
  ready ??= buildApp({ logger: false }).then(async (app) => {
    await app.ready();
    return app;
  });
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await instance();
  app.server.emit("request", req, res);
}
```

### 2. `app/api/vercel.json` (nuevo) — rutas y tamaño de la función

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "mkdir -p public && echo xray-api > public/index.txt",
  "outputDirectory": "public",
  "functions": {
    "api/index.ts": { "maxDuration": 60, "memory": 2048 }
  },
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }]
}
```

Tres cosas que no son adorno:

- **`rewrites`**: las rutas reales son `/health`, `/api/v1/*` y `/api/v2/*`, no
  `/api/index`. El rewrite manda todo a la función y Fastify enruta con la URL original.
- **`maxDuration: 60`**: el arranque en frío abre la conexión con MotherDuck, y el
  cliente se da a sí mismo 15 s para conectar y 30 s por consulta
  (`app/api/src/motherduck/client.ts`). Con los 10 s por defecto del plan Hobby, la
  primera petición del día se corta en seco.
- **`buildCommand` + `outputDirectory`**: un proyecto de solo funciones falla con «No
  Output Directory»; el `mkdir` le da un directorio vacío que contentar.

### 3. `app/api/src/app.ts` (editar) — CORS para el dominio del frontal

Hoy la lista de orígenes son puertos de localhost, así que el frontal desplegado
recibiría un CORS rojo. Sustituye el `app.register(cors, …)` por:

```ts
  // Orígenes de despliegue: `WEB_ORIGIN` admite una lista separada por comas.
  const deployedOrigins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://localhost:4173",
      "http://localhost:4199",
      "http://localhost:4175",
      "http://localhost:4176",
      "http://localhost:4177",
      "http://localhost:4178",
      "http://localhost:4180",
      ...deployedOrigins,
    ],
  });
```

Los localhost se quedan: sin ellos dejas de poder desarrollar.

### 4. `app/web/vercel.json` (nuevo) — el fallback de la SPA

El frontal usa `BrowserRouter`, o sea rutas de verdad (`/monitor`). Sin esto, recargar
con F5 en cualquier ruta que no sea `/` da un 404 de Vercel.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Commitea los cuatro (`deploy: add the Vercel entry points for web and api`) y sube la
rama.

---

## Paso 1 — El proyecto de la API

En Vercel: **Add New… → Project → importa el repo**.

| Ajuste | Valor |
| --- | --- |
| Project Name | `kima-api` |
| Framework Preset | `Other` |
| **Root Directory** | `app/api` |
| Include files outside root directory | **activado** (el lockfile y el workspace viven en `app/`) |
| Build / Output / Install Command | déjalos vacíos: los pone `vercel.json` |
| Node.js Version | `22.x` |

Environment Variables (Production, Preview y Development):

| Variable | Valor | Para qué |
| --- | --- | --- |
| `MOTHERDUCK_TOKEN` | el de `app/api/.env` | sin él, todo responde `503 source_unavailable` |
| `MOTHERDUCK_DATABASE` | *(opcional)* | por defecto `md:hackspain_2026?saas_mode=true` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | solo si el install falla: el repo pide pnpm 11 por `packageManager` |

**Deploy** y apunta la URL: `https://kima-api.vercel.app`. Compruébala antes de seguir:

```bash
curl -s https://kima-api.vercel.app/health | jq
```

Debe responder `"status": "ok"`, `"source": "motherduck"` y `"data_kind": "real"`. Si
sale `503` o un `504`, para aquí y mira [Si algo falla](#si-algo-falla): desplegar el
frontal contra una API rota solo añade ruido.

---

## Paso 2 — El proyecto del frontal

**Add New… → Project → el mismo repo otra vez** (Vercel permite varios proyectos por
repo; es justo lo que queremos).

| Ajuste | Valor |
| --- | --- |
| Project Name | `kima` |
| Framework Preset | `Vite` |
| **Root Directory** | `app/web` |
| Include files outside root directory | **activado** |
| Build Command | `pnpm build` (por defecto) |
| Output Directory | `dist` (por defecto) |
| Node.js Version | `22.x` |

Environment Variables:

| Variable | Valor |
| --- | --- |
| `VITE_API_URL` | `https://kima-api.vercel.app` (**sin** barra final) |

`VITE_API_URL` se congela **en el build**: si la cambias después, hay que volver a
desplegar, no basta con recargar.

**Deploy** y apunta la URL: `https://kima.vercel.app`.

---

## Paso 3 — Cerrar el círculo (CORS)

Vuelve al proyecto `kima-api` → Settings → Environment Variables y añade:

| Variable | Valor |
| --- | --- |
| `WEB_ORIGIN` | `https://kima.vercel.app` |

Y **redespliega la API** (Deployments → … → Redeploy): las variables de entorno solo
entran en un despliegue nuevo.

Si quieres que los *preview deployments* del frontal también funcionen, pon en
`WEB_ORIGIN` la lista separada por comas con los dominios que uses.

---

## Paso 4 — Verificar de verdad

La suite en verde no prueba que la pantalla funcione (lección de XR-034). Verifica las
dos capas.

La API, desde la terminal:

```bash
API=https://kima-api.vercel.app
curl -s "$API/health" | jq '{status, source, data_kind, engine}'
curl -s "$API/api/v2/meta" | jq '{data_kind, model_version, months: (.months | length)}'
curl -s "$API/api/v1/companies?limit=2" | jq '.total'
```

El frontal, en el navegador (y con la consola abierta):

- [ ] `https://kima.vercel.app` carga el tablero **con datos**, no el estado de error.
- [ ] Ninguna línea roja de CORS ni un `net::ERR` en la consola.
- [ ] Abre una empresa: score, serie de 24 meses y pilares pintados.
- [ ] El tablero **Investigación** renderiza (es el que se quedó en blanco en XR-034).
- [ ] F5 en `/monitor`: sigue cargando, no un 404 de Vercel.
- [ ] Desde el móvil, con datos: sirve para enseñarlo en la feria sin portátil.

## Paso 5 — Dejar la URL escrita

El `README.md` tiene el marcador puesto:

```
<!-- DEMO-URL: sustituir «pendiente de desplegar» por el enlace del despliegue. -->
🔗 **Demo:** _pendiente de desplegar_
```

Sustitúyelo por `🔗 **Demo:** <https://kima.vercel.app>` y commitea
(`docs: point the README at the deployed demo`).

---

## Si algo falla

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| Build: `No Output Directory named "public"` | proyecto de solo funciones | el `buildCommand` del paso 0.2 crea `public/` |
| Install: error de versión de pnpm | el repo pide pnpm 11 | `ENABLE_EXPERIMENTAL_COREPACK=1` en el proyecto |
| Build: `Serverless Function has exceeded the unzipped maximum size of 250 MB` | el binario de DuckDB | Plan B, abajo. No hay truco que lo encoja |
| Runtime: `Cannot find module … node-bindings-linux-x64` | el tracer no sigue el symlink de pnpm al `.node` | añade `"includeFiles": "node_modules/@duckdb/**"` al bloque `functions`; si sigue, crea `app/.npmrc` con `node-linker=hoisted` y redespliega |
| `503 {"status":"source_unavailable"}` | token ausente/caducado, o demasiadas conexiones vivas contra MotherDuck | revisa `MOTHERDUCK_TOKEN`; y cierra las APIs locales del equipo: el token limita conexiones y las nuevas caen mientras las viejas siguen sirviendo |
| `504` solo en la primera petición | arranque en frío + conexión a MotherDuck | `maxDuration: 60`; y calienta con `curl $API/health` antes de la demo |
| CORS bloqueado en el navegador | falta el dominio | `WEB_ORIGIN` en la API **y redesplegar** |
| 404 al recargar en `/monitor` | falta el fallback de la SPA | `app/web/vercel.json` del paso 0.4 |
| La web carga pero dice que no contacta con la API | `VITE_API_URL` mal o con barra final | corrígela y **vuelve a desplegar** el frontal |
| Pantalla en blanco con 200 en todas las peticiones | error de render, no de despliegue | consola del navegador; suele ser un dominio cerrado que el motor no cumple |

---

## Plan B: la API en un host persistente

Si la función no cabe o el binario nativo no aparece, la API se va a un host que corre
un proceso de verdad (Render, Railway, Fly). El frontal **no se mueve de Vercel**.

Un cambio en `app/api/src/server.ts`: hoy escucha en `127.0.0.1`, que fuera de tu
portátil no acepta nada.

```ts
await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
```

Y en el host: `HOST=0.0.0.0`, `MOTHERDUCK_TOKEN`, `WEB_ORIGIN=https://kima.vercel.app`,
build `corepack pnpm install --frozen-lockfile && corepack pnpm --filter api build`
(directorio raíz `app`), arranque `node api/dist/server.js`.

Ventaja de propina: una sola conexión con MotherDuck para todo el servicio, que es
justo lo que el cliente de `app/api` espera. Inconveniente: los planes gratis duermen
el proceso tras unos minutos sin tráfico, así que la primera petición tarda. Para la
demo, un `curl` al `/health` cinco minutos antes lo despierta.

---

## Antes de enseñarlo

- [ ] `curl $API/health` cinco minutos antes: el frío lo paga el jurado si no.
- [ ] La URL en el README y en la presentación, escrita a mano en algún sitio por si no
      hay wifi decente.
- [ ] Capturas o vídeo del tablero como red de seguridad.
- [ ] No rotes el `MOTHERDUCK_TOKEN` el día de la demo.
