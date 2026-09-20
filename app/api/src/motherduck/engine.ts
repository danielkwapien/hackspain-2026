/**
 * Lectura de las tablas derivadas XR-033 publicadas por `core/publish.py`
 * (`features/XR-033/publication-contract.md`).
 *
 * El motor vive fuera de HTTP: aquí se proyectan al arrancar solo columnas
 * escalares (scores de grupo y sociedad, catálogo, alertas y resumen por grupo) y
 * las piezas grandes (señales, drivers, narrativa, frames) se consultan por
 * entidad o por mes bajo demanda, con memoización. Nada se recalcula y ningún
 * fallo se tapa con mocks ni con el baseline estático: si las tablas no están o
 * la publicación es inconsistente se lanza `MotherDuckUnavailableError` y la API
 * responde 503 `source_unavailable`.
 */

import { z } from "zod";
import type {
  AlertRow,
  CatalogRow,
  DriverRow,
  NarrativeRow,
  SignalRow,
  StrategicSignalRow,
} from "../v2/store.js";
import { MotherDuckUnavailableError } from "./client.js";
import { driversFromScore, narrativeFromScore } from "./engine-json.js";
import {
  engineAlertSchema,
  engineCatalogSchema,
  engineExportSchema,
  engineFrameSchema,
  engineScoreSchema,
  engineSignalSchema,
  engineStrategicSchema,
  engineSummarySchema,
  type EngineCatalogRow,
  type EngineSignalRow,
  type EngineStrategicRow,
  type EngineSummaryRow,
} from "./engine-schema.js";

/**
 * Cliente mínimo de consultas: `MotherDuckClient` y una DuckDB local lo cumplen.
 * Serializa las consultas (una conexión DuckDB no ejecuta sentencias en paralelo),
 * así que agrupar varias en `Promise.all` no las solapa.
 */
export type EngineQueryClient = {
  query<T>(sql: string, schema: z.ZodType<T>, values?: string[]): Promise<T[]>;
};

/** Pilar de una fila: `value` normalizado 0..1 y peso efectivo de ese mes. */
export type EnginePillars = Record<
  "L" | "P" | "C" | "D" | "A",
  { value: number | null; weight: number | null }
>;

/**
 * Fila mensual del motor, común a los dos granos. `company_id` es nulo en las
 * filas de grupo y `group_id` lo es solo si la sociedad no tiene grupo.
 */
export type EngineScore = {
  entity_kind: "company" | "group";
  group_id: string | null;
  company_id: string | null;
  month: string;
  month_index: number | null;
  months_hist: number | null;
  warmup: boolean;
  branch: string | null;
  pillars: EnginePillars;
  source_level: number | null;
  penalty: number | null;
  level: number | null;
  cap: number | null;
  cap_code: string | null;
  cap_adjustment: number | null;
  score: number | null;
  band: string | null;
  delta_1m: number | null;
  delta_3m: number | null;
  delta_6m: number | null;
  slope_3m: number | null;
  slope_6m: number | null;
  z_own: number | null;
  run: number | null;
  level_shift: number | null;
  regime: string | null;
  direction: string | null;
  outlook_3m: number | null;
  outlook_6m: number | null;
  outlook_low: number | null;
  outlook_high: number | null;
  confidence: number | null;
  coverage: number | null;
  /** Operativa de los ultimos 12 meses publicados, con su moneda explicita. */
  op_in_12m: number | null;
  op_in_12m_currency: string | null;
  op_in_12m_eur: number | null;
  /** Etiquetas observables del mes (`publication_rows.STRENGTH_FLAGS`). */
  strength_flags: string[];
};

export type EngineMetadata = {
  parameters: Record<string, unknown> | null;
  table_counts: Record<string, number> | null;
  group_payload_sha256: string | null;
  company_payload_sha256: string | null;
};

export type EngineManifest = {
  model_version: string;
  params_version: string;
  data_version: string;
  cutoff_date: string;
  months_from: string;
  months_to: string;
  n_groups: number | null;
  n_group_rows: number | null;
  n_companies: number | null;
  n_company_rows: number | null;
  n_months: number | null;
  generated_at: string;
  source_md5: string;
};

/** Piezas que solo se piden al abrir una entidad concreta. */
export type EngineDetails = {
  drivers: DriverRow[];
  narrative: NarrativeRow | null;
  strategic_signals: StrategicSignalRow[];
};

export type EngineStore = {
  manifest: EngineManifest;
  metadata: EngineMetadata;
  months: string[];
  catalog: CatalogRow[];
  alerts: AlertRow[];
  groupScoreAt: (groupId: string, month: string) => EngineScore | null;
  companyScoreAt: (companyId: string, month: string) => EngineScore | null;
  groupTimeline: (groupId: string) => EngineScore[];
  companyTimeline: (companyId: string) => EngineScore[];
  groupSummaryAt: (groupId: string, month: string) => EngineSummaryRow | null;
  /** Señales del mes de corte y la serie completa de la entidad, por mes. */
  companySignals: (companyId: string) => Promise<SignalRow[]>;
  details: (kind: "company" | "group", id: string, month: string) => Promise<EngineDetails>;
  frameAt: (month: string) => Promise<unknown | null>;
};

const PILLARS = ["L", "P", "C", "D", "A"] as const;
const ID_COLUMN: Record<"company" | "group", string> = {
  company: "company_id",
  group: "group_id",
};
const SCORE_TABLE: Record<"company" | "group", string> = {
  company: "company_scores",
  group: "group_scores",
};

const SCORE_PROJECTION = `
entity_kind, group_id, company_id, month, month_index, months_hist, warmup, branch,
pillar_l, pillar_p, pillar_c, pillar_d, pillar_a,
weight_l, weight_p, weight_c, weight_d, weight_a,
source_level, penalty, level, cap, cap_code, cap_adjustment, score, band,
delta_1m, delta_3m, delta_6m, slope_3m, slope_6m, z_own, run, level_shift, regime,
direction, outlook_3m, outlook_6m, outlook_low, outlook_high, confidence, coverage,
op_in_12m, op_in_12m_currency, op_in_12m_eur, strength_flags::varchar strength_flags_json,
model_version, params_version, source_md5
`;

const EXPORT_SQL = `
SELECT model_version, params_version, data_version, cutoff_date, months_from, months_to,
 n_groups, n_group_rows, n_companies, n_company_rows, n_months,
 generated_at::varchar generated_at, source_md5, metadata::varchar metadata_json
FROM engine_exports
`;

const CATALOG_SQL = `
SELECT signal_id, api_signal_id, pillar, label, unit, direction, weight_in_pillar,
 pillar_weight, anchors::varchar anchors_json, "window", requires::varchar requires_json,
 scores, available, format::varchar format_json, params_version, source_md5
FROM signal_catalog
ORDER BY signal_id
`;

/**
 * Las dos tablas de la bandeja. XR-037 (I2) publicó `*_alerts_v2` AL LADO de las
 * originales —mismo DDL, las filas de `buffer_days` copiadas tal cual y cuatro
 * causas más—, y dejó `company_alerts` y `group_alerts` intactas. El rollback es
 * volver a escribir aquí los dos nombres viejos: no hay nada más que deshacer.
 */
const COMPANY_ALERTS_TABLE = "company_alerts_v2";
const GROUP_ALERTS_TABLE = "group_alerts_v2";

/**
 * Alertas de los dos granos; la tabla larga ya trae severidad, causa y mensaje.
 *
 * El `ORDER BY` no es cosmético: `?latest_per_company=true` se queda con una
 * fila por sociedad recorriendo esta lista, y sin orden declarado la bandeja
 * cambiaría de contenido entre dos lecturas de la misma publicación.
 */
const ALERTS_SQL = `
SELECT alert_id, entity_kind, group_id, company_id, month, severity, cause, direction,
 score_before, score_after, top_driver, message, params_version, source_md5
FROM ${COMPANY_ALERTS_TABLE}
UNION ALL
SELECT alert_id, entity_kind, group_id, company_id, month, severity, cause, direction,
 score_before, score_after, top_driver, message, params_version, source_md5
FROM ${GROUP_ALERTS_TABLE}
ORDER BY alert_id
`;

const SUMMARY_SQL = `
SELECT group_id, month, n_companies_scored, dispersion, weakest_company, weakest_score,
 strongest_company, strongest_score, params_version, source_md5
FROM group_company_summary
`;

const JSON_DETAILS_SQL = (table: string, idColumn: string): string => `
SELECT entity_kind, group_id, company_id, month,
 drivers::varchar drivers_json, narrative::varchar narrative_json
FROM ${table} WHERE ${idColumn} = ? AND month = ?
`;

const SIGNALS_SQL = (table: string, idColumn: string): string => `
SELECT entity_kind, group_id, company_id, month, signal_id, api_signal_id, pillar, label,
 value, value_fmt, points, u, u_smooth, u_ref, weight, contribution, delta_vs_prev,
 is_available, quality_flag, params_version, source_md5
FROM ${table} WHERE ${idColumn} = ? ORDER BY month, signal_id
`;

const STRATEGIC_SQL = (table: string, idColumn: string): string => `
SELECT entity_kind, group_id, company_id, month, name, value, confidence, coverage,
 direction, modifier_delta, modifier_applied, evidence::varchar evidence_json,
 params_version, source_md5
FROM ${table} WHERE ${idColumn} = ? AND month = ?
ORDER BY name
`;

const FRAME_SQL = `
SELECT month, payload::varchar payload_json, params_version, source_md5
FROM engine_frames WHERE month = ?
`;

const scalarScoreSchema = engineScoreSchema.omit({
  drivers_json: true,
  narrative_json: true,
  strategic_signals_json: true,
});
type ScalarScoreRow = z.infer<typeof scalarScoreSchema>;
const scoreJsonSchema = engineScoreSchema.pick({
  entity_kind: true,
  group_id: true,
  company_id: true,
  month: true,
  drivers_json: true,
  narrative_json: true,
});

/** Columna de cada pilar en la tabla publicada. */
const PILLAR_COLUMNS: Record<
  (typeof PILLARS)[number],
  { value: keyof ScalarScoreRow; weight: keyof ScalarScoreRow }
> = {
  L: { value: "pillar_l", weight: "weight_l" },
  P: { value: "pillar_p", weight: "weight_p" },
  C: { value: "pillar_c", weight: "weight_c" },
  D: { value: "pillar_d", weight: "weight_d" },
  A: { value: "pillar_a", weight: "weight_a" },
};

function parseJson<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (raw === null) return null;
  try {
    // Una columna JSON nula llega como la cadena `null`, no como SQL NULL.
    const parsed = JSON.parse(raw) as unknown;
    return parsed === null ? null : schema.parse(parsed);
  } catch (error) {
    throw new MotherDuckUnavailableError();
  }
}

function pillarsOf(row: ScalarScoreRow): EnginePillars {
  return Object.fromEntries(
    PILLARS.map((pillar) => [
      pillar,
      {
        value: row[PILLAR_COLUMNS[pillar].value],
        weight: row[PILLAR_COLUMNS[pillar].weight],
      },
    ]),
  ) as EnginePillars;
}

function scoreOf(row: ScalarScoreRow): EngineScore {
  return {
    entity_kind: row.entity_kind,
    group_id: row.group_id,
    company_id: row.company_id,
    month: row.month,
    month_index: row.month_index,
    months_hist: row.months_hist,
    warmup: row.warmup ?? false,
    branch: row.branch,
    pillars: pillarsOf(row),
    source_level: row.source_level,
    penalty: row.penalty,
    level: row.level,
    cap: row.cap,
    cap_code: row.cap_code,
    cap_adjustment: row.cap_adjustment,
    score: row.score,
    band: row.band,
    delta_1m: row.delta_1m,
    delta_3m: row.delta_3m,
    delta_6m: row.delta_6m,
    slope_3m: row.slope_3m,
    slope_6m: row.slope_6m,
    z_own: row.z_own,
    run: row.run,
    level_shift: row.level_shift,
    regime: row.regime,
    direction: row.direction,
    outlook_3m: row.outlook_3m,
    outlook_6m: row.outlook_6m,
    outlook_low: row.outlook_low,
    outlook_high: row.outlook_high,
    confidence: row.confidence,
    coverage: row.coverage,
    op_in_12m: row.op_in_12m,
    op_in_12m_currency: row.op_in_12m_currency,
    op_in_12m_eur: row.op_in_12m_eur,
    strength_flags: parseJson(row.strength_flags_json, z.array(z.string())) ?? [],
  };
}

function strategicSignalOf(row: EngineStrategicRow): StrategicSignalRow {
  return {
    name: row.name,
    value: row.value,
    confidence: row.confidence,
    coverage: row.coverage,
    direction: row.direction,
    modifier_delta: row.modifier_delta,
    modifier_applied: row.modifier_applied,
    evidence: parseJson(row.evidence_json, z.record(z.string(), z.json())),
  };
}

function catalogOf(row: EngineCatalogRow): CatalogRow {
  const anchors = parseJson(row.anchors_json, z.array(z.array(z.number())));
  return {
    signal_id: row.signal_id,
    api_signal_id: row.api_signal_id,
    pillar: row.pillar,
    pillar_name: null,
    name: row.label,
    unit: row.unit,
    direction: row.direction,
    weight_in_pillar: row.weight_in_pillar,
    pillar_weight: row.pillar_weight,
    norm: anchors === null ? "percentile" : "anchor",
    anchors,
    window: row.window,
    ewma: null,
    requires: requiresOf(row.requires_json),
    scores: row.scores,
    available: row.available,
    format: parseJson(row.format_json, z.record(z.string(), z.json())),
  };
}

function requiresOf(raw: string | null): string | null {
  if (raw === null) return null;
  const parsed = parseJson(raw, z.union([z.array(z.string()), z.string()]));
  if (parsed === null) return null;
  if (typeof parsed === "string") return parsed;
  return parsed.length === 0 ? null : parsed.join(", ");
}

function alertOf(row: { alert_id: string; entity_kind: "company" | "group"; group_id: string | null; company_id: string | null; month: string; severity: string | null; cause: string | null; direction: string | null; score_before: number | null; score_after: number | null; top_driver: string | null; message: string | null }): AlertRow {
  return {
    alert_id: row.alert_id,
    company_id: row.company_id ?? "",
    group_id: row.group_id,
    event: row.cause ?? "",
    cause: row.cause ?? "",
    severity: row.severity ?? "",
    direction: row.direction ?? "",
    month_detected: row.month,
    month_evident: null,
    lead_time_months: null,
    trigger_signal: row.top_driver,
    score_before: row.score_before,
    score_after: row.score_after,
    status: null,
    message: row.message,
  };
}

function signalOf(row: EngineSignalRow): SignalRow {
  return {
    entity_kind: row.entity_kind,
    company_id: row.company_id,
    group_id: row.group_id,
    month: row.month,
    signal_id: row.signal_id,
    pillar: row.pillar ?? "",
    value: row.value,
    value_fmt: row.value_fmt,
    u: row.u,
    u_smooth: row.u_smooth,
    u_ref: row.u_ref,
    weight: row.weight,
    contribution: row.contribution,
    delta_vs_prev: row.delta_vs_prev,
    is_available: row.is_available ?? false,
    quality_flag: row.quality_flag,
  };
}

function indexByEntity(rows: EngineScore[], kind: "company" | "group"): Map<string, EngineScore[]> {
  const index = new Map<string, EngineScore[]>();
  for (const row of rows) {
    const id = kind === "company" ? row.company_id : row.group_id;
    if (id === null) throw new MotherDuckUnavailableError();
    const bucket = index.get(id);
    if (bucket) bucket.push(row);
    else index.set(id, [row]);
  }
  return index;
}

function monthKey(id: string, month: string): string {
  return `${id}|${month}`;
}

export async function loadEngineStore(client: EngineQueryClient): Promise<EngineStore> {
  const exportRows = await client.query(EXPORT_SQL, engineExportSchema);
  if (exportRows.length !== 1) throw new MotherDuckUnavailableError();
  const exported = exportRows[0];
  const metadata = parseJson(exported.metadata_json, z.object({
    parameters: z.record(z.string(), z.json()).nullable().optional(),
    table_counts: z.record(z.string(), z.number()).nullable().optional(),
    group_payload_sha256: z.string().nullable().optional(),
    company_payload_sha256: z.string().nullable().optional(),
  }));

  const [groupRows, companyRows, catalogRows, alerts] = await Promise.all([
    client.query(`SELECT ${SCORE_PROJECTION} FROM group_scores ORDER BY group_id, month`, scalarScoreSchema),
    client.query(`SELECT ${SCORE_PROJECTION} FROM company_scores ORDER BY company_id, month`, scalarScoreSchema),
    client.query(CATALOG_SQL, engineCatalogSchema),
    client.query(ALERTS_SQL, engineAlertSchema),
  ]);
  const summaries = await client.query(SUMMARY_SQL, engineSummarySchema);

  // Una publicación a medias (o dos publicaciones mezcladas) no se sirve: los
  // recuentos y la huella tienen que cuadrar con `engine_exports`.
  if (groupRows.length !== exported.n_group_rows || companyRows.length !== exported.n_company_rows) {
    throw new MotherDuckUnavailableError();
  }
  for (const row of [...groupRows, ...companyRows]) {
    if (row.source_md5 !== exported.source_md5 || row.params_version !== exported.params_version) {
      throw new MotherDuckUnavailableError();
    }
  }

  const groups = indexByEntity(groupRows.map(scoreOf), "group");
  const companies = indexByEntity(companyRows.map(scoreOf), "company");
  const months = [...new Set(groupRows.map((row) => row.month))].sort();
  const groupByKey = new Map<string, EngineScore>();
  for (const rows of groups.values()) {
    for (const row of rows) groupByKey.set(monthKey(row.group_id ?? "", row.month), row);
  }
  const companyByKey = new Map<string, EngineScore>();
  for (const rows of companies.values()) {
    for (const row of rows) companyByKey.set(monthKey(row.company_id ?? "", row.month), row);
  }
  const summaryByKey = new Map<string, EngineSummaryRow>();
  for (const summary of summaries) {
    summaryByKey.set(monthKey(summary.group_id, summary.month), summary);
  }

  const detailsCache = new Map<string, Promise<EngineDetails>>();
  function details(kind: "company" | "group", id: string, month: string): Promise<EngineDetails> {
    const cacheKey = monthKey(`${kind}:${id}`, month);
    const cached = detailsCache.get(cacheKey);
    if (cached) return cached;
    const pending = (async (): Promise<EngineDetails> => {
      const [rows, signals] = await Promise.all([
        client.query(JSON_DETAILS_SQL(SCORE_TABLE[kind], ID_COLUMN[kind]), scoreJsonSchema, [id, month]),
        client.query(
          STRATEGIC_SQL(`${kind}_strategic_signals`, ID_COLUMN[kind]),
          engineStrategicSchema,
          [id, month],
        ),
      ]);
      const row = rows[0];
      const strategic = signals.map(strategicSignalOf);
      if (!row) return { drivers: [], narrative: null, strategic_signals: strategic };
      return {
        drivers: driversFromScore(row),
        narrative: narrativeFromScore(row),
        strategic_signals: strategic,
      };
    })().catch((error: unknown) => {
      detailsCache.delete(cacheKey);
      throw error;
    });
    detailsCache.set(cacheKey, pending);
    if (detailsCache.size > 512) {
      const oldest = detailsCache.keys().next().value;
      if (oldest !== undefined) detailsCache.delete(oldest);
    }
    return pending;
  }

  return {
    manifest: {
      model_version: exported.model_version,
      params_version: exported.params_version,
      data_version: exported.data_version,
      cutoff_date: exported.cutoff_date,
      months_from: exported.months_from ?? months[0] ?? "",
      months_to: exported.months_to ?? months.at(-1) ?? "",
      n_groups: exported.n_groups,
      n_group_rows: exported.n_group_rows,
      n_companies: exported.n_companies,
      n_company_rows: exported.n_company_rows,
      n_months: exported.n_months,
      generated_at: exported.generated_at,
      source_md5: exported.source_md5,
    },
    metadata: {
      parameters: metadata?.parameters ?? null,
      table_counts: metadata?.table_counts ?? null,
      group_payload_sha256: metadata?.group_payload_sha256 ?? null,
      company_payload_sha256: metadata?.company_payload_sha256 ?? null,
    },
    months,
    catalog: catalogRows.map(catalogOf),
    alerts: alerts.map(alertOf),
    groupScoreAt: (groupId, month) => groupByKey.get(monthKey(groupId, month)) ?? null,
    companyScoreAt: (companyId, month) => companyByKey.get(monthKey(companyId, month)) ?? null,
    groupTimeline: (groupId) => groups.get(groupId) ?? [],
    companyTimeline: (companyId) => companies.get(companyId) ?? [],
    groupSummaryAt: (groupId, month) => summaryByKey.get(monthKey(groupId, month)) ?? null,
    async companySignals(companyId: string): Promise<SignalRow[]> {
      const rows = await client.query(
        SIGNALS_SQL("company_signal_values", ID_COLUMN.company),
        engineSignalSchema,
        [companyId],
      );
      return rows.map(signalOf);
    },
    details,
    async frameAt(month: string): Promise<unknown | null> {
      const rows = await client.query(FRAME_SQL, engineFrameSchema, [month]);
      const row = rows[0];
      return row ? parseJson(row.payload_json, z.record(z.string(), z.json())) : null;
    },
  };
}
