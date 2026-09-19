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

/**
 * Copia de trabajo de la publicación, lista para el pendiente de cobro. El
 * subconjunto committeado copió de `invoices` solo `company_id` —lo único que
 * leía el directorio—, así que aquí se le añaden las tres columnas de las que
 * sale `pending_eur` y cinco filas que fijan el criterio: el pendiente real de
 * cada sociedad en euros (medido en `datasets/invoices.csv.gz`), una factura de
 * pendiente de PAGO, otra en pesos y otra emitida DESPUÉS del corte del motor
 * (2026-08-01), que NO se suman.
 *
 * `transactions` viene entera del subconjunto y ya trae movimientos posteriores
 * al corte; aquí solo se le añade uno a COMP_0002 —la única sociedad que no
 * tenía ninguno— para que el recuento al corte se lea sin ambigüedad.
 */
async function publicationCopy(dir: string): Promise<string> {
  const database = path.join(dir, "engine-publication.duckdb");
  await copyFile(FIXTURE, database);
  const instance = await DuckDBInstance.create(database);
  const connection = await instance.connect();
  await connection.run("ALTER TABLE invoices ADD COLUMN currency VARCHAR DEFAULT 'EUR'");
  await connection.run("ALTER TABLE invoices ADD COLUMN pending_amount DOUBLE DEFAULT 0");
  await connection.run("ALTER TABLE invoices ADD COLUMN issuance_date DATE DEFAULT DATE '2026-01-01'");
  await connection.run(
    "INSERT INTO invoices VALUES ('COMP_0001', 'EUR', 156000.46, DATE '2026-07-31')," +
      " ('COMP_0001', 'EUR', 40000, DATE '2026-08-02'), ('COMP_0009', 'EUR', 94507.23, DATE '2026-06-15')," +
      " ('COMP_0009', 'EUR', -50000, DATE '2026-06-15'), ('COMP_0009', 'COP', 18325000000, DATE '2026-06-15')",
  );
  await connection.run(
    "INSERT INTO transactions VALUES ('COMP_0002', TIMESTAMP '2026-08-15 00:00:00', 'booked')",
  );
  connection.closeSync();
  instance.closeSync();
  return database;
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

    const details = await store.details("company", "COMP_0002", "2026-08");
    expect(details.drivers.length).toBeGreaterThan(0);
    expect(details.narrative?.headline).toBeTruthy();
    expect(details.strategic_signals.length).toBeGreaterThan(0);

    expect(await store.frameAt("2026-08")).toMatchObject({ month: "2026-08" });
    expect(await store.frameAt("2019-01")).toBeNull();
  });

  it("sirve las rutas v2 reales sin snapshot estático ni mocks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xr033-temporal-"));
    scratchDirs.push(dir);

    const app = await buildApp({ logger: false, motherDuckDatabase: await publicationCopy(dir) });
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

  it("sirve el lote enriquecido y las perspectivas con sus nombres publicados", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xr033-batch-"));
    scratchDirs.push(dir);

    const app = await buildApp({ logger: false, motherDuckDatabase: await publicationCopy(dir) });
    try {
      const company = await app.inject({ method: "GET", url: "/api/v2/companies/COMP_0002" });
      expect(company.statusCode).toBe(200);
      expect(company.json().op_in_12m_currency).toBe("EUR");
      expect(company.json().op_in_12m_eur).toBe(0);
      expect(company.json().strategic_signals).toHaveLength(5);
      const pressure = company
        .json()
        .strategic_signals.find((signal: { name: string }) => signal.name === "trajectory_pressure");
      expect(pressure).toMatchObject({
        label: "Trayectoria y presion a corto",
        direction: "deteriorating",
        modifier_applied: true,
      });
      const modifierDriver = company
        .json()
        .drivers.find((driver: { signal_id: string }) => driver.signal_id === "trajectory_pressure");
      expect(modifierDriver.name).toBe("Trayectoria y presion a corto");
      const pillarDriver = company
        .json()
        .drivers.find((driver: { signal_id: string }) => driver.signal_id === "PILLAR_L");
      expect(pillarDriver).toMatchObject({ kind: "pillar", pillar: "L", name: null });

      const group = await app.inject({ method: "GET", url: "/api/v2/groups/GROUP_0125" });
      expect(group.statusCode).toBe(200);
      // El grano grupo mezcla divisas: solo publica la consolidacion en EUR.
      expect(group.json().op_in_12m).toBeNull();
      expect(group.json().op_in_12m_eur).toBe(180187.37);
      expect(group.json().strategic_signals).toHaveLength(5);
      expect(group.json().narrative?.headline).toBeTruthy();

      const signals = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0002/signals",
      });
      expect(signals.statusCode).toBe(200);
      const values = signals
        .json()
        .pillars.flatMap((pillar: { signals: { signal_id: string; value_fmt: string | null }[] }) => pillar.signals);
      const available = values.find((signal: { signal_id: string }) => signal.signal_id === "neg_cash_share");
      expect(available?.value_fmt).toBe("0 %");

      const catalog = await app.inject({ method: "GET", url: "/api/v2/catalog/signals" });
      const bufferDays = catalog
        .json()
        .items.find((item: { signal_id: string }) => item.signal_id === "buffer_days");
      expect(bufferDays.format).toMatchObject({ unit: "days", decimals: 0, suffix: "dias" });
    } finally {
      await app.close();
    }
  });

  // XR-034: el área del mapa sale de una magnitud que EXISTE, y el camino que
  // sirve la app es este, no el snapshot: `pending_eur` llegaba a 0 en las
  // 1.286 sociedades porque el directorio temporal no lo consultaba.
  it("dimensiona el mapa con el pendiente en euros y con la operativa convertida", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xr034-size-"));
    scratchDirs.push(dir);

    const app = await buildApp({ logger: false, motherDuckDatabase: await publicationCopy(dir) });
    try {
      const sizes = (body: { groups: { items: { id: string; size: number }[] }[] }) =>
        Object.fromEntries(
          body.groups.flatMap((group) => group.items.map((item) => [item.id, item.size])),
        );
      const total = (body: { groups: { items: { size: number }[] }[] }) =>
        body.groups.flatMap((group) => group.items).reduce((sum, item) => sum + item.size, 0);

      const pending = await app.inject({
        method: "GET",
        url: "/api/v2/treemap?group_by=group&metric=score&size_by=pending_eur",
      });
      expect(pending.statusCode).toBe(200);
      expect(pending.json().size_by).toBe("pending_eur");
      // Solo el positivo y solo en euros: la factura de pago (−50.000 EUR) y la
      // de pesos (18.325 M COP) no entran en el área de COMP_0009. Y solo hasta
      // el corte que sirve la app: los 40.000 € emitidos el 2026-08-02 —después
      // del 2026-08-01 del motor— todavía no existían, así que tampoco.
      expect(sizes(pending.json())).toEqual({
        COMP_0001: 156000.46,
        COMP_0002: 0,
        COMP_0009: 94507.23,
      });
      expect(total(pending.json())).toBeGreaterThan(0);

      const receipts = await app.inject({
        method: "GET",
        url: "/api/v2/treemap?group_by=group&metric=score&size_by=op_in_12m_eur",
      });
      expect(receipts.statusCode).toBe(200);
      expect(receipts.json().size_by).toBe("op_in_12m_eur");
      // La operativa YA convertida, la del grano sociedad: un 0 publicado es un
      // 0 real (COMP_0002 no cobró nada en la ventana), no un hueco.
      expect(sizes(receipts.json())).toEqual({
        COMP_0001: 548427.74,
        COMP_0002: 0,
        COMP_0009: 36343681.44,
      });
      expect(total(receipts.json())).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  // XR-034: el recuento de facturas es AL CORTE, como el resto de la fila. Una
  // emitida después todavía no existía y no puede agrandar la ficha del mapa.
  it("cuenta en n_invoices solo las facturas emitidas hasta el corte", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xr034-invoices-"));
    scratchDirs.push(dir);

    const app = await buildApp({ logger: false, motherDuckDatabase: await publicationCopy(dir) });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v2/treemap?group_by=group&metric=score&size_by=n_invoices",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().size_by).toBe("n_invoices");
      // COMP_0001 tiene 633 facturas de la publicación (todas al corte) más las
      // dos de la copia: la del 2026-07-31 cuenta, la del 2026-08-02 —después
      // del corte del motor, 2026-08-01— no. COMP_0009, 721 + 3, todas al corte.
      const sizes = Object.fromEntries(
        response
          .json()
          .groups.flatMap((group: { items: { id: string; size: number }[] }) =>
            group.items.map((item) => [item.id, item.size]),
          ),
      );
      expect(sizes).toEqual({ COMP_0001: 634, COMP_0002: 0, COMP_0009: 724 });
    } finally {
      await app.close();
    }
  });

  // XR-034: el recuento de movimientos también es AL CORTE, como sus vecinos
  // del mismo CTE (`first_activity`, `last_activity`, `months_hist`). Uno
  // posterior al corte todavía no existía y no puede agrandar la ficha.
  it("cuenta en n_transactions solo los movimientos hasta el corte", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xr034-transactions-"));
    scratchDirs.push(dir);

    const app = await buildApp({ logger: false, motherDuckDatabase: await publicationCopy(dir) });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v2/treemap?group_by=group&metric=score&size_by=n_transactions",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().size_by).toBe("n_transactions");
      // Al corte del motor (2026-08-01): COMP_0001 tiene 166 de sus 203 y
      // COMP_0009 1.186 de sus 1.219; COMP_0002 se queda en sus 581 porque el
      // movimiento del 2026-08-15 que añade la copia es posterior al corte.
      const sizes = Object.fromEntries(
        response
          .json()
          .groups.flatMap((group: { items: { id: string; size: number }[] }) =>
            group.items.map((item) => [item.id, item.size]),
          ),
      );
      expect(sizes).toEqual({ COMP_0001: 166, COMP_0002: 581, COMP_0009: 1186 });
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
