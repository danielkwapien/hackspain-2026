/**
 * Las tres tablas de evidencia de XR-038 (W2.3) contra una DuckDB en memoria
 * con la misma forma que las tablas del reto. Sin red: lo que se comprueba aquí
 * son las decisiones de lectura —el hueco que no se rellena con un cero, la
 * magnitud, el corte y la fila huérfana que no se descarta—, no los recuentos
 * de la base real, que verifica el check de la feature contra `md:hackspain_2026`.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { loadActivity } from "../src/motherduck/activity.js";
import { loadCash } from "../src/motherduck/cash.js";
import { loadDebt } from "../src/motherduck/debt.js";
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

/**
 * La forma real, en pequeño: dos monedas, un producto bancario sin fila en
 * `balances`, deuda con los signos revueltos del origen, un movimiento después
 * del corte y otro que apunta a un producto que no está en ningún catálogo.
 */
async function dataset(): Promise<EngineQueryClient> {
  return harness(async (run) => {
    await run("CREATE TABLE engine_exports(cutoff_date VARCHAR)");
    await run("INSERT INTO engine_exports VALUES ('2026-08-01')");

    await run(`CREATE TABLE banking_products(
      product_id VARCHAR, company_id VARCHAR, label VARCHAR, type VARCHAR,
      bank_name VARCHAR, service VARCHAR, currency VARCHAR, created_at TIMESTAMP)`);
    await run(`INSERT INTO banking_products VALUES
      ('CHK_01','COMP_0001','CHECKING_01','checking','Bankinter','x','EUR',now()),
      ('CHK_02','COMP_0001','CHECKING_02','checking','Bankinter','x','EUR',now()),
      ('CHK_03','COMP_0001','CHECKING_03','checking','Abanca','x','EUR',now()),
      ('CHK_04','COMP_0001','CHECKING_04','checking','Paypal','x','USD',now())`);

    await run(`CREATE TABLE balances(
      product_id VARCHAR, company_id VARCHAR, date TIMESTAMP, balance DECIMAL(38,12),
      available DECIMAL(38,12), granted DECIMAL(38,12), liquidity DECIMAL(38,12),
      countable DECIMAL(38,12))`);
    await run(`INSERT INTO balances VALUES
      ('CHK_01','COMP_0001',TIMESTAMP '2026-09-01',100.50,NULL,NULL,NULL,NULL),
      ('CHK_02','COMP_0001',TIMESTAMP '2026-09-01',10.25,NULL,NULL,NULL,NULL),
      ('CHK_04','COMP_0001',TIMESTAMP '2026-09-01',0.00,NULL,NULL,NULL,NULL)`);

    await run(`CREATE TABLE debt_products(
      product_id VARCHAR, company_id VARCHAR, label VARCHAR, type VARCHAR,
      bank_name VARCHAR, service VARCHAR, currency VARCHAR, created_at TIMESTAMP,
      granted DECIMAL(38,12), outstanding DECIMAL(38,12), liquidity DECIMAL(38,12))`);
    await run(`INSERT INTO debt_products VALUES
      ('LOC_03','COMP_0001','LINEOFCREDIT_03','lineofcredit','Caixabank','x','EUR',now(),-300000,33342.18,NULL),
      ('LOAN_05','COMP_0001','LOAN_05','loan','Caixabank','x','EUR',now(),-169421.89,-148346.80,NULL)`);

    await run(`CREATE TABLE transactions(
      transaction_id VARCHAR, company_id VARCHAR, product_id VARCHAR, date TIMESTAMP,
      value_date TIMESTAMP, amount DECIMAL(38,12), exchange_rate DECIMAL(38,12),
      status VARCHAR, accounting_status VARCHAR, category VARCHAR,
      description VARCHAR, counterparty_id VARCHAR)`);
    await run(`INSERT INTO transactions VALUES
      ('T5','COMP_0001','CHK_01',TIMESTAMP '2026-09-01',NULL,5,NULL,'booked','x','payment','[COMPANY] [IBAN]','C1'),
      ('T4','COMP_0001','CHK_01',TIMESTAMP '2026-08-01',NULL,-3055.77,NULL,'booked','x','debt_repayment','[NUM]','C1'),
      ('T3','COMP_0001','CHK_02',TIMESTAMP '2026-07-15',NULL,120.00,NULL,'pending','x','-','[PERSON]','C2'),
      ('T2','COMP_0001','GHOST_99',TIMESTAMP '2026-07-01',NULL,-40.00,NULL,'booked','x','fee','[REF]','C3'),
      ('T1','COMP_0001','LOC_03',TIMESTAMP '2026-06-01',NULL,-10.00,NULL,'booked','x','debt_repayment','[TAXID]','C4')`);
  });
}

describe("liquidez · dónde está la caja", () => {
  it("un producto sin fila en balances trae saldo nulo, nunca cero", async () => {
    const cash = await loadCash(await dataset(), "COMP_0001");

    const abanca = cash.items.find((item) => item.bank_name === "Abanca");
    expect(abanca?.balance).toBeNull();
    // El producto sigue en la tabla: la sociedad tiene esa cuenta abierta.
    expect(cash.items).toHaveLength(4);
  });

  it("no sirve «Disponible»: la columna está vacía en las 7.996 filas de origen", async () => {
    const cash = await loadCash(await dataset(), "COMP_0001");

    for (const item of cash.items) expect(item).not.toHaveProperty("available");
  });

  it("totaliza euros y deja las demás monedas aparte, sin sumarlas", async () => {
    const cash = await loadCash(await dataset(), "COMP_0001");

    expect(cash.summary.total_eur).toBeCloseTo(110.75);
    expect(cash.summary.by_currency).toEqual([
      { currency: "EUR", n_products: 3, total: 110.75 },
      { currency: "USD", n_products: 1, total: 0 },
    ]);
  });

  it("cuenta bancos, no productos: dos cuentas del mismo banco son un banco", async () => {
    const cash = await loadCash(await dataset(), "COMP_0001");

    expect(cash.summary.n_products).toBe(4);
    expect(cash.summary.n_banks).toBe(3);
    expect(cash.as_of).toBe("2026-09-01");
  });

  it("una sociedad sin productos responde vacío, no falla", async () => {
    const cash = await loadCash(await dataset(), "COMP_9999");

    expect(cash.items).toEqual([]);
    // Sin ningún saldo medido el total es nulo: un 0 diría que no hay caja.
    expect(cash.summary.total_eur).toBeNull();
    expect(cash.summary.n_banks).toBe(0);
  });
});

describe("deuda · posiciones de financiación", () => {
  it("sirve magnitudes: los signos de origen están mezclados y no significan lo mismo", async () => {
    const debt = await loadDebt(await dataset(), "COMP_0001");

    const loc = debt.items.find((item) => item.label === "LINEOFCREDIT_03");
    // granted −300.000 y outstanding +33.342,18 en la misma fila.
    expect(loc?.granted_abs).toBeCloseTo(300000);
    expect(loc?.outstanding_abs).toBeCloseTo(33342.18);
  });

  it("no publica ninguna ratio de utilización", async () => {
    const debt = await loadDebt(await dataset(), "COMP_0001");

    // `outstanding / granted` sobre estos signos daría un número con apariencia
    // de porcentaje y sin significado: la utilización es la señal del motor.
    const keys = JSON.stringify(debt);
    expect(keys).not.toMatch(/utilis|utiliz/i);
  });

  it("una sociedad sin deuda responde lista vacía, no una tabla de ceros", async () => {
    const debt = await loadDebt(await dataset(), "COMP_9999");

    expect(debt.items).toEqual([]);
    expect(debt.summary).toEqual({ n_products: 0, n_banks: 0, currencies: [] });
  });
});

describe("actividad · últimos movimientos", () => {
  it("corta por la fecha del motor y ordena por fecha descendente", async () => {
    const items = await loadActivity(await dataset(), "COMP_0001", 50);

    // T5 es de 2026-09-01, un mes por delante del corte: fuera.
    expect(items.map((item) => item.transaction_id)).toEqual(["T4", "T3", "T2", "T1"]);
    expect(items[0].date).toBe("2026-08-01");
  });

  it("no descarta el movimiento cuyo producto no está en ningún catálogo", async () => {
    const items = await loadActivity(await dataset(), "COMP_0001", 50);

    const orphan = items.find((item) => item.transaction_id === "T2");
    expect(orphan?.bank_name).toBeNull();
    expect(orphan?.product_label).toBeNull();
    expect(orphan?.amount).toBeCloseTo(-40);
  });

  it("enriquece con los DOS catálogos: también los productos de deuda", async () => {
    const items = await loadActivity(await dataset(), "COMP_0001", 50);

    const repayment = items.find((item) => item.transaction_id === "T1");
    expect(repayment?.bank_name).toBe("Caixabank");
    expect(repayment?.product_label).toBe("LINEOFCREDIT_03");
  });

  it("la categoría `-` viaja tal cual y no se esconde", async () => {
    const items = await loadActivity(await dataset(), "COMP_0001", 50);

    const unclassified = items.find((item) => item.transaction_id === "T3");
    expect(unclassified?.category).toBe("-");
    expect(unclassified?.status).toBe("pending");
  });

  it("no sirve la descripción: el 77,6 % lleva marcadores de anonimización", async () => {
    const items = await loadActivity(await dataset(), "COMP_0001", 50);

    for (const item of items) expect(item).not.toHaveProperty("description");
  });

  it("respeta el límite pedido", async () => {
    const items = await loadActivity(await dataset(), "COMP_0001", 2);

    expect(items.map((item) => item.transaction_id)).toEqual(["T4", "T3"]);
  });
});
