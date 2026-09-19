import { z } from "zod";

const nullableText = z.string().nullable();
export const sourceCompanySchema = z.object({
  company_id: z.string(), group_id: z.string(), country: nullableText, currency: z.string(), erp: nullableText,
  created_at: nullableText, first_activity: nullableText, last_activity: nullableText,
  months_hist: z.number(), n_transactions: z.number(), n_pending: z.number(),
  n_invoices: z.number(), n_banking_products: z.number(), n_debt_products: z.number(),
  has_debt_repayment: z.boolean(), has_lineofcredit: z.boolean(),
});
/** Cabecera de la publicación real: columnas de `engine_exports`, no el JSON de `metadata`. */
export const exportSchema = z.object({
  model_version: z.string(), data_version: z.string(), cutoff_date: z.string(),
  generated_at: z.string(), n_companies: z.number(),
});
export const groupSchema = z.object({ group_id: z.string(), erp: nullableText, n_companies_in_sample: z.number() });
