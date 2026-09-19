/**
 * Lectura de contrapartes (XR-035) contra una DuckDB en memoria con la misma
 * forma que la publicación real. Sin red y sin la fixture grande: lo que se
 * comprueba aquí es la capa de lectura —orden, vacíos y la minigráfica—, no la
 * agregación, que ya tiene sus tests en `core/tests/test_counterparties.py`.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import {
  counterpartiesPublished,
  loadCounterparties,
} from "../src/motherduck/counterparties.js";
import type { EngineQueryClient } from "../src/motherduck/engine.js";

type Harness = { client: EngineQueryClient; close: () => void };

const open: Harness[] = [];

afterEach(() => {
  while (open.length) open.pop()?.close();
});

/** Cliente sobre DuckDB en memoria, serializado como el de producción. */
async function harness(seed: (run: (sql: string) => Promise<void>) => Promise<void>): Promise<EngineQueryClient> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  const run = async (sql: string): Promise<void> => {
    await connection.run(sql);
  };
  await seed(run);
  let tail: Promise<void> = Promise.resolve();
  const client: EngineQueryClient = {
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
  };
  open.push({
    client,
    close: () => {
      connection.closeSync();
      instance.closeSync();
    },
  });
  return client;
}

/** Dos proveedores: uno pesado y puntual, otro pequeño y muy tarde. */
async function published(): Promise<EngineQueryClient> {
  return harness(async (run) => {
    await run(`CREATE TABLE company_counterparties(
      company_id VARCHAR, group_id VARCHAR, month VARCHAR, side VARCHAR,
      counterparty_id VARCHAR, amount_12m DOUBLE, weight DOUBLE, n_invoices INTEGER,
      days_late_w DOUBLE, pct_late DOUBLE, overdue_total DOUBLE,
      overdue_0_30 DOUBLE, overdue_31_60 DOUBLE, overdue_61_90 DOUBLE,
      overdue_90_plus DOUBLE, sparkline_12 JSON, generated_at TIMESTAMPTZ)`);
    await run(`INSERT INTO company_counterparties VALUES
      ('COMP_0001','GROUP_0001','2026-08','ap','BIG',800.0,0.8,10,
       2.0,0.1,100.0,100.0,0.0,0.0,0.0,'[1,2,3,4,5,6,7,8,9,10,11,12]',now()),
      ('COMP_0001','GROUP_0001','2026-08','ap','LATE',200.0,0.2,4,
       55.0,0.9,50.0,0.0,0.0,0.0,50.0,'[0,0,0,0,0,0,0,0,0,0,0,0]',now()),
      ('COMP_0001','GROUP_0001','2026-08','ap','UNPAID',0.0,0.0,1,
       NULL,NULL,0.0,0.0,0.0,0.0,0.0,NULL,now())`);
    await run(`CREATE TABLE company_counterparty_summary(
      company_id VARCHAR, group_id VARCHAR, month VARCHAR, side VARCHAR,
      n_counterparties INTEGER, total_amount DOUBLE, top1_weight DOUBLE,
      effective_counterparties DOUBLE, hhi DOUBLE, days_late_w DOUBLE,
      pct_late DOUBLE, overdue_total DOUBLE, eur_share DOUBLE, generated_at TIMESTAMPTZ)`);
    await run(`INSERT INTO company_counterparty_summary VALUES
      ('COMP_0001','GROUP_0001','2026-08','ap',3,1000.0,0.8,1.47,0.68,
       12.6,0.26,150.0,0.75,now())`);
  });
}

describe("contrapartes", () => {
  it("ordena por peso y devuelve la minigráfica de doce puntos", async () => {
    const client = await published();

    const result = await loadCounterparties(client, "COMP_0001", "ap", "weight", 50);

    expect(result.items.map((item) => item.counterparty_id)).toEqual(["BIG", "LATE", "UNPAID"]);
    expect(result.items[0].sparkline_12).toHaveLength(12);
    expect(result.items[0].sparkline_12.at(-1)).toBe(12);
  });

  it("ordena por deterioro y deja al final a quien no tiene días medidos", async () => {
    const client = await published();

    const result = await loadCounterparties(client, "COMP_0001", "ap", "deterioration", 50);

    // El más tarde primero; el que no tiene ninguna factura pagada va último en
    // vez de colarse arriba con un cero, que fingiría puntualidad.
    expect(result.items.map((item) => item.counterparty_id)).toEqual(["LATE", "BIG", "UNPAID"]);
    expect(result.items.at(-1)?.days_late_w).toBeNull();
  });

  it("trae el resumen con la concentración y la parte del libro que cubre", async () => {
    const client = await published();

    const result = await loadCounterparties(client, "COMP_0001", "ap", "weight", 50);

    expect(result.summary.n_counterparties).toBe(3);
    expect(result.summary.top1_weight).toBeCloseTo(0.8);
    expect(result.summary.effective_counterparties).toBeCloseTo(1.47);
    // Un cuarto del libro de ese lado no está en euros y la cifra lo dice, en
    // vez de dejar creer que la tabla lo enseña entero.
    expect(result.summary.eur_share).toBeCloseTo(0.75);
  });

  it("un lado sin libro responde vacío en vez de fallar", async () => {
    const client = await published();

    const result = await loadCounterparties(client, "COMP_0001", "ar", "weight", 50);

    expect(result.items).toEqual([]);
    expect(result.summary.n_counterparties).toBe(0);
    expect(result.summary.top1_weight).toBeNull();
  });

  it("respeta el límite pedido", async () => {
    const client = await published();

    const result = await loadCounterparties(client, "COMP_0001", "ap", "weight", 1);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].counterparty_id).toBe("BIG");
  });

  it("detecta si la publicación de contrapartes existe", async () => {
    const withTables = await published();
    const without = await harness(async (run) => {
      await run("CREATE TABLE unrelated(x INTEGER)");
    });

    expect(await counterpartiesPublished(withTables)).toBe(true);
    // Una base sin XR-035 deja la ruta en 503 y no rompe el resto del contrato.
    expect(await counterpartiesPublished(without)).toBe(false);
  });
});
