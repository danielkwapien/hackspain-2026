/**
 * Lectura de las tablas de contrapartes publicadas por
 * `core/publish_counterparties.py` (XR-036).
 *
 * Es la evidencia que va debajo de los pilares de Pago y Cobros: quién te debe
 * y a quién debes. La API no agrega facturas aquí; lee lo ya publicado, filtra
 * por lado y ordena. Se consulta por sociedad y bajo demanda —son casi ochenta
 * mil filas— y siempre parametrizada, nunca concatenando el identificador.
 */

import { z } from "zod";

import type { Counterparties } from "../v2/store.js";
import type { EngineQueryClient } from "./engine.js";

export type { Counterparties, CounterpartyRow, CounterpartySummary } from "../v2/store.js";

/** Lado del libro: `ap` es a quién debes, `ar` es quién te debe. */
export const SIDES = ["ap", "ar"] as const;
export type Side = (typeof SIDES)[number];

/** Por peso (quién manda) o por deterioro (quién se está estirando). */
export const COUNTERPARTY_SORTS = ["weight", "deterioration"] as const;
export type CounterpartySort = (typeof COUNTERPARTY_SORTS)[number];

const nullableNumber = z.number().nullable();

const rowSchema = z.object({
  counterparty_id: z.string(),
  amount_12m: nullableNumber,
  weight: nullableNumber,
  n_invoices: z.number().nullable(),
  days_late_w: nullableNumber,
  pct_late: nullableNumber,
  overdue_total: nullableNumber,
  overdue_0_30: nullableNumber,
  overdue_31_60: nullableNumber,
  overdue_61_90: nullableNumber,
  overdue_90_plus: nullableNumber,
  sparkline_json: z.string().nullable(),
});

const summarySchema = z.object({
  month: z.string(),
  n_counterparties: z.number(),
  total_amount: nullableNumber,
  top1_weight: nullableNumber,
  effective_counterparties: nullableNumber,
  hhi: nullableNumber,
  days_late_w: nullableNumber,
  pct_late: nullableNumber,
  overdue_total: nullableNumber,
  eur_share: nullableNumber,
});

/**
 * `deterioration` ordena por desvío de días y deja al final a quien no tiene
 * ninguna factura pagada en ventana: sin días medidos no hay deterioro que
 * enseñar, y colarlo arriba con un cero fingiría puntualidad.
 */
const ORDER_BY: Record<CounterpartySort, string> = {
  weight: "weight DESC NULLS LAST, counterparty_id",
  deterioration: "days_late_w DESC NULLS LAST, weight DESC NULLS LAST, counterparty_id",
};

export async function loadCounterparties(
  client: EngineQueryClient,
  companyId: string,
  side: Side,
  sort: CounterpartySort,
  limit: number,
): Promise<Counterparties> {
  const items = await client.query(
    `SELECT counterparty_id, amount_12m, weight, n_invoices::integer n_invoices,
            days_late_w, pct_late, overdue_total,
            overdue_0_30, overdue_31_60, overdue_61_90, overdue_90_plus,
            sparkline_12::varchar sparkline_json
     FROM company_counterparties
     WHERE company_id = ? AND side = ?
     ORDER BY ${ORDER_BY[sort]}
     LIMIT ${limit}`,
    rowSchema,
    [companyId, side],
  );

  const summaries = await client.query(
    `SELECT month, n_counterparties::integer n_counterparties, total_amount, top1_weight,
            effective_counterparties, hhi, days_late_w, pct_late, overdue_total, eur_share
     FROM company_counterparty_summary
     WHERE company_id = ? AND side = ?
     LIMIT 1`,
    summarySchema,
    [companyId, side],
  );

  const summary = summaries[0];
  return {
    // Sin resumen no hay libro de ese lado: 553 de las 1.286 sociedades no
    // tienen contrapartes en euros en la ventana. Se devuelve el vacío
    // explícito, no un 404: no tener libro no es un error.
    summary: summary
      ? { ...summary }
      : {
          month: null, n_counterparties: 0, total_amount: null, top1_weight: null,
          effective_counterparties: null, hhi: null, days_late_w: null,
          pct_late: null, overdue_total: null, eur_share: null,
        },
    items: items.map((row) => ({
      counterparty_id: row.counterparty_id,
      amount_12m: row.amount_12m,
      weight: row.weight,
      n_invoices: row.n_invoices,
      days_late_w: row.days_late_w,
      pct_late: row.pct_late,
      overdue_total: row.overdue_total,
      overdue_0_30: row.overdue_0_30,
      overdue_31_60: row.overdue_31_60,
      overdue_61_90: row.overdue_61_90,
      overdue_90_plus: row.overdue_90_plus,
      sparkline_12: parseSparkline(row.sparkline_json),
    })),
  };
}

/** Doce importes mensuales. Si vienen rotos se devuelve vacío: sin minigráfica
 *  la fila sigue diciendo la verdad; con una inventada, no. */
function parseSparkline(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => (typeof value === "number" ? value : 0));
  } catch {
    return [];
  }
}

/**
 * ¿Están publicadas las tablas? Se pregunta una vez al cargar el store, para
 * que una base sin XR-036 degrade con un 503 explícito en su ruta en vez de
 * romper el resto del contrato v2, que no depende de ella.
 */
export async function counterpartiesPublished(client: EngineQueryClient): Promise<boolean> {
  try {
    await client.query(
      "SELECT count(*)::integer n FROM company_counterparty_summary LIMIT 1",
      z.object({ n: z.number() }),
    );
    return true;
  } catch {
    // Cualquier fallo aquí significa lo mismo para el llamante: esta base no
    // sirve contrapartes. El resto del contrato v2 no depende de ellas.
    return false;
  }
}
