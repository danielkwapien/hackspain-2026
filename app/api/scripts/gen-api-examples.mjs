/**
 * Regenera `docs/api/examples/*.json` desde la API real servida sobre el dataset
 * completo (`datasets_mocked/`).
 *
 * Los ejemplos son el contrato que el front usa para construir la UI antes de
 * levantar nada: si se recortan a mano se quedan desfasados en cuanto cambia el
 * generador (ya pasó una vez). Aquí se piden los once endpoints de
 * `docs/api/v2.md`, se recortan los arrays largos de forma marcada y se escriben
 * con formato estable, para que dos ejecuciones den el mismo byte.
 *
 * Uso (desde `app/`): corepack pnpm --filter api run examples
 */

import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(API_DIR, "../..");
const EXAMPLES_DIR = path.join(ROOT, "docs/api/examples");
const EXPORTS_DIR = path.join(ROOT, "datasets_mocked/exports/v1");

/** Puerto propio: el 8787 (dev) y el 8791 (evals/checks/XR-001.sh) están ocupados. */
const PORT = 8795;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Arrays recortados a 3 elementos; el resto de longitudes se marca en `_truncated`. */
const MAX_ITEMS = 3;

/**
 * Arrays que van enteros porque su longitud ES el dato (una serie de 12 puntos
 * recortada a 3 no es un ejemplo de sparkline, es otra cosa).
 */
const KEEP_WHOLE = new Set([
  "sparkline_12",
  "months",
  "anchors",
  "strength_flags",
  "countries",
  "currencies",
]);

/** Un fichero por endpoint. `lastMonth` sale de `/api/v2/meta`, no está escrito a mano. */
function endpoints(lastMonth) {
  return [
    ["universe.json", "/api/v2/universe"],
    ["company.json", "/api/v2/companies/COMP_1267"],
    // COMP_0075 no tiene facturas: sus P1-P3 y C1-C6 llegan con `is_available: false`,
    // que es el caso que la UI tiene que saber pintar («no aplica» ≠ «falta el dato»).
    ["company-signals.json", "/api/v2/companies/COMP_0075/signals"],
    ["company-timeline.json", "/api/v2/companies/COMP_1267/timeline"],
    ["group.json", "/api/v2/groups/GROUP_0095"],
    ["alerts.json", "/api/v2/alerts"],
    ["treemap.json", "/api/v2/treemap"],
    ["frames.json", "/api/v2/frames"],
    ["frame-month.json", `/api/v2/frames/${lastMonth}`],
    ["catalog-signals.json", "/api/v2/catalog/signals"],
    ["meta.json", "/api/v2/meta"],
  ];
}

/**
 * Recorta los arrays largos de un objeto y deja constancia: por cada clave
 * recortada, una clave hermana `_truncated` con la longitud real de la respuesta.
 */
function shrink(node) {
  if (Array.isArray(node)) return node.map(shrink);
  if (node === null || typeof node !== "object") return node;

  const out = {};
  const truncated = {};
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value) && !KEEP_WHOLE.has(key) && value.length > MAX_ITEMS) {
      truncated[key] = value.length;
      out[key] = value.slice(0, MAX_ITEMS).map(shrink);
    } else {
      out[key] = shrink(value);
    }
  }
  if (Object.keys(truncated).length > 0) out._truncated = truncated;
  return out;
}

/**
 * Igual, para respuestas cuyo cuerpo es un array plano (`/companies/:id/timeline`):
 * un array no puede llevar clave hermana, así que la marca va como último elemento.
 */
function shrinkBody(body) {
  if (!Array.isArray(body)) return shrink(body);
  if (body.length <= MAX_ITEMS) return body.map(shrink);
  return [...body.slice(0, MAX_ITEMS).map(shrink), { _truncated: { _root: body.length } }];
}

/** Claves ordenadas: el orden de las claves de la API no entra en el diff. */
function sortKeys(_key, value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]]),
  );
}

function portFree() {
  return new Promise((resolve) => {
    const socket = createConnection({ port: PORT, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startApi() {
  if (!(await portFree())) {
    throw new Error(`El puerto ${PORT} ya está ocupado: libéralo antes de regenerar.`);
  }
  // `node --import tsx` ejecuta el server TS en ESTE proceso hijo: `tsx src/server.ts`
  // dejaría un nieto que sobrevive al kill del padre.
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: API_DIR,
    detached: true, // grupo de procesos propio: se mata entero con kill(-pid)
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT), EXPORTS_DIR },
  });
  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`La API murió al arrancar:\n${log}`);
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return child;
    } catch {
      // todavía no escucha
    }
    await sleep(500);
  }
  throw new Error(`La API no respondió en 60 s:\n${log}`);
}

async function stopApi(child) {
  if (child.exitCode !== null) return;
  const dead = new Promise((resolve) => child.once("exit", resolve));
  process.kill(-child.pid, "SIGTERM");
  const stopped = await Promise.race([dead.then(() => true), sleep(5000).then(() => false)]);
  if (!stopped) process.kill(-child.pid, "SIGKILL");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await portFree()) return;
    await sleep(250);
  }
  throw new Error(`El puerto ${PORT} sigue ocupado tras parar la API.`);
}

async function get(route) {
  const response = await fetch(`${BASE_URL}${route}`);
  if (!response.ok) throw new Error(`GET ${route} → ${response.status}`);
  return response.json();
}

const api = await startApi();
process.once("SIGINT", () => process.kill(-api.pid, "SIGKILL"));
try {
  const meta = await get("/api/v2/meta");
  const lastMonth = meta.months.at(-1);
  await mkdir(EXAMPLES_DIR, { recursive: true });
  console.log(`API en ${BASE_URL} (EXPORTS_DIR=${EXPORTS_DIR}), último mes ${lastMonth}`);

  for (const [file, route] of endpoints(lastMonth)) {
    const json = `${JSON.stringify(shrinkBody(await get(route)), sortKeys, 2)}\n`;
    await writeFile(path.join(EXAMPLES_DIR, file), json);
    console.log(`  ${file.padEnd(22)} ← GET ${route.padEnd(38)} ${json.length} bytes`);
  }
} finally {
  await stopApi(api);
  console.log(`API parada, puerto ${PORT} libre.`);
}
