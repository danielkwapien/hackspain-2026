/**
 * Cliente tipado de la API v2 (contrato del motor X-Ray, `app/api` — ticket XR-001).
 *
 * Comparte base y errores con el cliente v1 (`@/lib/api`): misma `API_URL`, mismo
 * `ApiError` con `status` y `payload`. Lo unico que cambia es el contrato de datos:
 * aqui la UI recibe score, bandas, regimenes y proyecciones ya calculados.
 *
 * Los tipos siguen `docs/api/v2.md` §3 y `docs/api/examples/*.json`; las fixtures de
 * `@/test/fixtures/v2` tienen esta misma forma y `api-v2.test.ts` las contrasta.
 */

import { API_URL, ApiError } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Dominios cerrados                                                   */
/* ------------------------------------------------------------------ */

/** Banda de score: `solid` es la mejor, `stress` la peor. */
export type Band = "solid" | "healthy" | "watch" | "stress";

/** Regimen del score: como se esta comportando la serie, no su nivel. */
export type Regime =
  | "warmup"
  | "stable"
  | "improving"
  | "deteriorating"
  | "blip"
  | "shock_pending"
  | "recovering";

/** Origen de los datos servidos: `mock` pinta el banner de datos simulados. */
export type DataKind = "mock" | "real";

/** Unidad de analisis del universo: empresa suelta o grupo consolidado. */
export type Unit = "company" | "group";

/** Pilares del score: Liquidez, Pagos, Cobros, Deuda y Actividad. */
export type Pillar = "L" | "P" | "C" | "D" | "A";

/* ------------------------------------------------------------------ */
/* Contrato de datos (contrato `v2`)                                   */
/* ------------------------------------------------------------------ */

/** Fila del universo: el resumen minimo que pinta una tabla o una tarjeta. */
export type UniverseItem = {
  id: string;
  name: string;
  group_id: string;
  /** Nombre del grupo (`groups.csv`); `null` si el grupo no existe. */
  group_name: string | null;
  score: number | null;
  band: Band | null;
  delta_1m: number | null;
  delta_3m: number | null;
  regime: Regime | null;
  /** `null` con `unit=group`: `group_timeline.csv` no publica etiqueta de outlook. */
  outlook_label: string | null;
  confidence: number | null;
  /** Rama de cobertura con la que se puntua (`full`, `no_debt`, `no_invoices`…). */
  branch: string | null;
  /** Operativa de los ultimos 12 meses, en la moneda contable de la empresa. */
  op_in_12m: number | null;
  /** Ultimos 12 meses de score, del mas antiguo al mes de corte. */
  sparkline_12: number[];
  alert: boolean;
};

export type UniverseResponse = {
  items: UniverseItem[];
  total: number;
  as_of: string;
  unit: Unit;
  limit: number;
  offset: number;
  data_kind: DataKind;
};

/**
 * Item de `/universe?unit=group`: la misma fila que una empresa, con `group_id: null`
 * y las cuatro columnas consolidadas de `group_timeline.csv`.
 */
export type GroupUniverseItem = Omit<UniverseItem, "group_id" | "group_name"> & {
  group_id: null;
  group_name: null;
  /** Operativa de 12 meses ya consolidada en EUR (`op_in_12m` mezcla divisas). */
  op_in_12m_eur: number | null;
  n_companies_scored: number | null;
  dispersion: number | null;
  weakest_company: string | null;
};

/** Fila de `companies.csv`: identificacion y cobertura real de la empresa. */
export type CompanyRow = {
  company_id: string;
  name: string;
  group_id: string;
  branch: string | null;
  cash_quality: string | null;
  country: string | null;
  created_at: string;
  currency: string;
  erp: string | null;
  first_activity: string;
  last_activity: string;
  months_hist: number;
  has_debt: boolean;
  has_debt_repayment: boolean;
  has_invoices: boolean;
  has_lineofcredit: boolean;
  n_banking_products: number;
  n_debt_products: number;
  n_invoices: number;
  n_transactions: number;
  op_in_12m: number | null;
};

/** Proyeccion a 3 y 6 meses con su banda de incertidumbre. */
export type Outlook = {
  h3: number | null;
  h6: number | null;
  low: number | null;
  high: number | null;
  label: string | null;
};

/** `P_k` en 0–1 por pilar; sin datos va `value: null` con `weight: 0`, nunca 0. */
export type Pillars = Record<Pillar, { value: number | null; weight: number }>;

export type TimelinePoint = {
  month: string;
  score: number | null;
  band: Band | null;
  regime: Regime | null;
  outlook_low: number | null;
  outlook_high: number | null;
};

/** Señal que mueve el score en el mes de corte, ordenada por `rank`. */
export type Driver = {
  rank: number;
  signal_id: string;
  /** Nombre publicado (catalogo, techo o perspectiva); `null` si el motor no lo trae. */
  name?: string | null;
  /** `penalty` | `pillar` | `modifier` | `override` en el motor real. */
  kind?: string | null;
  message?: string | null;
  pillar: Pillar;
  contribution: number;
  delta_vs_prev: number;
  value: number | null;
  /** Valor ya legible (`"8 dias de colchon de caja"`); `null` si la señal no aplica. */
  value_fmt: string | null;
  direction: "better" | "worse" | "neutral";
};

/** Puntos restados al score (positivos) y el pilar que los provoca. */
export type Penalty = {
  points: number;
  weakest_pillar: Pillar | null;
};

/** Techo aplicado al score, o `null` si no se capo. */
export type Cap = { code: string; value: number } | null;

/** Fila de `alerts.csv`. */
export type AlertRow = {
  alert_id: string;
  company_id: string;
  group_id: string;
  /** Resueltos desde `companies.csv` y `groups.csv`; `null` si no casan. */
  company_name: string | null;
  group_name: string | null;
  event: string;
  severity: "watch" | "review" | "urgent";
  direction: "down" | "up";
  month_detected: string;
  month_evident: string | null;
  lead_time_months: number | null;
  trigger_signal: string;
  score_before: number;
  score_after: number;
  status: string;
  message: string;
};

export type Narrative = {
  headline: string | null;
  body: string | null;
  watch_next: string | null;
  guardrail_passed: boolean | null;
};

/**
 * Perspectiva estrategica del mes (`*_strategic_signals`): valor 0..100 con 50
 * neutro, direccion, confianza y evidencia observable del motor. El ajuste sobre
 * el score solo existe si la perspectiva esta activa y el motor lo trazo.
 */
export type StrategicSignal = {
  name: string;
  /** Nombre publicado por el motor (`metadata.parameters.strategic_modifiers`). */
  label: string | null;
  value: number | null;
  confidence: number | null;
  coverage: number | null;
  direction: string | null;
  modifier_delta: number | null;
  modifier_applied: boolean | null;
  evidence: Record<string, unknown> | null;
};

export type Audit = {
  data_kind: DataKind;
  params_version: string;
  model_version: string;
  data_version: string;
  generator_version: string;
  seed: number;
  generated_at: string;
};

export type SnapshotFactor = {
  score: number | null;
  weight: number;
  effective_weight: number | null;
  metrics: Record<string, number | null>;
  reason: string | null;
};

export type ScoreSnapshot = {
  status: string;
  score: number | null;
  band: Band | null;
  cutoff_date: string;
  model_version: string;
  data_version: string;
  quality: {
    coverage_ratio: number;
    reasons: string[];
    warnings: string[];
    excluded_currency_rows: number;
    invalid_date_rows: number;
  };
  factors: Record<string, SnapshotFactor>;
  drivers: { factor: string; label: string; direction: string; impact: number; message: string }[];
};

export type CompanyV2 = {
  snapshot?: ScoreSnapshot | null;
  company: CompanyRow;
  as_of: string;
  /** Punto de partida del motor: `score = base + Σ contribution − penalty.points`. */
  base: number | null;
  score: number | null;
  band: Band | null;
  delta_1m: number | null;
  delta_3m: number | null;
  delta_6m: number | null;
  regime: Regime | null;
  confidence: number | null;
  branch: string | null;
  warmup: boolean;
  outlook: Outlook | null;
  pillars: Pillars | null;
  strength_flags: string[];
  /** Operativa de los 12 meses publicados, en su moneda explicita. */
  op_in_12m?: number | null;
  op_in_12m_currency?: string | null;
  /** La misma operativa convertida a EUR con la tabla constante (§3.3). */
  op_in_12m_eur?: number | null;
  /** `null` cuando la fuente no publica perspectivas (mock). */
  strategic_signals?: StrategicSignal[] | null;
  timeline: TimelinePoint[];
  drivers: Driver[];
  penalty: Penalty | null;
  cap: Cap;
  /** Ultima alerta con `month_detected <= as_of`, o `null`. */
  alert: AlertRow | null;
  narrative: Narrative;
  audit: Audit;
};

export type MetaV2 = {
  data_kind: DataKind;
  contract_version: string;
  model_version: string;
  data_version: string;
  params_version: string;
  generator_version: string;
  seed: number;
  limit: number | null;
  generated_at: string;
  cutoff_date: string;
  window: { start: string; end: string };
  months: string[];
  counts: Record<string, number>;
  hashes: { file: string; sha256: string; bytes: number }[];
  notes: string[];
  /** `reference` del manifest; `null` si el dataset servido no lo publica. */
  reference: MetaReference | null;
  source?: string;
  capabilities?: { snapshots_only: boolean };
  params: EngineParams | null;
};

/** Referencias congeladas del manifest: bandas, base y `u_ref` por señal. */
export type MetaReference = {
  /** `[desde, hasta)` por banda; `null` en el extremo abierto. */
  bands: Record<Band, [number | null, number | null]>;
  base_median: number;
  pillar_weights: Record<Pillar, number>;
  /** 21 cortes por señal `percentile`. */
  percentile_breakpoints: Record<string, number[]>;
  u_ref: Record<string, number>;
};

/** Parametros del motor (`app/api/src/v2/params.ts`): la UI los enseña, no los aplica. */
export type EngineParams = {
  params_version: string;
  penalty: { lambda: number; tau: number };
  caps: Record<string, number>;
  ewma_alpha: { flow: number; stock: number };
  calibration: { support: [number, number]; mean: number; sd: number };
  outlook: { phi: number; horizons: number[]; z_90: number; gamma: number; sigma_resid: number };
  confidence: {
    f_hist: [number, number][];
    f_quality_low: number;
    unclassified_share_max: number;
  };
};

/* ------------------------------------------------------------------ */
/* Señales, timeline, grupo, catalogo, alertas y treemap (XR-031)      */
/* ------------------------------------------------------------------ */

/** Punto de `series_24m`: `is_available: false` llega con `null` y peso 0, nunca con 0. */
export type SignalPoint = {
  month: string;
  value: number | null;
  value_fmt: string | null;
  u: number | null;
  u_smooth: number | null;
  weight: number;
  /** Puntos de score: `100 · weight · (u_smooth − u_ref)`. */
  contribution: number;
  delta_vs_prev: number;
  is_available: boolean;
};

export type SignalV2 = {
  signal_id: string;
  name: string;
  unit: string;
  value: number | null;
  value_fmt: string | null;
  u: number | null;
  u_smooth: number | null;
  u_ref: number | null;
  weight: number;
  contribution: number;
  delta_vs_prev: number;
  /** `false` = no aplica a la empresa (sin facturas, sin linea de credito…). */
  is_available: boolean;
  quality_flag: string | null;
  series_24m: SignalPoint[];
};

export type PillarSignals = {
  pillar: Pillar;
  pillar_name: string;
  /** Peso renormalizado sobre lo disponible; 0 si ninguna señal aplica. */
  weight: number;
  value: number | null;
  signals: SignalV2[];
};

export type CompanySignals = {
  company_id: string;
  as_of: string;
  pillars: PillarSignals[];
};

/** Fila de `/companies/:id/timeline`: nivel, penalizacion y techo crudos por mes. */
export type TimelineRow = {
  month: string;
  base: number | null;
  score: number | null;
  level: number | null;
  penalty: number | null;
  /** 100 sin techo; con techo, `score = min(level, cap)`. */
  cap: number | null;
  cap_code: string | null;
  band: Band | null;
  regime: Regime | null;
  delta_1m: number | null;
  outlook_3m: number | null;
  outlook_6m: number | null;
  outlook_low: number | null;
  outlook_high: number | null;
  confidence: number | null;
  /** El mismo objeto que en `/companies/:id`, mes a mes. */
  pillars: Pillars | null;
};

/** Fila de `groups.csv`. */
export type GroupRowV2 = {
  group_id: string;
  name: string;
  erp: string | null;
  countries: string[];
  currencies: string[];
  consolidation_currency: string | null;
  has_intercompany: boolean;
  n_companies: number;
  op_in_12m_eur: number | null;
};

export type GroupTimelinePoint = {
  month: string;
  score: number | null;
  band: Band | null;
  regime: Regime | null;
  delta_1m: number | null;
  dispersion: number | null;
  n_companies_scored: number | null;
  outlook_low: number | null;
  outlook_high: number | null;
};

export type GroupV2 = {
  group: GroupRowV2;
  as_of: string;
  score: number | null;
  band: Band | null;
  delta_1m: number | null;
  delta_3m: number | null;
  regime: Regime | null;
  confidence: number | null;
  outlook_6m: number | null;
  outlook_low: number | null;
  outlook_high: number | null;
  n_companies_scored: number;
  dispersion: number | null;
  strongest_company: string | null;
  strongest_score: number | null;
  weakest_company: string | null;
  weakest_score: number | null;
  intragroup_dependency_max: number | null;
  alert: boolean;
  narrative?: Narrative | null;
  strength_flags?: string[];
  op_in_12m?: number | null;
  op_in_12m_currency?: string | null;
  op_in_12m_eur?: number | null;
  strategic_signals?: StrategicSignal[] | null;
  timeline: GroupTimelinePoint[];
  /** Filiales con el resumen de universe, por score descendente. */
  companies: UniverseItem[];
};

/** Fila de `signal_catalog.csv`: `A6` no puntua (`scores: false`). */
export type CatalogSignal = {
  signal_id: string;
  pillar: Pillar;
  pillar_name: string;
  name: string;
  unit: string;
  direction: "higher_better" | "lower_better";
  weight_in_pillar: number;
  pillar_weight: number;
  norm: "anchor" | "percentile";
  anchors: number[][] | null;
  breakpoints: number[] | null;
  window: string;
  ewma: "flow" | "stock";
  requires: string | null;
  scores: boolean;
  u_ref: number | null;
};

export type CatalogSignals = {
  items: CatalogSignal[];
  total: number;
  pillar_weights: Record<Pillar, number>;
};

export type AlertsResponse = {
  items: AlertRow[];
  total: number;
  limit: number;
  offset: number;
};

export type TreemapItem = {
  id: string;
  name: string;
  size: number;
  /** `null` = sin metrica en el corte; nunca se imputa 0. */
  color_value: number | null;
  score: number | null;
  band: Band | null;
};

export type TreemapGroup = {
  key: string;
  label: string;
  /** Suma de `size` de todos los items: el area, no la cobertura. */
  value_sum: number;
  delta: number | null;
  coverage: { items_with_metric: number; items_total: number; size_with_metric: number };
  items: TreemapItem[];
};

export type TreemapResponse = {
  as_of: string;
  group_by: "group" | "country" | "erp";
  metric: "delta_3m" | "delta_1m" | "score";
  /**
   * Magnitud del area. `op_in_12m` sigue siendo el defecto del endpoint y sigue
   * viniendo en la moneda de cada entidad, que no se puede repartir en un mapa;
   * las cuatro ultimas son las que se suman entre empresas. `pending_eur` suma
   * SOLO facturas en euros (39 monedas sin tabla de cambio: mezclarlas seria
   * una cifra falsa) y `op_in_12m_eur` es la operativa 12m ya convertida.
   */
  size_by:
    | "op_in_12m"
    | "op_in_12m_eur"
    | "n_companies"
    | "n_invoices"
    | "n_transactions"
    | "pending_eur";
  delta_source: "group_timeline" | "weighted_mean";
  groups: TreemapGroup[];
};

/* ------------------------------------------------------------------ */
/* Informe de Health (XR-032)                                          */
/* ------------------------------------------------------------------ */

export type RiskLevel = "low" | "medium" | "high";

/**
 * Informe pregenerado (`app/tools/gen_health_reports.py`) que la API sirve tal cual
 * desde `app/api/data/reports/<company_id>.json`; sin fichero, `404 report_not_found`.
 */
export type HealthReport = {
  company_id: string;
  as_of: string;
  generated_at: string;
  model: string;
  risk_level: RiskLevel;
  summary: string;
  sections: { title: string; body: string }[];
  watch_next: string[];
};

/* ------------------------------------------------------------------ */
/* Transporte                                                          */
/* ------------------------------------------------------------------ */

/* `request` y sus ayudantes son privados en `@/lib/api`: se duplican aqui en lugar de tocar el v1. */

type ApiErrorPayload = {
  status?: string;
  message?: string;
  hint?: string;
  error?: string;
  reason?: string;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function readPayload(response: Response): Promise<ApiErrorPayload | null> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object") return payload as ApiErrorPayload;
    return null;
  } catch {
    return null;
  }
}

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { headers: { accept: "application/json" } });
  } catch {
    throw new ApiError(
      0,
      null,
      `No se pudo contactar con la API de datos en ${API_URL}. Comprueba que el servicio está en marcha.`,
    );
  }

  if (!response.ok) {
    const payload = await readPayload(response);
    const cause = payload?.message ?? payload?.error ?? payload?.reason;
    throw new ApiError(
      response.status,
      payload,
      cause ?? `La API respondió ${response.status} en ${path}.`,
    );
  }

  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

export type UniverseQuery = {
  asOf?: string;
  unit?: Unit;
  sort?: "score" | "delta_1m" | "delta_3m";
  order?: "asc" | "desc";
  band?: Band;
  regime?: Regime;
  q?: string;
  groupId?: string;
  limit?: number;
  offset?: number;
};

/** `limit` fuera de 1–500 es un `400` en la API: se recorta antes de pedir. */
const MAX_LIMIT = 500;

function clampLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  return Math.min(MAX_LIMIT, Math.max(1, limit));
}

export function getUniverse(query: UniverseQuery = {}): Promise<UniverseResponse> {
  return request<UniverseResponse>(
    `/api/v2/universe${buildQuery({
      as_of: query.asOf,
      unit: query.unit,
      sort: query.sort,
      order: query.order,
      band: query.band,
      regime: query.regime,
      q: query.q,
      group_id: query.groupId,
      limit: clampLimit(query.limit),
      offset: query.offset,
    })}`,
  );
}

export function getCompanyV2(id: string, asOf?: string): Promise<CompanyV2> {
  return request<CompanyV2>(
    `/api/v2/companies/${encodeURIComponent(id)}${buildQuery({ as_of: asOf })}`,
  );
}

export function getMeta(): Promise<MetaV2> {
  return request<MetaV2>("/api/v2/meta");
}

export function getCompanySignals(id: string, asOf?: string): Promise<CompanySignals> {
  return request<CompanySignals>(
    `/api/v2/companies/${encodeURIComponent(id)}/signals${buildQuery({ as_of: asOf })}`,
  );
}

export function getCompanyTimeline(id: string): Promise<TimelineRow[]> {
  return request<TimelineRow[]>(`/api/v2/companies/${encodeURIComponent(id)}/timeline`);
}

export function getCompanyReport(id: string): Promise<HealthReport> {
  return request<HealthReport>(`/api/v2/companies/${encodeURIComponent(id)}/report`);
}

export function getGroupV2(id: string, asOf?: string): Promise<GroupV2> {
  return request<GroupV2>(
    `/api/v2/groups/${encodeURIComponent(id)}${buildQuery({ as_of: asOf })}`,
  );
}

export function getCatalogSignals(): Promise<CatalogSignals> {
  return request<CatalogSignals>("/api/v2/catalog/signals");
}

export type AlertsQuery = {
  /** Sobre `month_detected`, inclusive. */
  since?: string;
  until?: string;
  severity?: AlertRow["severity"];
  direction?: AlertRow["direction"];
  companyId?: string;
  groupId?: string;
  limit?: number;
  offset?: number;
};

export function getAlerts(query: AlertsQuery = {}): Promise<AlertsResponse> {
  return request<AlertsResponse>(
    `/api/v2/alerts${buildQuery({
      since: query.since,
      until: query.until,
      severity: query.severity,
      direction: query.direction,
      company_id: query.companyId,
      group_id: query.groupId,
      limit: clampLimit(query.limit),
      offset: query.offset,
    })}`,
  );
}

export type TreemapQuery = {
  asOf?: string;
  groupBy?: TreemapResponse["group_by"];
  metric?: TreemapResponse["metric"];
  sizeBy?: TreemapResponse["size_by"];
};

export function getTreemap(query: TreemapQuery = {}): Promise<TreemapResponse> {
  return request<TreemapResponse>(
    `/api/v2/treemap${buildQuery({
      as_of: query.asOf,
      group_by: query.groupBy,
      metric: query.metric,
      size_by: query.sizeBy,
    })}`,
  );
}

export type TemporalCompanyV2 = CompanyV2 & { snapshot?: null };

export function isTemporalCompany(company: CompanyV2): company is TemporalCompanyV2 {
  return company.snapshot == null;
}
