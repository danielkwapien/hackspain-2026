/**
 * Conexión temporal XR-033: lee las tablas derivadas publicadas y las sirve en
 * `/api/v2/*`. La fixture `fixtures/temporal-engine.duckdb` es un subconjunto real
 * de la publicación de MotherDuck (3 sociedades, 3 grupos, 24 meses, catálogo
 * completo) generado con `plans/XR-033/make-api-fixture.py`; sin la DuckDB grande
 * de `plans/` ni red, el chequeo corre en CI.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEngineStore, type EngineQueryClient } from "../src/motherduck/engine.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(testDir, "fixtures", "temporal-engine.duckdb");

type LocalQueryClient = { client: EngineQueryClient; close: () => void };

async function readOnlyFixture(): Promise<LocalQueryClient> {
  const instance = await DuckDBInstance.create(FIXTURE, { access_mode: "READ_ONLY" });
  const connection = await instance.connect();
  // Una conexión DuckDB no ejecuta sentencias en paralelo: serializa igual que el
  // cliente de producción, o `Promise.all` rompe el statement compartido.
  let tail: Promise<void> = Promise.resolve();
  return {
    client: {
      query<T>(sql: string, schema: z.ZodType<T>, values: string[] = []): Promise<T[]> {
        const result = tail.then(async () => {
          const rows = await connection.runAndReadAll(sql, values);
          return z.array(schema).parse(rows.getRowObjectsJson());
        });
        tail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    },
    close: () => {
      connection.closeSync();
      instance.closeSync();
    },
  };
}

describe("motor temporal en MotherDuck", () => {
  const open: LocalQueryClient[] = [];
  const scratchDirs: string[] = [];
  const dataSource = process.env.DATA_SOURCE;

  beforeAll(() => {
    // `buildApp` decide local/real por entorno: aquí la fuente es la fixture.
    delete process.env.DATA_SOURCE;
  });

  afterAll(() => {
    if (dataSource !== undefined) process.env.DATA_SOURCE = dataSource;
  });

  afterEach(async () => {
    for (const resource of open.splice(0)) resource.close();
    await Promise.all(scratchDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("lee los dos granos, conserva los nulos y publica metadatos", async () => {
    const resource = await readOnlyFixture();
    open.push(resource);
    const store = await loadEngineStore(resource.client);

    expect(store.manifest.model_version).toBe("embat-layered-v1");
    expect(store.months).toHaveLength(24);
    expect(store.months[0]).toBe("2024-09");
    expect(store.metadata.parameters).toBeTruthy();

    // Warmup y meses sin soporte: score nulo, no cero.
    expect(store.groupScoreAt("GROUP_0125", "2024-09")?.score).toBeNull();
    expect(store.groupScoreAt("GROUP_0125", "2024-09")?.regime).toBe("warmup");
    expect(store.groupScoreAt("GROUP_0125", "2026-08")?.score).toBe(51.93);
    expect(store.groupScoreAt("GROUP_0125", "2026-08")?.company_id).toBeNull();

    // La sociedad arranca en su primera transacción contabilizada: 8 meses reales.
    expect(store.companyTimeline("COMP_0001")).toHaveLength(8);
    expect(store.companyScoreAt("COMP_0001", "2026-01")?.score).toBeNull();
    expect(store.companyScoreAt("COMP_0001", "2026-03")?.score).toBe(36.59);
    expect(store.companyScoreAt("COMP_0001", "2026-03")?.group_id).toBe("GROUP_0147");
    expect(store.companyScoreAt("COMP_0001", "2026-03")?.company_id).toBe("COMP_0001");
  });

  it("sirve timeline, señales, detalles y frames desde las tablas", async () => {
    const resource = await readOnlyFixture();
    open.push(resource);
    const store = await loadEngineStore(resource.client);

    expect(store.companyTimeline("COMP_0002")).toHaveLength(24);
    expect(store.catalog).toHaveLength(32);
    expect(store.catalog.filter((entry) => !entry.available)).toHaveLength(16);

    const signals = await store.companySignals("COMP_0002");
    expect(signals.length).toBeGreaterThan(20);
    expect(signals.some((signal) => signal.is_available === false && signal.weight === 0)).toBe(true);

    const details = await store.details("COMP_0002", "2026-08");
    expect(details.drivers.length).toBeGreaterThan(0);
    expect(details.narrative?.headline).toBeTruthy();
    expect(details.strategic_signals.length).toBeGreaterThan(0);

    expect(await store.frameAt("2026-08")).toMatchObject({ month: "2026-08" });
    expect(await store.frameAt("2019-01")).toBeNull();
  });

  it("sirve las rutas v2 reales sin snapshot estático ni mocks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xr033-temporal-"));
    scratchDirs.push(dir);
    const database = path.join(dir, "engine-publication.duckdb");
    await copyFile(FIXTURE, database);

    const app = await buildApp({ logger: false, motherDuckDatabase: database });
    try {
      const meta = await app.inject({ method: "GET", url: "/api/v2/meta" });
      expect(meta.statusCode).toBe(200);
      expect(meta.json()).toMatchObject({
        data_kind: "real",
        model_version: "embat-layered-v1",
        capabilities: { snapshots_only: false },
        params: null,
      });
      expect(meta.json().months).toHaveLength(24);

      const company = await app.inject({ method: "GET", url: "/api/v2/companies/COMP_0002" });
      expect(company.statusCode).toBe(200);
      expect(company.json().score).toBe(44.77);
      expect(company.json().drivers.length).toBeGreaterThan(0);
      expect(company.json().narrative?.headline).toBeTruthy();
      expect(company.json()).not.toHaveProperty("snapshot");

      const timeline = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0009/timeline",
      });
      expect(timeline.statusCode).toBe(200);
      expect(timeline.json()).toHaveLength(24);
      expect(timeline.json()[0].score).toBeNull();
      expect(timeline.json().at(-1).score).toBe(51.12);

      const group = await app.inject({ method: "GET", url: "/api/v2/groups/GROUP_0125" });
      expect(group.statusCode).toBe(200);
      expect(group.json().score).toBe(51.93);
      expect(group.json().timeline).toHaveLength(24);
      expect(group.json().companies).toHaveLength(1);

      const catalog = await app.inject({ method: "GET", url: "/api/v2/catalog/signals" });
      expect(catalog.statusCode).toBe(200);
      expect(catalog.json().items).toHaveLength(32);
      expect(catalog.json().items.some((item: { available: boolean }) => !item.available)).toBe(true);

      const frame = await app.inject({ method: "GET", url: "/api/v2/frames/2026-08" });
      expect(frame.statusCode).toBe(200);
      expect(frame.json()).toMatchObject({ month: "2026-08" });
    } finally {
      await app.close();
    }
  });

  it("responde source_unavailable en vez de caer al baseline cuando la base no abre", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xr033-missing-"));
    scratchDirs.push(dir);
    const app = await buildApp({
      logger: false,
      motherDuckDatabase: path.join(dir, "missing-temporal.duckdb"),
    });

    try {
      const response = await app.inject({ method: "GET", url: "/api/v2/meta" });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ status: "source_unavailable", source: "motherduck" });
    } finally {
      await app.close();
    }
  });
});
