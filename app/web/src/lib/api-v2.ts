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
  score: number;
  band: Band;
  delta_1m: number;
  delta_3m: number;
  regime: Regime;
  /** `null` con `unit=group`: `group_timeline.csv` no publica etiqueta de outlook. */
  outlook_label: string | null;
  confidence: number;
  /** Rama de cobertura con la que se puntua (`full`, `no_debt`, `no_invoices`…). */
  branch: string;
  /** Operativa de los ultimos 12 meses, en la moneda contable de la empresa. */
  op_in_12m: number;
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

/** Fila de `companies.csv`: identificacion y cobertura real de la empresa. */
export type CompanyRow = {
  company_id: string;
  name: string;
  group_id: string;
  branch: string;
  cash_quality: string;
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
  op_in_12m: number;
};

/** Proyeccion a 3 y 6 meses con su banda de incertidumbre. */
export type Outlook = {
  h3: number;
  h6: number;
  low: number;
  high: number;
  label: string;
};

export type Pillars = Record<Pillar, { value: number; weight: number }>;

export type TimelinePoint = {
  month: string;
  score: number;
  band: Band;
  regime: Regime;
  outlook_low: number;
  outlook_high: number;
};

/** Señal que mueve el score en el mes de corte, ordenada por `rank`. */
export type Driver = {
  rank: number;
  signal_id: string;
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
  headline: string;
  body: string;
  watch_next: string;
  guardrail_passed: boolean;
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

export type CompanyV2 = {
  company: CompanyRow;
  as_of: string;
  score: number;
  band: Band;
  delta_1m: number;
  delta_3m: number;
  delta_6m: number;
  regime: Regime;
  confidence: number;
  branch: string;
  warmup: boolean;
  outlook: Outlook;
  pillars: Pillars;
  strength_flags: string[];
  timeline: TimelinePoint[];
  drivers: Driver[];
  penalty: Penalty;
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
