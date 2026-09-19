import { buildApp } from "./app.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env.PORT ?? 8787);

const app = await buildApp({ logger: true });

await app.listen({ port, host: "127.0.0.1" });
app.log.info({ port, source: process.env.DATA_SOURCE === "local" ? "local" : "motherduck" }, "Read-only API ready");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void app.close(); });
}
