import type { CompanyRow, GroupRow, GroupTimelineRow, ScoreRow, V2Store } from "../v2/store.js";
import { MotherDuckClient, MotherDuckUnavailableError } from "./client.js";
import { exportSchema, groupSchema, sourceCompanySchema } from "./schemas.js";
import { loadCoverage } from "./coverage.js";
import { COMPANIES_SQL } from "./sql.js";

/** Fila v1 de una sociedad: sin score propio. El número lo sirve el motor real en `/api/v2`. */
function scoreRow(id: string, month: string, months: number): ScoreRow {
  return {
    company_id: id, group_id: null, month, month_index: null, months_hist: months,
    warmup: false, branch: null,
    pillars: { L: { value: null, weight: null }, P: { value: null, weight: null }, C: { value: null, weight: null }, D: { value: null, weight: null }, A: { value: null, weight: null } },
    level: null, penalty: null, cap_code: null, cap: null, score: null, band: null,
    delta_1m: null, delta_3m: null, delta_6m: null, slope_3m: null, slope_6m: null,
    z_own: null, breadth: null, run: null, p_change: null, level_shift: null, regime: null,
    outlook_3m: null, outlook_6m: null, outlook_low: null, outlook_high: null, outlook_label: null,
    confidence: null, strength_flags: [], base: null,
    source_level: null, cap_adjustment: null, coverage: null,
    op_in_12m: null, op_in_12m_currency: null, op_in_12m_eur: null,
    drivers: [], narrative: null, strategic_signals: [],
  };
}

export async function loadMotherDuckStore(client: MotherDuckClient): Promise<V2Store> {
  const headers = await client.query(
    `SELECT model_version, data_version, cutoff_date, generated_at::varchar generated_at,
     n_companies::integer n_companies FROM engine_exports LIMIT 1`, exportSchema);
  if (headers.length !== 1) throw new MotherDuckUnavailableError();
  const header = headers[0];
  const sources = await client.query(COMPANIES_SQL, sourceCompanySchema);
  if (sources.length !== header.n_companies) throw new MotherDuckUnavailableError();
  const groupsSource = await client.query("SELECT group_id, erp, n_companies_in_sample::integer n_companies_in_sample FROM groups ORDER BY group_id", groupSchema);
  const month = header.cutoff_date.slice(0, 7);
  const scoreByCompany = new Map<string, ScoreRow[]>();
  const companies: CompanyRow[] = sources.map((source) => {
    scoreByCompany.set(source.company_id, [scoreRow(source.company_id, month, source.months_hist)]);
    return {
      company_id: source.company_id, group_id: source.group_id, name: source.company_id,
      country: source.country, currency: source.currency, erp: source.erp, created_at: source.created_at,
      first_activity: source.first_activity, last_activity: source.last_activity, months_hist: source.months_hist,
      has_invoices: source.n_invoices > 0, has_debt: source.n_debt_products > 0,
      has_debt_repayment: source.has_debt_repayment, has_lineofcredit: source.has_lineofcredit, branch: null,
      n_banking_products: source.n_banking_products, n_debt_products: source.n_debt_products,
      n_invoices: source.n_invoices, n_transactions: source.n_transactions, n_transactions_pending: source.n_pending,
      pending_eur: source.pending_eur, op_in_12m: null, cash_quality: null,
    };
  });
  const companiesByGroup = new Map<string, CompanyRow[]>();
  for (const company of companies) companiesByGroup.set(company.group_id, [...(companiesByGroup.get(company.group_id) ?? []), company]);
  const groups: GroupRow[] = groupsSource.map((source) => {
    const members = companiesByGroup.get(source.group_id) ?? [];
    return { group_id: source.group_id, name: source.group_id, erp: source.erp, n_companies: members.length,
      countries: [...new Set(members.flatMap((member) => member.country === null ? [] : [member.country]))],
      currencies: [...new Set(members.flatMap((member) => member.currency === null ? [] : [member.currency]))],
      consolidation_currency: null, op_in_12m_eur: null, has_intercompany: false };
  });
  const coverage = await loadCoverage(client, companies);
  const groupTimelineByGroup = new Map<string, GroupTimelineRow[]>(groups.map((group) => [group.group_id, [{
    group_id: group.group_id, month, score: null, band: null, regime: null, delta_1m: null, delta_3m: null,
    outlook_6m: null, outlook_low: null, outlook_high: null, confidence: null,
    n_companies_scored: null,
    dispersion: null, weakest_company: null, weakest_score: null, strongest_company: null,
    intragroup_dependency_max: null, op_in_12m: null, op_in_12m_currency: null,
    op_in_12m_eur: null, strength_flags: [],
  }]]));
  return {
    dir: "md:hackspain_2026", manifest: {
      data_kind: "real", model_version: header.model_version, data_version: header.data_version,
      contract_version: "dashboard-v1", cutoff_date: header.cutoff_date, generated_at: header.generated_at,
      months: [month], window: coverage.window, counts: { companies: companies.length, groups: groups.length, scores: sources.length },
      source: { data_dir: "motherduck" }, capabilities: { snapshots_only: true },
      notes: ["Datos sintéticos oficiales del reto, consultados en MotherDuck.", "El inventario v1 solo describe el dato de origen: el score, su historia y las predicciones los sirve el motor real en /api/v2.", "La cobertura cuenta todos los meses naturales de la ventana global, incluidos el inicial y el mes parcial del corte.", "Todos los recuentos (transacciones, su desglose por moneda y facturas) llegan hasta el corte; los meses de actividad y los importes de movimientos usan además solo contabilizados (booked); pendientes se cuentan aparte.", "La caja observada suma únicamente productos bancarios por moneda; la deuda se expone por producto y no reduce ese total.", "Los importes se presentan por moneda; no hay conversión FX implícita."],
    }, months: [month], companies, companiesById: new Map(companies.map((company) => [company.company_id, company])),
    companiesByGroup, groups, groupsById: new Map(groups.map((group) => [group.group_id, group])), catalog: [], scoreByCompany,
    scoreAt: (id, at) => scoreByCompany.get(id)?.find((row) => row.month === at) ?? null,
    groupTimelineByGroup, groupScoreAt: (id, at) => groupTimelineByGroup.get(id)?.find((row) => row.month === at) ?? null,
    driversAt: async () => [], narrativeAt: async () => null, alerts: [], hasCompanyAlert: () => false,
    hasGroupAlert: () => false, signalsFor: async () => [], readFrame: async () => null,
    coverageAt: (id) => coverage.byCompany.get(id) ?? null,
  };
}

export function createMotherDuckLoader(client: MotherDuckClient): () => Promise<V2Store> {
  let cached: { store: V2Store; until: number } | null = null;
  let pending: Promise<V2Store> | null = null;
  return async () => {
    if (cached && Date.now() < cached.until) return cached.store;
    pending ??= loadMotherDuckStore(client).then((store) => {
      cached = { store, until: Date.now() + 60_000 };
      return store;
    }).finally(() => { pending = null; });
    return pending;
  };
}
