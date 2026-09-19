/**
 * Cobertura del snapshot (`/api/v1/companies`): la ficha de empresa pinta en la
 * MISMA tarjeta `coverage.counts.transactions` y el desglose por moneda de
 * `coverage.currencies`, así que las dos cifras tienen que contar lo mismo. La
 * fixture es una DuckDB mínima creada aquí: dos sociedades, dos monedas y
 * movimientos a los dos lados del corte, que es lo único que hace falta para
 * fijar la invariante.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const CUTOFF = "2026-09-01";

async function snapshotFixture(dir: string): Promise<string> {
  const database = path.join(dir, "snapshot.duckdb");
  const instance = await DuckDBInstance.create(database);
  const connection = await instance.connect();
  for (const sql of [
    // La cabecera y el universo salen del motor real desde XR-035: `engine_exports`
    // y `company_scores`, no las tablas del baseline antiguo. La invariante que
    // fija este test —las dos cifras de la misma tarjeta cuentan hasta el mismo
    // corte— no cambia; solo cambia de dónde sale ese corte.
    `CREATE TABLE engine_exports (model_version VARCHAR, data_version VARCHAR, cutoff_date VARCHAR, generated_at VARCHAR, n_companies INTEGER)`,
    `INSERT INTO engine_exports VALUES ('embat-layered-v1','test-v1','${CUTOFF}','2026-09-01T00:00:00Z',2)`,
    `CREATE TABLE companies (company_id VARCHAR, group_id VARCHAR, country VARCHAR, currency VARCHAR, erp VARCHAR, created_at TIMESTAMP)`,
    `INSERT INTO companies VALUES ('COMP_0001','GROUP_0001','ES','EUR','sap',TIMESTAMP '2026-01-02 10:00:00'),
                                  ('COMP_0002','GROUP_0001','PT','EUR',NULL,TIMESTAMP '2026-01-03 10:00:00')`,
    // Dos meses por sociedad: el universo es `SELECT DISTINCT company_id`, así que
    // la fixture tiene que poder repetir la clave sin duplicar la fila del listado.
    `CREATE TABLE company_scores (company_id VARCHAR, month VARCHAR, score DOUBLE)`,
    `INSERT INTO company_scores VALUES ('COMP_0001','2026-07',50), ('COMP_0001','2026-08',51),
                                       ('COMP_0002','2026-07',60), ('COMP_0002','2026-08',61)`,
    `CREATE TABLE groups (group_id VARCHAR, erp VARCHAR, n_companies_in_sample INTEGER)`,
    `INSERT INTO groups VALUES ('GROUP_0001','sap',2)`,
    // Identidad de presentación (XR-037): el directorio la lee para los dos
    // granos, así que la fixture la trae aunque este test mida otra cosa. El
    // país del perfil es el que manda; el de `companies` viaja como declarado.
    `CREATE TABLE entity_profile (entity_id VARCHAR, entity_kind VARCHAR, name VARCHAR, country VARCHAR,
      country_method VARCHAR, industry VARCHAR, industry_method VARCHAR, generated_at TIMESTAMP)`,
    `INSERT INTO entity_profile VALUES
       ('COMP_0001','company','Primera S.L.','España','real','industria y manufactura','inferred',TIMESTAMP '2026-09-01 00:00:00'),
       ('COMP_0002','company','Segunda S.L.','Portugal','real','comercio minorista','inferred',TIMESTAMP '2026-09-01 00:00:00'),
       ('GROUP_0001','group','Grupo Primero','España','inferred','industria y manufactura','inferred',TIMESTAMP '2026-09-01 00:00:00')`,
    `CREATE TABLE banking_products (product_id VARCHAR, company_id VARCHAR, currency VARCHAR)`,
    `INSERT INTO banking_products VALUES ('PRODUCT_0001','COMP_0001','EUR'), ('PRODUCT_0002','COMP_0001','USD'), ('PRODUCT_0003','COMP_0002','EUR')`,
    `CREATE TABLE debt_products (product_id VARCHAR, company_id VARCHAR, currency VARCHAR, type VARCHAR)`,
    `CREATE TABLE debt_schedule_config (company_id VARCHAR, product_id VARCHAR)`,
    `CREATE TABLE balances (company_id VARCHAR, product_id VARCHAR, date TIMESTAMP, balance DOUBLE)`,
    `INSERT INTO balances VALUES ('COMP_0001','PRODUCT_0001',TIMESTAMP '2026-08-31 00:00:00',1000),
                                 ('COMP_0001','PRODUCT_0002',TIMESTAMP '2026-08-31 00:00:00',500),
                                 ('COMP_0002','PRODUCT_0003',TIMESTAMP '2026-08-31 00:00:00',250)`,
    `CREATE TABLE invoices (company_id VARCHAR, currency VARCHAR, issuance_date DATE, pending_amount DOUBLE)`,
    `INSERT INTO invoices VALUES ('COMP_0001','EUR',DATE '2026-07-01',100), ('COMP_0001','EUR',DATE '2026-09-15',50)`,
    `CREATE TABLE transactions (company_id VARCHAR, product_id VARCHAR, date TIMESTAMP, status VARCHAR)`,
    // COMP_0001 al corte: 4 en euros (una pendiente) y 1 en dólares; después del
    // corte, 2 más que no cuentan en ninguna de las dos cifras.
    `INSERT INTO transactions VALUES
       ('COMP_0001','PRODUCT_0001',TIMESTAMP '2026-06-10 00:00:00','booked'),
       ('COMP_0001','PRODUCT_0001',TIMESTAMP '2026-07-10 00:00:00','booked'),
       ('COMP_0001','PRODUCT_0001',TIMESTAMP '2026-08-10 00:00:00','booked'),
       ('COMP_0001','PRODUCT_0001',TIMESTAMP '2026-08-20 00:00:00','pending'),
       ('COMP_0001','PRODUCT_0002',TIMESTAMP '2026-07-20 00:00:00','booked'),
       ('COMP_0001','PRODUCT_0001',TIMESTAMP '2026-09-15 00:00:00','booked'),
       ('COMP_0001','PRODUCT_0002',TIMESTAMP '2026-09-20 00:00:00','booked'),
       ('COMP_0002','PRODUCT_0003',TIMESTAMP '2026-06-11 00:00:00','booked'),
       ('COMP_0002','PRODUCT_0003',TIMESTAMP '2026-07-11 00:00:00','booked')`,
  ]) await connection.run(sql);
  connection.closeSync();
  instance.closeSync();
  return database;
}

type CoverageItem = {
  company_id: string;
  coverage: { counts: { transactions: number }; currencies: { code: string; n_tx: number }[] };
};

describe("cobertura del snapshot", () => {
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

  it("cuenta los movimientos y su desglose por moneda hasta el mismo corte", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xr034-coverage-"));
    scratchDirs.push(dir);
    const app = await buildApp({ logger: false, motherDuckDatabase: await snapshotFixture(dir) });
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/companies" });
      expect(response.statusCode).toBe(200);
      const items: CoverageItem[] = response.json().items;

      for (const item of items) {
        const total = item.coverage.currencies.reduce((sum, entry) => sum + entry.n_tx, 0);
        expect(`${item.company_id}: ${item.coverage.counts.transactions}`).toBe(`${item.company_id}: ${total}`);
      }

      const first = items.find((item) => item.company_id === "COMP_0001");
      expect(first?.coverage.counts.transactions).toBe(5);
      expect(first?.coverage.currencies).toEqual([{ code: "EUR", n_tx: 4 }, { code: "USD", n_tx: 1 }]);
    } finally {
      await app.close();
    }
  });
});
