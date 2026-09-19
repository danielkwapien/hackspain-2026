/**
 * `/api/v2/alerts` sobre la publicación real en miniatura (XR-037, I2).
 *
 * La fixture es la misma de `temporal-engine.test.ts` y ya trae las dos tablas
 * nuevas: `company_alerts_v2` (42 filas) y `group_alerts_v2` (38), generadas con
 * `core/publish_alerts.py` sobre el propio subconjunto, y `company_alerts` /
 * `group_alerts` intactas al lado (28 y 30). Lo que se ejerce aquí es lo que la
 * bandeja necesita y hasta ahora no tenía: la causa en la fila, el filtro por
 * causa y una sola fila por sociedad.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(testDir, "fixtures", "temporal-engine.duckdb");

type AlertItem = {
  alert_id: string;
  company_id: string;
  group_id: string | null;
  cause: string;
  severity: string;
  month_detected: string;
};

type AlertsBody = { items: AlertItem[]; total: number };

describe("bandeja de alertas", () => {
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
    await Promise.all(scratchDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  /**
   * Copia de trabajo: la API abre la base en escritura y la fixture es fuente.
   * Las tres columnas de `invoices` son las que el directorio v1 necesita para
   * el pendiente de cobro; sin ellas el store no carga y la ruta sale en 503.
   */
  async function publication(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "alerts-"));
    scratchDirs.push(dir);
    const database = path.join(dir, "engine-publication.duckdb");
    await copyFile(FIXTURE, database);
    const instance = await DuckDBInstance.create(database);
    const connection = await instance.connect();
    await connection.run("ALTER TABLE invoices ADD COLUMN currency VARCHAR DEFAULT 'EUR'");
    await connection.run("ALTER TABLE invoices ADD COLUMN pending_amount DOUBLE DEFAULT 0");
    await connection.run("ALTER TABLE invoices ADD COLUMN issuance_date DATE DEFAULT DATE '2026-01-01'");
    connection.closeSync();
    instance.closeSync();
    return database;
  }

  async function alerts(query: string): Promise<{ status: number; body: AlertsBody }> {
    const app = await buildApp({ logger: false, motherDuckDatabase: await publication() });
    try {
      const response = await app.inject({ method: "GET", url: `/api/v2/alerts${query}` });
      return { status: response.statusCode, body: response.json<AlertsBody>() };
    } finally {
      await app.close();
    }
  }

  it("DADO la publicacion CUANDO se piden las alertas ENTONCES salen de las tablas v2, con su causa en la fila", async () => {
    const { body } = await alerts("?limit=500");

    // 42 + 38 de las tablas nuevas. Las viejas (28 + 30) siguen publicadas.
    expect(body.total).toBe(80);
    expect(new Set(body.items.map((item) => item.cause))).toEqual(
      new Set(["buffer_days", "band_drop", "cap_applied", "score_drop", "concentration"]),
    );
  });

  it("DADO una causa CUANDO se filtra por ella ENTONCES solo esa, y una inventada es 400", async () => {
    const { body } = await alerts("?cause=band_drop&limit=500");
    expect(body.total).toBe(8);
    expect(body.items.every((item) => item.cause === "band_drop")).toBe(true);

    const rejected = await alerts("?cause=colchon");
    expect(rejected.status).toBe(400);
  });

  it("DADO latest_per_company CUANDO se pide la bandeja ENTONCES una fila por sociedad, la mas grave", async () => {
    const { body } = await alerts("?latest_per_company=true&limit=500");

    // Tres sociedades y tres grupos: la alerta de grupo no trae `company_id` y
    // cuenta como su propia entidad, no como una empresa sin nombre.
    expect(body.total).toBe(6);
    expect(body.items.map((item) => item.alert_id).sort()).toEqual([
      "COMP_0001:2026-08:band",
      "COMP_0002:2025-08:band",
      "COMP_0009:2026-05:band",
      "GROUP_0125:2025-12:band",
      "GROUP_0147:2026-06:cap",
      "GROUP_0225:2026-05:band",
    ]);
  });

  it("DADO una severidad que la API no declara CUANDO se deduplica ENTONCES la fila sigue en la bandeja", async () => {
    // Regresion de XR-035: el motor publica `critical`, que el vocabulario de
    // la API no declara. Ordena la ultima —no sabemos cuanto pesa—, pero las 21
    // alertas de GROUP_0225 son TODAS `critical` y esa entidad no puede
    // desaparecer de la bandeja por no estar en el diccionario.
    const { body } = await alerts("?cause=buffer_days&latest_per_company=true&limit=500");

    // Las tres sociedades y los tres grupos: `buffer_days` es la causa que
    // escribe el motor y la tienen todos.
    expect(body.total).toBe(6);
    // La alerta del GRUPO, no la de su filial: las de grupo no traen empresa.
    expect(
      body.items.find((item) => item.company_id === "" && item.group_id === "GROUP_0225"),
    ).toMatchObject({ alert_id: "GROUP_0225:2026-08:buffer", severity: "critical" });
    // Y a igual rango desconocido gana la mas reciente, no la primera que pase.
    expect(body.items.find((item) => item.company_id === "COMP_0001")).toMatchObject({
      severity: "watch",
    });
  });

  it("DADO la misma peticion dos veces CUANDO se deduplica ENTONCES la bandeja no cambia de contenido", async () => {
    // `ALERTS_SQL` ordena por `alert_id` justo para esto: sin orden declarado,
    // que fila sobrevive al dedupe dependeria del orden que devuelva DuckDB.
    const first = await alerts("?latest_per_company=true&limit=4");
    const second = await alerts("?latest_per_company=true&limit=4");

    expect(first.body.items.map((item) => item.alert_id)).toEqual(
      second.body.items.map((item) => item.alert_id),
    );
  });
});
