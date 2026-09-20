/**
 * «Últimos movimientos»: la tabla de evidencia del pilar de Actividad (XR-038,
 * W2.3). Lectura directa de `transactions` —2,5 millones de filas—, por
 * sociedad, al corte, acotada por `limit` y siempre parametrizada.
 *
 * Tres decisiones de datos que la consulta hace explícitas:
 *
 * - **Corte**: `date <= cutoff`, el mismo de `engine_exports` que usa el resto
 *   de la API. Sin filtrar, el último movimiento de COMP_0169 es de 2026-09-01,
 *   un mes por delante del score que la pantalla enseña al lado.
 * - **`LEFT JOIN` a los dos catálogos**: 1.314 movimientos apuntan a productos
 *   que no están ni en `banking_products` ni en `debt_products`. Se quedan con
 *   banco y producto en `null`; descartarlos escondería movimientos reales.
 * - **La categoría viaja cruda, también `-`**, que con 635.530 movimientos es
 *   la mayor de todas. Es un hueco, no una categoría, y la pantalla lo etiqueta
 *   «Sin clasificar»; filtrarlo aquí falsearía el desglose.
 *
 * La descripción no se sirve: el 77,6 % lleva marcadores de anonimización
 * (`[NUM]`, `[COMPANY]`, `[IBAN]`…) y no puede ser la columna que identifica el
 * movimiento. Eso lo hacen la categoría y el banco·producto.
 */

import { z } from "zod";

import type { ActivityRow } from "../v2/store.js";
import type { EngineQueryClient } from "./engine.js";
import { CUTOFF } from "./sql.js";

export type { ActivityRow } from "../v2/store.js";

/** `category` (330 nulos) y `status` (29.839) faltan en una minoría de filas;
 *  el importe y la fecha no faltan nunca. */
const rowSchema = z.object({
  transaction_id: z.string(),
  date: z.string(),
  category: z.string().nullable(),
  bank_name: z.string().nullable(),
  product_label: z.string().nullable(),
  amount: z.number(),
  status: z.string().nullable(),
});

export async function loadActivity(
  client: EngineQueryClient,
  companyId: string,
  limit: number,
): Promise<ActivityRow[]> {
  return client.query(
    `SELECT t.transaction_id, t.date::DATE::varchar date, t.category,
            p.bank_name, p.label product_label,
            t.amount::double amount, t.status
     FROM transactions t
     LEFT JOIN (
       SELECT product_id, company_id, bank_name, label FROM banking_products
       UNION ALL
       SELECT product_id, company_id, bank_name, label FROM debt_products
     ) p USING (product_id, company_id)
     WHERE t.company_id = ? AND t.date <= ${CUTOFF}
     ORDER BY t.date DESC, t.transaction_id
     LIMIT ${limit}`,
    rowSchema,
    [companyId],
  );
}
