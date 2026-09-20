/**
 * «Dónde está la caja»: la tabla de evidencia del pilar de Liquidez (XR-038,
 * W2.3).
 *
 * Es una lectura directa de dos tablas del reto —`banking_products` y la foto
 * de saldos de `balances`—, por sociedad y bajo demanda, siempre parametrizada
 * y sin publicar nada: aquí no se agrega nada que el motor no tenga ya.
 *
 * Dos decisiones de datos que la consulta hace explícitas:
 *
 * - **No hay columna «Disponible»**: `balances.available` está vacía en las
 *   7.996 filas, así que no se selecciona. Pintarla sería una columna entera de
 *   guiones haciéndose pasar por dato.
 * - **`LEFT JOIN`, no `JOIN`**: hay productos sin fila en `balances`
 *   (COMP_0169 tiene uno). Su saldo viaja `null` y la pantalla lo pinta «—»;
 *   un 0 diría que la cuenta está a cero, que es otra cosa.
 */

import { z } from "zod";

import type { CompanyCash, CashCurrencyTotal } from "../v2/store.js";
import type { EngineQueryClient } from "./engine.js";

export type { CompanyCash, CashRow, CashCurrencyTotal } from "../v2/store.js";

/** El catálogo bancario no tiene huecos (medido: 0 nulos en las 5.987 filas);
 *  el saldo sí, y es el único campo que puede faltar. */
const rowSchema = z.object({
  product_id: z.string(),
  bank_name: z.string(),
  label: z.string(),
  type: z.string(),
  currency: z.string(),
  balance: z.number().nullable(),
  balance_date: z.string().nullable(),
});

export async function loadCash(
  client: EngineQueryClient,
  companyId: string,
): Promise<CompanyCash> {
  const rows = await client.query(
    `SELECT p.product_id, p.bank_name, p.label, p.type, p.currency,
            b.balance::double balance, b.date::DATE::varchar balance_date
     FROM banking_products p
     LEFT JOIN balances b USING (product_id, company_id)
     WHERE p.company_id = ?
     ORDER BY b.balance DESC NULLS LAST, p.product_id`,
    rowSchema,
    [companyId],
  );

  const items = rows.map((row) => ({
    product_id: row.product_id,
    bank_name: row.bank_name,
    label: row.label,
    type: row.type,
    currency: row.currency,
    balance: row.balance,
  }));

  const dates = rows.flatMap((row) => (row.balance_date === null ? [] : [row.balance_date]));
  return {
    // La foto de saldos no es del corte del motor: tiene fecha propia y la
    // pantalla la cita, en vez de dejar creer que es del mes del score.
    as_of: dates.length === 0 ? null : dates.reduce((a, b) => (a > b ? a : b)),
    summary: {
      n_products: items.length,
      n_banks: new Set(items.map((item) => item.bank_name)).size,
      // Solo euros. El dataset trae 39 monedas y ninguna tabla de cambio:
      // sumar USD con EUR daría una cifra que no es dinero. Las demás monedas
      // van listadas aparte, cada una con su total.
      total_eur: total(items.filter((item) => item.currency === "EUR")),
      by_currency: byCurrency(items),
    },
    items,
  };
}

type Item = CompanyCash["items"][number];

/** `null` si ningún producto de ese grupo tiene saldo medido: sin fila en
 *  `balances` no hay cero que sumar, hay un hueco. */
function total(items: Item[]): number | null {
  const measured = items.flatMap((item) => (item.balance === null ? [] : [item.balance]));
  return measured.length === 0 ? null : measured.reduce((sum, value) => sum + value, 0);
}

function byCurrency(items: Item[]): CashCurrencyTotal[] {
  const codes = [...new Set(items.map((item) => item.currency))].sort();
  return codes.map((code) => {
    const group = items.filter((item) => item.currency === code);
    return { currency: code, n_products: group.length, total: total(group) };
  });
}
