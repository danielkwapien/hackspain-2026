/**
 * Cliente tipado de la API v2 (contrato del motor X-Ray, `app/api` — ticket XR-001).
 *
 * Comparte base y errores con el cliente v1 (`@/lib/api`): misma `API_URL`, mismo
 * `ApiError` con `status` y `payload`. Lo unico que cambia es el contrato de datos:
 * aqui la UI recibe score, bandas, regimenes y proyecciones ya calculados.
 *
 * Mientras XR-001 no publique los endpoints, los tests consumen las fixtures de
 * `@/test/fixtures/v2`, que siguen esta misma forma.
 */

import { API_URL, ApiError } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Dominios cerrados                                                   */
/* ------------------------------------------------------------------ */

/** Banda de score: `A` es la mejor, `D` la peor. */
export type Band = "A" | "B" | "C" | "D";

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
  outlook_label: string;
  confidence: number;
  /** Ultimos 12 meses de score, del mas antiguo al mes de corte. */
  sparkline_12: number[];
  alert: boolean;
};

export type UniverseResponse = {
  items: UniverseItem[];
  total: number;
  as_of: string;
  data_kind: DataKind;
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

/** Señal que mueve el score en el mes de corte. */
export type Driver = {
  signal_id: string;
  name: string;
  pillar: Pillar;
  contribution: number;
  delta_vs_prev: number;
};

export type CompanyV2 = {
  company: UniverseItem;
  as_of: string;
  score: number;
  band: Band;
  delta_1m: number;
  delta_3m: number;
  delta_6m: number;
  regime: Regime;
  confidence: number;
  branch: string;
  outlook: Outlook;
  pillars: Pillars;
  strength_flags: string[];
  timeline: TimelinePoint[];
  drivers: Driver[];
  penalty: number;
  /** Tope aplicado al score bruto, o `null` si no se capo. */
  cap: number | null;
  alert: boolean;
  narrative: string;
  audit: { model_version: string; generated_at: string; inputs: string[] };
};

export type MetaV2 = {
  data_kind: DataKind;
  model_version: string;
  generated_at: string;
  months: string[];
  counts: Record<string, number>;
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
      limit: query.limit,
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
