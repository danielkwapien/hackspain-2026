/**
 * Loader de las tablas v2 del mock (`datasets_mocked/`).
 *
 * La API no calcula finanzas (§1 de `docs/dani/contrato-dashboard-v1.md`): aquí
 * solo se lee lo precalculado y se indexa por `company_id` y por `month`.
 *
 * Arranque en frío: todas las tablas menos `signals.csv` se cargan juntas
 * (< 25 MB). `signals.csv` son 438.701 filas y 80 MB, así que se carga **de
 * forma perezosa** en la primera petición que necesite señales; el resto de
 * endpoints no lo pagan.
 */

import type { Coverage } from "../exports.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cellBoolean, cellNumber, cellText, columnIndex, forEachRow } from "./csv.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** `<app/api>/data/reports` (funciona igual desde `src/` en dev y desde `dist/` en build). */
export const defaultReportsDir = (): string =>
  path.resolve(moduleDir, "..", "..", "data", "reports");

export const REGENERATE_V2_COMMAND =
  ".venv/bin/python datasets_mocked/generate_mock.py --seed 42 --data-dir datasets " +
  "--out datasets_mocked --inventory app/exports/v1 --now 2026-09-19T00:00:00+00:00";

export type V2Manifest = {
  capabilities?: { snapshots_only: boolean };
  data_kind?: string;
  model_version?: string;
  data_version?: string;
  contract_version?: string;
  cutoff_date?: string;
  generated_at?: string;
  generator_version?: string;
  params_version?: string;
  seed?: number;
  limit?: number | null;
  months?: string[];
  counts?: Record<string, number>;
  notes?: string[];
  window?: { start: string; end: string };
  source?: { data_dir?: string; files?: { file: string; sha256: string; bytes: number }[] };
  reference?: {
    bands?: Record<string, (number | null)[]>;
    base_median?: number;
    pillar_weights?: Record<string, number>;
    percentile_breakpoints?: Record<string, number[]>;
    u_ref?: Record<string, number>;
  };
  params?: Record<string, unknown> | null;
  raw_parameters?: Record<string, unknown> | null;
};

export type CompanyRow = {
  company_id: string;
  group_id: string;
  name: string;
  country: string | null;
  currency: string | null;
  erp: string | null;
  created_at: string | null;
  first_activity: string | null;
  last_activity: string | null;
  months_hist: number | null;
  has_invoices: boolean;
  has_debt: boolean;
  has_debt_repayment: boolean;
  has_lineofcredit: boolean;
  branch: string | null;
  n_banking_products: number | null;
  n_debt_products: number | null;
  n_invoices: number | null;
  n_transactions: number | null;
  n_transactions_pending?: number;
  op_in_12m: number | null;
  cash_quality: string | null;
};

export type GroupRow = {
  group_id: string;
  name: string;
  erp: string | null;
  n_companies: number | null;
  countries: string[];
  currencies: string[];
  consolidation_currency: string | null;
  op_in_12m_eur: number | null;
  has_intercompany: boolean;
};

export type ScoreRow = {
  company_id: string;
  group_id: string | null;
  month: string;
  month_index: number | null;
  months_hist: number | null;
  warmup: boolean;
  branch: string | null;
  pillars: Record<"L" | "P" | "C" | "D" | "A", { value: number | null; weight: number | null }>;
  level: number | null;
  penalty: number | null;
  cap_code: string | null;
  cap: number | null;
  score: number | null;
  band: string | null;
  delta_1m: number | null;
  delta_3m: number | null;
  delta_6m: number | null;
  slope_3m: number | null;
  slope_6m: number | null;
  z_own: number | null;
  breadth: number | null;
  run: number | null;
  p_change: number | null;
  level_shift: number | null;
  regime: string | null;
  outlook_3m: number | null;
  outlook_6m: number | null;
  outlook_low: number | null;
  outlook_high: number | null;
  outlook_label: string | null;
  confidence: number | null;
  strength_flags: string[];
  base: number | null;
  source_level: number | null;
  cap_adjustment: number | null;
  coverage: number | null;
  /** Operativa de los ultimos 12 meses publicados, con su moneda explicita. */
  op_in_12m: number | null;
  op_in_12m_currency: string | null;
  op_in_12m_eur: number | null;
  drivers: DriverRow[];
  narrative: NarrativeRow | null;
  strategic_signals: StrategicSignalRow[];
};

export type GroupTimelineRow = {
  group_id: string;
  month: string;
  score: number | null;
  band: string | null;
  regime: string | null;
  delta_1m: number | null;
  delta_3m: number | null;
  outlook_6m: number | null;
  outlook_low: number | null;
  outlook_high: number | null;
  confidence: number | null;
  n_companies_scored: number | null;
  dispersion: number | null;
  weakest_company: string | null;
  weakest_score: number | null;
  strongest_company: string | null;
  intragroup_dependency_max: number | null;
  /** Campos del lote aditivo: operativa 12 m con moneda y etiquetas observables. */
  op_in_12m: number | null;
  op_in_12m_currency: string | null;
  op_in_12m_eur: number | null;
  strength_flags: string[];
};

export type DriverRow = {
  entity_kind: "company" | "group";
  company_id: string | null;
  group_id: string | null;
  month: string;
  rank: number | null;
  signal_id: string;
  pillar: string | null;
  contribution: number | null;
  delta_vs_prev: number | null;
  value: number | null;
  value_fmt: string | null;
  direction: string | null;
  kind?: string | null;
  message?: string | null;
};

export type NarrativeRow = {
  entity_kind: "company" | "group";
  company_id: string | null;
  group_id: string | null;
  month: string;
  headline: string | null;
  body: string | null;
  watch_next: string | null;
  guardrail_passed: boolean | null;
};

export type StrategicSignalRow = {
  name: string;
  value: number | null;
  confidence: number | null;
  coverage: number | null;
  direction: string | null;
  modifier_delta: number | null;
  modifier_applied: boolean | null;
  evidence: Record<string, unknown> | null;
};

export type AlertRow = {
  alert_id: string;
  company_id: string;
  group_id: string | null;
  event: string;
  severity: string;
  direction: string;
  month_detected: string;
  month_evident: string | null;
  lead_time_months: number | null;
  trigger_signal: string | null;
  score_before: number | null;
  score_after: number | null;
  status: string | null;
  message: string | null;
};

export type SignalRow = {
  entity_kind: "company" | "group";
  company_id: string | null;
  group_id: string | null;
  month: string;
  signal_id: string;
  pillar: string;
  value: number | null;
  value_fmt: string | null;
  u: number | null;
  u_smooth: number | null;
  u_ref: number | null;
  weight: number | null;
  contribution: number | null;
  delta_vs_prev: number | null;
  is_available: boolean;
  quality_flag: string | null;
};

export type CatalogRow = {
  signal_id: string;
  api_signal_id: string | null;
  pillar: string;
  pillar_name: string | null;
  name: string | null;
  unit: string | null;
  direction: string | null;
  weight_in_pillar: number | null;
  pillar_weight: number | null;
  norm: string | null;
  anchors: number[][] | null;
  window: string | null;
  ewma: string | null;
  requires: string | null;
  scores: boolean;
  available: boolean;
  /** Definicion de formato del valor (`unit`, `decimals`, `scale`, `suffix`). */
  format: Record<string, unknown> | null;
};

/** Detalles mensuales de una entidad: drivers, narrativa y perspectivas. */
export type EntityDetails = {
  drivers: DriverRow[];
  narrative: NarrativeRow | null;
  strategic_signals: StrategicSignalRow[];
};

export type V2Store = {
  dir: string;
  coverageAt?: (companyId: string) => Coverage | null;
  snapshotAt?: (companyId: string) => unknown;
  manifest: V2Manifest;
  months: string[];
  companies: CompanyRow[];
  companiesById: Map<string, CompanyRow>;
  companiesByGroup: Map<string, CompanyRow[]>;
  groups: GroupRow[];
  groupsById: Map<string, GroupRow>;
  catalog: CatalogRow[];
  scoreByCompany: Map<string, ScoreRow[]>;
  scoreAt: (companyId: string, month: string) => ScoreRow | null;
  groupTimelineByGroup: Map<string, GroupTimelineRow[]>;
  groupScoreAt: (groupId: string, month: string) => GroupTimelineRow | null;
  /** Drivers y narrativa viven en la tabla de scores del mes: se piden por entidad. */
  driversAt: (companyId: string, month: string) => Promise<DriverRow[]>;
  narrativeAt: (companyId: string, month: string) => Promise<NarrativeRow | null>;
  /** Detalles del grano grupo; el mock no los publica. */
  groupDetailsAt?: (groupId: string, month: string) => Promise<EntityDetails>;
  /** Perspectivas estrategicas del mes, por grano: empresa o grupo. */
  strategicSignalsAt?: (
    kind: "company" | "group",
    id: string,
    month: string,
  ) => Promise<StrategicSignalRow[]>;
  alerts: AlertRow[];
  hasCompanyAlert: (companyId: string, month: string) => boolean;
  hasGroupAlert: (groupId: string, month: string) => boolean;
  /** Perezoso: la primera llamada lee e indexa `signals.csv` entero. */
  signalsFor: (companyId: string) => Promise<SignalRow[]>;
  readFrame: (month: string) => Promise<unknown | null>;
};

/**
 * Informe de Health pregenerado por `app/tools/gen_health_reports.py` (fuera del loop,
 * con Claude) y versionado en `app/api/data/reports/<company_id>.json`. La API lo sirve
 * tal cual está en disco: no lo recalcula ni lo reescribe.
 */
export type HealthReport = {
  company_id: string;
  as_of: string;
  generated_at: string;
  model: string;
  risk_level: "low" | "medium" | "high";
  summary: string;
  sections: { title: string; body: string }[];
  watch_next: string[];
};

/** Lectura perezosa del informe, como `readFrame`: sin fichero → `null`, otro error → lanza. */
export async function reportFor(reportsDir: string, companyId: string): Promise<HealthReport | null> {
  try {
    return JSON.parse(await readFile(path.join(reportsDir, `${companyId}.json`), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export class V2UnavailableError extends Error {
  readonly dir: string;

  constructor(dir: string, cause?: unknown) {
    super(`No se pudieron cargar las tablas v2 en ${dir}`);
    this.name = "V2UnavailableError";
    this.dir = dir;
    this.cause = cause;
  }
}

const PILLARS = ["L", "P", "C", "D", "A"] as const;

function key(companyId: string, month: string): string {
  return `${companyId}|${month}`;
}

function push<T>(map: Map<string, T[]>, mapKey: string, value: T): void {
  const bucket = map.get(mapKey);
  if (bucket) bucket.push(value);
  else map.set(mapKey, [value]);
}

async function readTable<T>(
  dir: string,
  file: string,
  build: (values: string[], at: Record<string, number>) => T,
  onRow: (row: T) => void,
): Promise<void> {
  const text = await readFile(path.join(dir, file), "utf8");
  let at: Record<string, number> | null = null;
  forEachRow(text, (values, header) => {
    if (at === null) at = columnIndex(header);
    onRow(build(values, at));
  });
}

function buildCompany(values: string[], at: Record<string, number>): CompanyRow {
  return {
    company_id: cellText(values, at.company_id) ?? "",
    group_id: cellText(values, at.group_id) ?? "",
    name: cellText(values, at.name) ?? "",
    country: cellText(values, at.country),
    currency: cellText(values, at.currency),
    erp: cellText(values, at.erp),
    created_at: cellText(values, at.created_at),
    first_activity: cellText(values, at.first_activity),
    last_activity: cellText(values, at.last_activity),
    months_hist: cellNumber(values, at.months_hist),
    has_invoices: cellBoolean(values, at.has_invoices),
    has_debt: cellBoolean(values, at.has_debt),
    has_debt_repayment: cellBoolean(values, at.has_debt_repayment),
    has_lineofcredit: cellBoolean(values, at.has_lineofcredit),
    branch: cellText(values, at.branch),
    n_banking_products: cellNumber(values, at.n_banking_products),
    n_debt_products: cellNumber(values, at.n_debt_products),
    n_invoices: cellNumber(values, at.n_invoices),
    n_transactions: cellNumber(values, at.n_transactions),
    op_in_12m: cellNumber(values, at.op_in_12m),
    cash_quality: cellText(values, at.cash_quality),
  };
}

function buildGroup(values: string[], at: Record<string, number>): GroupRow {
  const list = (raw: string | null): string[] => (raw === null ? [] : raw.split("|"));
  return {
    group_id: cellText(values, at.group_id) ?? "",
    name: cellText(values, at.name) ?? "",
    erp: cellText(values, at.erp),
    n_companies: cellNumber(values, at.n_companies),
    countries: list(cellText(values, at.countries)),
    currencies: list(cellText(values, at.currencies)),
    consolidation_currency: cellText(values, at.consolidation_currency),
    op_in_12m_eur: cellNumber(values, at.op_in_12m_eur),
    has_intercompany: cellBoolean(values, at.has_intercompany),
  };
}

function buildScore(values: string[], at: Record<string, number>): ScoreRow {
  const pillars = {} as ScoreRow["pillars"];
  for (const pillar of PILLARS) {
    pillars[pillar] = {
      value: cellNumber(values, at[`pillar_${pillar}`]),
      weight: cellNumber(values, at[`weight_${pillar}`]),
    };
  }
  const flags = cellText(values, at.strength_flags);
  return {
    company_id: cellText(values, at.company_id) ?? "",
    group_id: cellText(values, at.group_id),
    month: cellText(values, at.month) ?? "",
    month_index: cellNumber(values, at.month_index),
    months_hist: cellNumber(values, at.months_hist),
    warmup: cellBoolean(values, at.warmup),
    branch: cellText(values, at.branch),
    pillars,
    level: cellNumber(values, at.level),
    penalty: cellNumber(values, at.penalty),
    cap_code: cellText(values, at.cap_code),
    cap: cellNumber(values, at.cap),
    score: cellNumber(values, at.score),
    band: cellText(values, at.band),
    delta_1m: cellNumber(values, at.delta_1m),
    delta_3m: cellNumber(values, at.delta_3m),
    delta_6m: cellNumber(values, at.delta_6m),
    slope_3m: cellNumber(values, at.slope_3m),
    slope_6m: cellNumber(values, at.slope_6m),
    z_own: cellNumber(values, at.z_own),
    breadth: cellNumber(values, at.breadth),
    run: cellNumber(values, at.run),
    p_change: cellNumber(values, at.p_change),
    level_shift: cellNumber(values, at.level_shift),
    regime: cellText(values, at.regime),
    outlook_3m: cellNumber(values, at.outlook_3m),
    outlook_6m: cellNumber(values, at.outlook_6m),
    outlook_low: cellNumber(values, at.outlook_low),
    outlook_high: cellNumber(values, at.outlook_high),
    outlook_label: cellText(values, at.outlook_label),
    confidence: cellNumber(values, at.confidence),
    strength_flags: flags === null ? [] : flags.split("|"),
    base: cellNumber(values, at.base),
    source_level: cellNumber(values, at.source_level),
    cap_adjustment: cellNumber(values, at.cap_adjustment),
    coverage: cellNumber(values, at.coverage),
    op_in_12m: cellNumber(values, at.op_in_12m),
    op_in_12m_currency: cellText(values, at.op_in_12m_currency),
    op_in_12m_eur: cellNumber(values, at.op_in_12m_eur),
    drivers: [],
    narrative: null,
    strategic_signals: [],
  };
}

function buildGroupTimeline(values: string[], at: Record<string, number>): GroupTimelineRow {
  return {
    group_id: cellText(values, at.group_id) ?? "",
    month: cellText(values, at.month) ?? "",
    score: cellNumber(values, at.score),
    band: cellText(values, at.band),
    regime: cellText(values, at.regime),
    delta_1m: cellNumber(values, at.delta_1m),
    delta_3m: cellNumber(values, at.delta_3m),
    outlook_6m: cellNumber(values, at.outlook_6m),
    outlook_low: cellNumber(values, at.outlook_low),
    outlook_high: cellNumber(values, at.outlook_high),
    confidence: cellNumber(values, at.confidence),
    n_companies_scored: cellNumber(values, at.n_companies_scored),
    dispersion: cellNumber(values, at.dispersion),
    weakest_company: cellText(values, at.weakest_company),
    weakest_score: cellNumber(values, at.weakest_score),
    strongest_company: cellText(values, at.strongest_company),
    intragroup_dependency_max: cellNumber(values, at.intragroup_dependency_max),
    op_in_12m: null,
    op_in_12m_currency: null,
    op_in_12m_eur: null,
    strength_flags: [],
  };
}

function buildDriver(values: string[], at: Record<string, number>): DriverRow {
  return {
    entity_kind: "company",
    company_id: cellText(values, at.company_id),
    group_id: null,
    month: cellText(values, at.month) ?? "",
    rank: cellNumber(values, at.rank),
    signal_id: cellText(values, at.signal_id) ?? "",
    pillar: cellText(values, at.pillar),
    contribution: cellNumber(values, at.contribution),
    delta_vs_prev: cellNumber(values, at.delta_vs_prev),
    value: cellNumber(values, at.value),
    value_fmt: cellText(values, at.value_fmt),
    direction: cellText(values, at.direction),
  };
}

function buildNarrative(values: string[], at: Record<string, number>): NarrativeRow {
  return {
    entity_kind: "company",
    company_id: cellText(values, at.company_id),
    group_id: null,
    month: cellText(values, at.month) ?? "",
    headline: cellText(values, at.headline),
    body: cellText(values, at.body),
    watch_next: cellText(values, at.watch_next),
    guardrail_passed: cellBoolean(values, at.guardrail_passed),
  };
}

function buildAlert(values: string[], at: Record<string, number>): AlertRow {
  return {
    alert_id: cellText(values, at.alert_id) ?? "",
    company_id: cellText(values, at.company_id) ?? "",
    group_id: cellText(values, at.group_id),
    event: cellText(values, at.event) ?? "",
    severity: cellText(values, at.severity) ?? "",
    direction: cellText(values, at.direction) ?? "",
    month_detected: cellText(values, at.month_detected) ?? "",
    month_evident: cellText(values, at.month_evident),
    lead_time_months: cellNumber(values, at.lead_time_months),
    trigger_signal: cellText(values, at.trigger_signal),
    score_before: cellNumber(values, at.score_before),
    score_after: cellNumber(values, at.score_after),
    status: cellText(values, at.status),
    message: cellText(values, at.message),
  };
}

function buildCatalog(values: string[], at: Record<string, number>): CatalogRow {
  const anchors = cellText(values, at.anchors);
  return {
    signal_id: cellText(values, at.signal_id) ?? "",
    api_signal_id: cellText(values, at.api_signal_id),
    pillar: cellText(values, at.pillar) ?? "",
    pillar_name: cellText(values, at.pillar_name),
    name: cellText(values, at.name),
    unit: cellText(values, at.unit),
    direction: cellText(values, at.direction),
    weight_in_pillar: cellNumber(values, at.weight_in_pillar),
    pillar_weight: cellNumber(values, at.pillar_weight),
    norm: cellText(values, at.norm),
    anchors: anchors === null ? null : (JSON.parse(anchors) as number[][]),
    window: cellText(values, at.window),
    ewma: cellText(values, at.ewma),
    requires: cellText(values, at.requires),
    scores: cellBoolean(values, at.scores),
    available: true,
    format: null,
  };
}

function buildSignal(values: string[], at: Record<string, number>): SignalRow {
  return {
    entity_kind: "company",
    company_id: cellText(values, at.company_id),
    group_id: null,
    month: cellText(values, at.month) ?? "",
    signal_id: cellText(values, at.signal_id) ?? "",
    pillar: cellText(values, at.pillar) ?? "",
    value: cellNumber(values, at.value),
    value_fmt: cellText(values, at.value_fmt),
    u: cellNumber(values, at.u),
    u_smooth: cellNumber(values, at.u_smooth),
    u_ref: cellNumber(values, at.u_ref),
    weight: cellNumber(values, at.weight),
    contribution: cellNumber(values, at.contribution),
    delta_vs_prev: cellNumber(values, at.delta_vs_prev),
    is_available: cellBoolean(values, at.is_available),
    quality_flag: cellText(values, at.quality_flag),
  };
}

export async function loadV2(dir: string): Promise<V2Store> {
  let manifest: V2Manifest;
  const companies: CompanyRow[] = [];
  const groups: GroupRow[] = [];
  const catalog: CatalogRow[] = [];
  const alerts: AlertRow[] = [];
  const scoreByCompany = new Map<string, ScoreRow[]>();
  const scoreByKey = new Map<string, ScoreRow>();
  const groupTimelineByGroup = new Map<string, GroupTimelineRow[]>();
  const groupTimelineByKey = new Map<string, GroupTimelineRow>();
  const driversByKey = new Map<string, DriverRow[]>();
  const narrativeByKey = new Map<string, NarrativeRow>();

  try {
    manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as V2Manifest;
    await Promise.all([
      readTable(dir, "companies.csv", buildCompany, (row) => companies.push(row)),
      readTable(dir, "groups.csv", buildGroup, (row) => groups.push(row)),
      readTable(dir, "signal_catalog.csv", buildCatalog, (row) => catalog.push(row)),
      readTable(dir, "alerts.csv", buildAlert, (row) => alerts.push(row)),
      readTable(dir, "score_timeline.csv", buildScore, (row) => {
        push(scoreByCompany, row.company_id, row);
        scoreByKey.set(key(row.company_id ?? "", row.month), row);
      }),
      readTable(dir, "group_timeline.csv", buildGroupTimeline, (row) => {
        push(groupTimelineByGroup, row.group_id, row);
        groupTimelineByKey.set(key(row.group_id, row.month), row);
      }),
      readTable(dir, "drivers.csv", buildDriver, (row) => {
        push(driversByKey, key(row.company_id ?? "", row.month), row);
      }),
      readTable(dir, "narratives.csv", buildNarrative, (row) => {
        narrativeByKey.set(key(row.company_id ?? "", row.month), row);
      }),
    ]);
  } catch (error) {
    throw new V2UnavailableError(dir, error);
  }

  for (const rows of scoreByCompany.values()) rows.sort((a, b) => a.month.localeCompare(b.month));
  for (const rows of groupTimelineByGroup.values()) {
    rows.sort((a, b) => a.month.localeCompare(b.month));
  }
  for (const rows of driversByKey.values()) rows.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  alerts.sort((a, b) => a.alert_id.localeCompare(b.alert_id));

  const companiesByGroup = new Map<string, CompanyRow[]>();
  for (const company of companies) push(companiesByGroup, company.group_id, company);

  const companyAlertMonths = new Set<string>();
  const groupAlertMonths = new Set<string>();
  for (const alert of alerts) {
    companyAlertMonths.add(key(alert.company_id, alert.month_detected));
    if (alert.group_id !== null) groupAlertMonths.add(key(alert.group_id, alert.month_detected));
  }

  const months =
    manifest.months ?? [...new Set([...scoreByKey.values()].map((row) => row.month))].sort();

  let signalsIndex: Promise<Map<string, SignalRow[]>> | null = null;

  return {
    dir,
    manifest,
    months,
    companies,
    companiesById: new Map(companies.map((company) => [company.company_id, company])),
    companiesByGroup,
    groups,
    groupsById: new Map(groups.map((group) => [group.group_id, group])),
    catalog,
    scoreByCompany,
    scoreAt: (companyId, month) => scoreByKey.get(key(companyId, month)) ?? null,
    groupTimelineByGroup,
    groupScoreAt: (groupId, month) => groupTimelineByKey.get(key(groupId, month)) ?? null,
    driversAt: async (companyId, month) => driversByKey.get(key(companyId, month)) ?? [],
    narrativeAt: async (companyId, month) => narrativeByKey.get(key(companyId, month)) ?? null,
    alerts,
    hasCompanyAlert: (companyId, month) => companyAlertMonths.has(key(companyId, month)),
    hasGroupAlert: (groupId, month) => groupAlertMonths.has(key(groupId, month)),
    async signalsFor(companyId: string): Promise<SignalRow[]> {
      if (signalsIndex === null) {
        signalsIndex = (async () => {
          const byCompany = new Map<string, SignalRow[]>();
          await readTable(dir, "signals.csv", buildSignal, (row) => {
            push(byCompany, row.company_id ?? "", row);
          });
          return byCompany;
        })();
      }
      return (await signalsIndex).get(companyId) ?? [];
    },
    async readFrame(month: string): Promise<unknown | null> {
      try {
        return JSON.parse(await readFile(path.join(dir, "frames", `${month}.json`), "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}

/** Acceso perezoso y memoizado al store; `null` cuando el directorio no es un mock. */
export function createV2Loader(dir: string): () => Promise<V2Store | null> {
  let store: V2Store | null = null;
  let tried = false;
  return async () => {
    if (store) return store;
    if (tried) return null;
    try {
      store = await loadV2(dir);
      return store;
    } catch (error) {
      if (error instanceof V2UnavailableError) {
        tried = true;
        return null;
      }
      throw error;
    }
  };
}
