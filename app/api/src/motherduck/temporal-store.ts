/**
 * Adaptador `V2Store` sobre las tablas derivadas de MotherDuck.
 *
 * Las rutas `/api/v2/*` hablan `V2Store` (el mismo contrato que el dataset mock):
 * aquí se les sirve la publicación temporal real —series de grupo y sociedad,
 * timelines, catálogo, alertas y frames— sin recalcular finanzas en HTTP y sin
 * rellenar huecos con el snapshot estático. La identidad de publicación
 * (`source_md5`, `params_version`) se conserva en el manifest para que `/meta`
 * pueda auditarla.
 */

import { z } from "zod";
import type {
  CompanyRow,
  EntityProfileRow,
  GroupRow,
  GroupTimelineRow,
  ScoreRow,
  V2Store,
} from "../v2/store.js";
import type { MotherDuckClient } from "./client.js";
import { MotherDuckUnavailableError } from "./client.js";
import type { EngineScore, EngineStore } from "./engine.js";
import { loadEngineStore } from "./engine.js";
import type { EngineSummaryRow } from "./engine-schema.js";
import { invoiceCountsCte, pendingEurCte } from "./sql.js";

const nullableText = z.string().nullable();

/** Universo de sociedades: misma consulta de actividad que el snapshot, sin `scores`. */
const COMPANIES_SQL = `
WITH cutoff AS (SELECT cutoff_date::date AS cutoff_date FROM engine_exports LIMIT 1),
activity AS (
 SELECT company_id,
  min(date) FILTER (WHERE status = 'booked' AND date <= (SELECT cutoff_date FROM cutoff))::varchar first_activity,
  max(date) FILTER (WHERE status = 'booked' AND date <= (SELECT cutoff_date FROM cutoff))::varchar last_activity,
  count(DISTINCT date_trunc('month', date)) FILTER (WHERE status = 'booked' AND date <= (SELECT cutoff_date FROM cutoff))::integer months_hist,
  -- Al corte como sus vecinos de este CTE: un movimiento posterior todavía no
  -- existía. Los dos estados siguen contando; lo único acotado es la fecha.
  count(*) FILTER (WHERE date <= (SELECT cutoff_date FROM cutoff))::integer n_transactions,
  count(*) FILTER (WHERE status = 'pending' AND date <= (SELECT cutoff_date FROM cutoff))::integer n_pending
 FROM transactions GROUP BY company_id
), ${invoiceCountsCte("(SELECT cutoff_date FROM cutoff)")},
 ${pendingEurCte("(SELECT cutoff_date FROM cutoff)")},
 bank_counts AS (SELECT company_id, count(*)::integer n FROM banking_products GROUP BY company_id),
 debt_counts AS (SELECT company_id, count(*)::integer n FROM debt_products GROUP BY company_id)
SELECT c.company_id, c.group_id, c.country, c.currency, c.erp, c.created_at::varchar created_at,
 coalesce(a.first_activity, '')::varchar first_activity, coalesce(a.last_activity, '')::varchar last_activity,
 coalesce(a.months_hist, 0)::integer months_hist, coalesce(a.n_transactions, 0)::integer n_transactions,
 coalesce(a.n_pending, 0)::integer n_pending, coalesce(i.n, 0)::integer n_invoices,
 coalesce(pe.p, 0)::double pending_eur,
 coalesce(b.n, 0)::integer n_banking_products, coalesce(d.n, 0)::integer n_debt_products,
 EXISTS(SELECT 1 FROM debt_schedule_config sc WHERE sc.company_id = c.company_id) has_debt_repayment,
 EXISTS(SELECT 1 FROM debt_products dp WHERE dp.company_id = c.company_id AND dp.type = 'lineofcredit') has_lineofcredit
FROM companies c
LEFT JOIN activity a USING(company_id) LEFT JOIN invoice_counts i USING(company_id)
LEFT JOIN pending_eur pe USING(company_id)
LEFT JOIN bank_counts b USING(company_id) LEFT JOIN debt_counts d USING(company_id)
ORDER BY c.company_id
`;

const GROUPS_SQL = `
SELECT group_id, erp,
 (SELECT count(*)::integer FROM companies c WHERE c.group_id = g.group_id) n_companies
FROM groups g ORDER BY group_id
`;

const companyDirectorySchema = z.object({
  company_id: z.string(),
  group_id: z.string(),
  country: nullableText,
  currency: nullableText,
  erp: nullableText,
  created_at: nullableText,
  first_activity: nullableText,
  last_activity: nullableText,
  months_hist: z.number().int(),
  n_transactions: z.number().int(),
  n_pending: z.number().int(),
  n_invoices: z.number().int(),
  pending_eur: z.number(),
  n_banking_products: z.number().int(),
  n_debt_products: z.number().int(),
  has_debt_repayment: z.boolean(),
  has_lineofcredit: z.boolean(),
});

/** Identidad de presentacion: 1.536 filas, una por sociedad y una por grupo. */
const PROFILES_SQL = `
SELECT entity_id, entity_kind, name, country, country_method, industry, industry_method,
 generated_at::varchar generated_at
FROM entity_profile ORDER BY entity_id
`;

const profileSchema = z.object({
  entity_id: z.string(),
  entity_kind: z.enum(["company", "group"]),
  name: z.string(),
  country: nullableText,
  country_method: z.enum(["real", "inferred"]).nullable(),
  industry: nullableText,
  industry_method: z.enum(["real", "inferred"]).nullable(),
  generated_at: nullableText,
});

const groupDirectorySchema = z.object({
  group_id: z.string(),
  erp: nullableText,
  n_companies: z.number().int(),
});

function companyRowOf(
  row: z.infer<typeof companyDirectorySchema>,
  profile: EntityProfileRow | undefined,
): CompanyRow {
  return {
    company_id: row.company_id,
    group_id: row.group_id,
    // El nombre es apariencia; el id manda y responde cuando falta el perfil.
    name: profile?.name ?? row.company_id,
    country: row.country,
    currency: row.currency,
    erp: row.erp,
    created_at: row.created_at,
    first_activity: row.first_activity,
    last_activity: row.last_activity,
    months_hist: row.months_hist,
    has_invoices: row.n_invoices > 0,
    has_debt: row.n_debt_products > 0,
    has_debt_repayment: row.has_debt_repayment,
    has_lineofcredit: row.has_lineofcredit,
    branch: null,
    n_banking_products: row.n_banking_products,
    n_debt_products: row.n_debt_products,
    n_invoices: row.n_invoices,
    n_transactions: row.n_transactions,
    n_transactions_pending: row.n_pending,
    // Pendiente de cobro en euros al corte del motor, del mismo CTE que el
    // snapshot (`pendingEurCte`): un 0 aquí es «ninguna factura en euros por
    // cobrar», que es lo que dice el dato, no un hueco.
    pending_eur: row.pending_eur,
    op_in_12m: null,
    cash_quality: null,
  };
}

function scoreRowOf(row: EngineScore): ScoreRow {
  if (row.company_id === null) throw new MotherDuckUnavailableError();
  return {
    company_id: row.company_id,
    group_id: row.group_id,
    month: row.month,
    month_index: row.month_index,
    months_hist: row.months_hist,
    warmup: row.warmup,
    branch: row.branch,
    pillars: row.pillars,
    level: row.level,
    penalty: row.penalty,
    cap_code: row.cap_code,
    cap: row.cap,
    score: row.score,
    band: row.band,
    delta_1m: row.delta_1m,
    delta_3m: row.delta_3m,
    delta_6m: row.delta_6m,
    slope_3m: row.slope_3m,
    slope_6m: row.slope_6m,
    z_own: row.z_own,
    breadth: null,
    run: row.run,
    p_change: null,
    level_shift: row.level_shift,
    regime: row.regime,
    outlook_3m: row.outlook_3m,
    outlook_6m: row.outlook_6m,
    outlook_low: row.outlook_low,
    outlook_high: row.outlook_high,
    outlook_label: null,
    confidence: row.confidence,
    strength_flags: row.strength_flags,
    op_in_12m: row.op_in_12m,
    op_in_12m_currency: row.op_in_12m_currency,
    op_in_12m_eur: row.op_in_12m_eur,
    base: null,
    source_level: row.source_level,
    cap_adjustment: row.cap_adjustment,
    coverage: row.coverage,
    drivers: [],
    narrative: null,
    strategic_signals: [],
  };
}

function groupTimelineRowOf(row: EngineScore, summary: EngineSummaryRow | null): GroupTimelineRow {
  if (row.group_id === null) throw new MotherDuckUnavailableError();
  return {
    group_id: row.group_id,
    month: row.month,
    score: row.score,
    band: row.band,
    regime: row.regime,
    delta_1m: row.delta_1m,
    delta_3m: row.delta_3m,
    outlook_6m: row.outlook_6m,
    outlook_low: row.outlook_low,
    outlook_high: row.outlook_high,
    confidence: row.confidence,
    n_companies_scored: summary?.n_companies_scored ?? null,
    dispersion: summary?.dispersion ?? null,
    weakest_company: summary?.weakest_company ?? null,
    weakest_score: summary?.weakest_score ?? null,
    strongest_company: summary?.strongest_company ?? null,
    intragroup_dependency_max: null,
    op_in_12m: row.op_in_12m,
    op_in_12m_currency: row.op_in_12m_currency,
    op_in_12m_eur: row.op_in_12m_eur,
    strength_flags: row.strength_flags,
  };
}

export async function loadTemporalStore(
  engine: EngineStore,
  client: MotherDuckClient,
): Promise<V2Store> {
  const [companyRows, groupRows, profileRows] = await Promise.all([
    client.query(COMPANIES_SQL, companyDirectorySchema),
    client.query(GROUPS_SQL, groupDirectorySchema),
    client.query(PROFILES_SQL, profileSchema),
  ]);
  const profilesById = new Map(profileRows.map((profile) => [profile.entity_id, profile]));
  const companies = companyRows.map((row) => companyRowOf(row, profilesById.get(row.company_id)));
  const groups: GroupRow[] = groupRows.map((row) => {
    const members = companies.filter((company) => company.group_id === row.group_id);
    return {
      group_id: row.group_id,
      name: profilesById.get(row.group_id)?.name ?? row.group_id,
      erp: row.erp,
      n_companies: row.n_companies,
      countries: [...new Set(members.flatMap((member) => (member.country === null ? [] : [member.country])))],
      currencies: [...new Set(members.flatMap((member) => (member.currency === null ? [] : [member.currency])))],
      consolidation_currency: null,
      op_in_12m_eur: null,
      has_intercompany: false,
    };
  });

  const companiesByGroup = new Map<string, CompanyRow[]>();
  for (const company of companies) {
    const bucket = companiesByGroup.get(company.group_id);
    if (bucket) bucket.push(company);
    else companiesByGroup.set(company.group_id, [company]);
  }

  const scoreByCompany = new Map<string, ScoreRow[]>();
  for (const company of companies) {
    scoreByCompany.set(company.company_id, engine.companyTimeline(company.company_id).map(scoreRowOf));
  }
  const scoreByKey = new Map<string, ScoreRow>();
  for (const rows of scoreByCompany.values()) {
    for (const row of rows) scoreByKey.set(`${row.company_id}|${row.month}`, row);
  }

  const groupTimelineByGroup = new Map<string, GroupTimelineRow[]>();
  for (const group of groups) {
    const rows = engine.groupTimeline(group.group_id).map((row) =>
      groupTimelineRowOf(row, engine.groupSummaryAt(group.group_id, row.month)),
    );
    groupTimelineByGroup.set(group.group_id, rows);
  }
  const groupTimelineByKey = new Map<string, GroupTimelineRow>();
  for (const rows of groupTimelineByGroup.values()) {
    for (const row of rows) groupTimelineByKey.set(`${row.group_id}|${row.month}`, row);
  }

  const alertMonths = new Set<string>();
  const groupAlertMonths = new Set<string>();
  for (const alert of engine.alerts) {
    alertMonths.add(`${alert.company_id}|${alert.month_detected}`);
    if (alert.group_id !== null) groupAlertMonths.add(`${alert.group_id}|${alert.month_detected}`);
  }

  const months = engine.months;
  const manifest = engine.manifest;
  const database = client.database;

  return {
    dir: database,
    manifest: {
      data_kind: "real",
      model_version: manifest.model_version,
      data_version: manifest.data_version,
      contract_version: "dashboard-v1",
      cutoff_date: manifest.cutoff_date,
      generated_at: manifest.generated_at,
      params_version: manifest.params_version,
      months,
      window: { start: months[0] ?? "", end: months.at(-1) ?? "" },
      counts: {
        companies: companies.length,
        groups: groups.length,
        group_rows: manifest.n_group_rows ?? 0,
        company_rows: manifest.n_company_rows ?? 0,
        months: months.length,
        catalog: engine.catalog.length,
        alerts: engine.alerts.length,
      },
      source: { data_dir: database },
      capabilities: { snapshots_only: false },
      notes: [
        "Motor mensual real (embat-layered-v1) publicado por lote y servido desde las tablas derivadas.",
        "Una fila por entidad y mes; los meses sin soporte y los campos no calculados viajan como null, nunca como 0.",
        "Los scores de sociedad se calculan con el mismo motor a grano sociedad; ningún score de grupo se copia a sus filiales.",
      ],
      params: null,
      raw_parameters: engine.metadata.parameters,
    },
    months,
    companies,
    companiesById: new Map(companies.map((company) => [company.company_id, company])),
    companiesByGroup,
    groups,
    groupsById: new Map(groups.map((group) => [group.group_id, group])),
    catalog: engine.catalog,
    scoreByCompany,
    scoreAt: (companyId, month) => scoreByKey.get(`${companyId}|${month}`) ?? null,
    groupTimelineByGroup,
    groupScoreAt: (groupId, month) => groupTimelineByKey.get(`${groupId}|${month}`) ?? null,
    groupDetailsAt: (groupId, month) => engine.details("group", groupId, month),
    driversAt: async (companyId, month) =>
      (await engine.details("company", companyId, month)).drivers,
    narrativeAt: async (companyId, month) =>
      (await engine.details("company", companyId, month)).narrative,
    strategicSignalsAt: async (kind, id, month) =>
      (await engine.details(kind, id, month)).strategic_signals,
    alerts: engine.alerts,
    hasCompanyAlert: (companyId, month) => alertMonths.has(`${companyId}|${month}`),
    hasGroupAlert: (groupId, month) => groupAlertMonths.has(`${groupId}|${month}`),
    signalsFor: (companyId) => engine.companySignals(companyId),
    readFrame: (month) => engine.frameAt(month),
    profileFor: (entityId) => profilesById.get(entityId) ?? null,
  };
}

/** Acceso memoizado (60 s) al store temporal; compartido por todas las peticiones. */
export function createTemporalLoader(client: MotherDuckClient): () => Promise<V2Store> {
  let cached: { store: V2Store; until: number } | null = null;
  let pending: Promise<V2Store> | null = null;
  return async () => {
    if (cached && Date.now() < cached.until) return cached.store;
    pending ??= (async () => {
      const store = await loadTemporalStore(await loadEngineStore(client), client);
      cached = { store, until: Date.now() + 60_000 };
      return store;
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
}
