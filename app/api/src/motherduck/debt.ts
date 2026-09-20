/**
 * «Posiciones de financiación»: la tabla de evidencia del pilar de Deuda
 * (XR-038, W2.3). Lectura directa de `debt_products`, por sociedad,
 * parametrizada y sin publicar nada.
 *
 * **Se sirven magnitudes, y por eso los campos se llaman `_abs`.** Los signos
 * de estas dos columnas están mezclados y no significan lo mismo: `granted` es
 * negativo en 2.043 de las 2.239 filas y positivo en 4; `outstanding` es
 * negativo en 1.351, positivo en 155 y cero en 743. `docs/data/motherduck.md`
 * ya avisa de que los importes de deuda pueden ser negativos y de que no hay
 * que invertir el signo sin atender a su significado.
 *
 * **Y por eso aquí no se calcula ninguna ratio de utilización.** Con los signos
 * así, `outstanding / granted` daría un número con pinta de porcentaje y sin
 * significado. La utilización que el producto enseña es la señal
 * `loc_utilisation`, que publica el motor; no se reconstruye desde esta tabla.
 *
 * Las 908 sociedades sin ningún producto de financiación reciben lista vacía:
 * no tener deuda no es un error ni una tabla de ceros.
 */

import { z } from "zod";

import type { CompanyDebt } from "../v2/store.js";
import type { EngineQueryClient } from "./engine.js";

export type { CompanyDebt, DebtRow } from "../v2/store.js";

/** El catálogo de deuda no tiene huecos salvo en `granted` (169 de 2.239). */
const rowSchema = z.object({
  product_id: z.string(),
  label: z.string(),
  type: z.string(),
  bank_name: z.string(),
  currency: z.string(),
  granted_abs: z.number().nullable(),
  outstanding_abs: z.number().nullable(),
});

export async function loadDebt(
  client: EngineQueryClient,
  companyId: string,
): Promise<CompanyDebt> {
  const items = await client.query(
    `SELECT product_id, label, type, bank_name, currency,
            abs(granted)::double granted_abs,
            abs(outstanding)::double outstanding_abs
     FROM debt_products
     WHERE company_id = ?
     ORDER BY abs(outstanding) DESC NULLS LAST, product_id`,
    rowSchema,
    [companyId],
  );

  return {
    summary: {
      n_products: items.length,
      n_banks: new Set(items.map((item) => item.bank_name)).size,
      // Ni total ni ratio: 39 monedas sin tabla de cambio y dos columnas con el
      // signo revuelto no dan ninguna cifra agregada que sea verdad. Lo único
      // que se resume es cuántas posiciones hay y en cuántos bancos.
      currencies: [...new Set(items.map((item) => item.currency))].sort(),
    },
    items,
  };
}
