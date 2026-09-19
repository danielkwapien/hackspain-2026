import { z } from "zod";

const nullableText = z.string().nullable();
const nullableNumber = z.number().nullable();
const jsonText = nullableText;

export const engineExportSchema = z.object({
  model_version: z.string(),
  params_version: z.string(),
  data_version: z.string(),
  cutoff_date: z.string(),
  months_from: nullableText,
  months_to: nullableText,
  n_groups: z.number().int().nullable(),
  n_group_rows: z.number().int().nullable(),
  n_companies: z.number().int().nullable(),
  n_company_rows: z.number().int().nullable(),
  n_months: z.number().int().nullable(),
  generated_at: z.string(),
  source_md5: z.string(),
  metadata_json: z.string().nullable(),
});
export type EngineExportRow = z.infer<typeof engineExportSchema>;

const scoreSchemaShape = {
  entity_kind: z.enum(["company", "group"]),
  group_id: nullableText,
  company_id: nullableText,
  month: z.string(),
  month_index: z.number().int().nullable(),
  months_hist: z.number().int().nullable(),
  warmup: z.boolean().nullable(),
  branch: nullableText,
  pillar_l: nullableNumber,
  pillar_p: nullableNumber,
  pillar_c: nullableNumber,
  pillar_d: nullableNumber,
  pillar_a: nullableNumber,
  weight_l: nullableNumber,
  weight_p: nullableNumber,
  weight_c: nullableNumber,
  weight_d: nullableNumber,
  weight_a: nullableNumber,
  source_level: nullableNumber,
  penalty: nullableNumber,
  level: nullableNumber,
  cap: nullableNumber,
  cap_code: nullableText,
  cap_adjustment: nullableNumber,
  score: nullableNumber,
  band: nullableText,
  delta_1m: nullableNumber,
  delta_3m: nullableNumber,
  delta_6m: nullableNumber,
  slope_3m: nullableNumber,
  slope_6m: nullableNumber,
  z_own: nullableNumber,
  run: z.number().int().nullable(),
  level_shift: nullableNumber,
  regime: nullableText,
  direction: nullableText,
  outlook_3m: nullableNumber,
  outlook_6m: nullableNumber,
  outlook_low: nullableNumber,
  outlook_high: nullableNumber,
  confidence: nullableNumber,
  coverage: nullableNumber,
  op_in_12m: nullableNumber,
  op_in_12m_currency: nullableText,
  strength_flags_json: jsonText,
  drivers_json: jsonText,
  narrative_json: jsonText,
  strategic_signals_json: jsonText,
  model_version: z.string(),
  params_version: z.string(),
  source_md5: z.string(),
};

export const engineScoreSchema = z.object(scoreSchemaShape);
export type EngineScoreRow = z.infer<typeof engineScoreSchema>;

export const engineSignalSchema = z.object({
  entity_kind: z.enum(["company", "group"]),
  group_id: nullableText,
  company_id: nullableText,
  month: z.string(),
  signal_id: z.string(),
  api_signal_id: nullableText,
  pillar: nullableText,
  label: nullableText,
  value: nullableNumber,
  value_fmt: nullableText,
  points: nullableNumber,
  u: nullableNumber,
  u_smooth: nullableNumber,
  u_ref: nullableNumber,
  weight: nullableNumber,
  contribution: nullableNumber,
  delta_vs_prev: nullableNumber,
  is_available: z.boolean().nullable(),
  quality_flag: nullableText,
  params_version: z.string(),
  source_md5: z.string(),
});
export type EngineSignalRow = z.infer<typeof engineSignalSchema>;

export const engineDriverSchema = z.object({
  entity_kind: z.enum(["company", "group"]),
  group_id: nullableText,
  company_id: nullableText,
  month: z.string(),
  rank: z.number().int().nullable(),
  signal_id: z.string(),
  pillar: nullableText,
  contribution: nullableNumber,
  delta_vs_prev: nullableNumber,
  value: nullableNumber,
  value_fmt: nullableText,
  direction: nullableText,
  kind: nullableText,
  message: nullableText,
  params_version: z.string(),
  source_md5: z.string(),
});
export type EngineDriverRow = z.infer<typeof engineDriverSchema>;

export const engineAlertSchema = z.object({
  alert_id: z.string(),
  entity_kind: z.enum(["company", "group"]),
  group_id: nullableText,
  company_id: nullableText,
  month: z.string(),
  severity: nullableText,
  cause: nullableText,
  direction: nullableText,
  score_before: nullableNumber,
  score_after: nullableNumber,
  top_driver: nullableText,
  message: nullableText,
  params_version: z.string(),
  source_md5: z.string(),
});
export type EngineAlertRow = z.infer<typeof engineAlertSchema>;

export const engineCatalogSchema = z.object({
  signal_id: z.string(),
  api_signal_id: nullableText,
  pillar: z.string(),
  label: nullableText,
  unit: nullableText,
  direction: nullableText,
  weight_in_pillar: nullableNumber,
  pillar_weight: nullableNumber,
  anchors_json: jsonText,
  window: nullableText,
  requires_json: jsonText,
  scores: z.boolean(),
  available: z.boolean(),
  format_json: jsonText,
  params_version: z.string(),
  source_md5: z.string(),
});
export type EngineCatalogRow = z.infer<typeof engineCatalogSchema>;

export const engineStrategicSchema = z.object({
  entity_kind: z.enum(["company", "group"]),
  group_id: nullableText,
  company_id: nullableText,
  month: z.string(),
  name: z.string(),
  value: nullableNumber,
  confidence: nullableNumber,
  coverage: nullableNumber,
  direction: nullableText,
  modifier_delta: nullableNumber,
  modifier_applied: z.boolean().nullable(),
  evidence_json: jsonText,
  params_version: z.string(),
  source_md5: z.string(),
});
export type EngineStrategicRow = z.infer<typeof engineStrategicSchema>;

export const engineFrameSchema = z.object({
  month: z.string(),
  payload_json: z.string(),
  params_version: z.string(),
  source_md5: z.string(),
});
export type EngineFrameRow = z.infer<typeof engineFrameSchema>;

export const engineSummarySchema = z.object({
  group_id: z.string(),
  month: z.string(),
  n_companies_scored: z.number().int().nullable(),
  dispersion: nullableNumber,
  weakest_company: nullableText,
  weakest_score: nullableNumber,
  strongest_company: nullableText,
  strongest_score: nullableNumber,
  params_version: z.string(),
  source_md5: z.string(),
});
export type EngineSummaryRow = z.infer<typeof engineSummarySchema>;
