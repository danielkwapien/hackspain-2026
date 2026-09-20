import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";

// MotherDuck downloads its extension into HOME; Vercel only permits writes in /tmp.
if (process.env.VERCEL) process.env.HOME = "/tmp";

const ready = buildApp({ logger: true }).then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await ready;
  app.server.emit("request", req, res);
}
