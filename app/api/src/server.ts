import { buildApp } from "./app.js";
import { defaultExportsDir } from "./exports.js";

const port = Number(process.env.PORT ?? 8787);
const exportsDir = process.env.EXPORTS_DIR ?? defaultExportsDir();

const app = await buildApp({ logger: true });

await app.listen({ port, host: "127.0.0.1" });
app.log.info(`API de solo lectura lista en http://127.0.0.1:${port} (exports: ${exportsDir})`);
