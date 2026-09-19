import { z } from "zod";

const nullableText = z.string().nullable();
export const snapshotSchema = z.object({
  contract_version: z.string(), entity: z.object({ kind: z.literal("company"), id: z.string() }),
  model_version: z.literal("static-baseline-v1"), data_version: z.string(), cutoff_date: z.string(),
  status: z.enum(["available", "partial", "insufficient_data"]), score: z.number().nullable(), band: nullableText,
  months: z.array(z.json()), trajectory: z.json(), quality: z.json(), factors: z.record(z.string(), z.json()),
  drivers: z.array(z.json()), alerts: z.array(z.json()), forecast: z.json(),
}).passthrough();
export type Snapshot = z.infer<typeof snapshotSchema>;
export const sourceCompanySchema = z.object({
  company_id: z.string(), group_id: z.string(), country: nullableText, currency: z.string(), erp: nullableText,
  created_at: nullableText, first_activity: nullableText, last_activity: nullableText,
  months_hist: z.number(), n_transactions: z.number(), n_pending: z.number(),
  n_invoices: z.number(), pending_eur: z.number(), n_banking_products: z.number(), n_debt_products: z.number(),
  payload: z.string(), has_debt_repayment: z.boolean(), has_lineofcredit: z.boolean(),
});
export const exportSchema = z.object({ metadata: z.string() });
export const metadataSchema = z.object({
  schema_version: z.string(), model_version: z.literal("static-baseline-v1"), data_version: z.string(),
  cutoff_date: z.string(), generated_at: z.string(), count: z.number(),
});
export const groupSchema = z.object({ group_id: z.string(), erp: nullableText, n_companies_in_sample: z.number() });
