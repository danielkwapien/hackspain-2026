/**
 * Cliente tipado de la API de solo lectura (Fastify, `app/api`).
 *
 * Base: `VITE_API_URL` o, en su defecto, el puerto local de desarrollo.
 * Todas las respuestas se normalizan en el borde: la UI nunca ve sobrecargas
 * de transporte (envoltorios de lista, campos ausentes) y los errores llegan
 * como `ApiError` con `status` y `payload`.
 */

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

/** Comando exacto para regenerar `app/exports/v1` cuando la API responde `no_exports`. */
export const REGENERATE_EXPORTS_COMMAND = "cd app/tools && uv run python dataset_inventory.py";

/* ------------------------------------------------------------------ */
/* Contrato de datos (contrato `dashboard-v1`, exports reales)         */
/* ------------------------------------------------------------------ */

export type FileStat = { name: string; sha256: string; rows: number; bytes: number };

export type Manifest = {
  contract_version: string;
  dataset_version: string;
  cutoff_date: string;
  window: { start: string; end: string };
  generated_at: string;
  source: { data_dir: string; files: FileStat[] };
  counts: Record<string, unknown>;
  quality_notes: string[];
};

export type CurrencyAmount = { currency: string; total: number };

export type Coverage = {
  months_with_activity: number;
  periods_total: number;
  first_activity: string | null;
  last_activity: string | null;
  counts: {
    banking_products: number;
    debt_products: number;
    invoices: number;
    transactions: number;
    transactions_pending: number;
  };
  snapshot: {
    dates: string[];
    balance_total_by_currency: CurrencyAmount[];
    n_products_with_balance: number;
  };
  currencies: { code: string; n_tx: number }[];
};

export type Identification = {
  company_id: string;
  group_id: string;
  country: string | null;
  currency: string;
  erp: string | null;
  created_at: string | null;
};

/** Resumen del motor analítico: siempre `pending_engine` mientras no existan resultados. */
export type EngineSummary = {
  status: string;
  score: number | null;
  trajectory: string | null;
};

export type CompanyListItem = Identification & {
  coverage: Coverage;
  engine?: EngineSummary;
};

export type Group = {
  group_id: string;
  erp: string | null;
  n_companies_in_sample: number;
  n_companies_present: number;
  currencies: { code: string; n: number }[];
  countries: { code: string; n: number }[];
  coverage: {
    months_with_activity_min: number | null;
    months_with_activity_max: number | null;
  };
  snapshot_dates: string[];
};

export type BankingProduct = {
  product_id: string;
  label: string;
  type: string;
  bank_name: string;
  service: string;
  currency: string;
  created_at: string | null;
  has_balance: boolean;
  balance_date: string | null;
};

export type DebtProduct = {
  product_id: string;
  label: string;
  type: string;
  bank_name: string;
  currency: string;
  granted: number | null;
  outstanding: number | null;
  liquidity: number | null;
};

export type ScheduleItem = {
  product_id: string;
  currency: string;
  amortising_frequency: string;
  total_periods: number | null;
  next_payment_date: string | null;
  last_payment_date: string | null;
  annual_interest_rate_or_spread: number | null;
  interest_type: string;
  outstanding_balance: number | null;
};

export type BalanceRow = {
  product_id: string;
  date: string;
  balance: number | null;
  available: number | null;
  liquidity: number | null;
  countable: number | null;
};

export type MonthlyActivity = {
  month: string;
  currency: string;
  n_tx: number;
  inflow: number;
  outflow: number;
  net: number;
  n_tx_pending: number;
  partial: boolean;
};

export type MonthlyInvoiceRow = {
  month: string;
  currency: string;
  n: number;
  n_paid: number;
  n_overdue: number;
  n_pending: number;
  n_cancel: number;
  pending_amount_sum: number | null;
};

export type CompanyDetail = {
  contract_version: string;
  identification: Identification;
  coverage: Coverage;
  products: { banking: BankingProduct[]; debt: DebtProduct[] };
  schedule: { n_with_schedule: number; n_debt_products: number; items: ScheduleItem[] };
  balances: BalanceRow[];
  monthly_activity: MonthlyActivity[];
  monthly_invoices: { direction_note: string; items: MonthlyInvoiceRow[] };
};

/** Contribuciones y alertas del contrato del motor: solo se pintan si algún día existen. */
export type EngineAlert = {
  id?: string;
  month?: string;
  kind?: string;
  severity?: string;
  message?: string;
};

export type EngineResult = {
  contract_version?: string;
  status: string;
  score?: number | null;
  months?: { month?: string; score?: number | null }[];
  trajectory?: string | null;
  quality?: { coverage_ratio?: number | null; reasons?: string[]; notes?: string[] } | null;
  alerts?: EngineAlert[];
  forecast?: unknown;
};

export type CompanyResponse = {
  company: CompanyListItem;
  detail: CompanyDetail;
  engine: EngineResult;
};

export type CompanyListResponse = {
  items: CompanyListItem[];
  total: number;
  offset: number;
  limit: number;
  engine_status: string;
};

export type GroupResponse = { group: Group; companies: CompanyListItem[] };

export type Health = {
  status: "ok" | "no_exports";
  contract_version?: string;
  dataset_version?: string;
  cutoff_date?: string;
  generated_at?: string;
  engine: "pending";
};

export type MonitorAlertKind = "improvement" | "deterioration";

export type MonitorAlert = {
  id: string;
  company_id: string;
  month: string;
  kind: MonitorAlertKind | string;
  severity: string;
  message: string;
  evidence: Record<string, string | number>;
};

export type MonitorResponse = {
  mode: "engine" | "demo";
  status?: string;
  note?: string;
  demo?: boolean;
  source?: string;
  banner?: string;
  generated_at?: string;
  alerts: MonitorAlert[];
};

/* ------------------------------------------------------------------ */
/* Errores                                                             */
/* ------------------------------------------------------------------ */

type ApiErrorPayload = {
  status?: string;
  message?: string;
  hint?: string;
  error?: string;
  reason?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload | null;

  constructor(status: number, payload: ApiErrorPayload | null, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }

  get code(): string | null {
    return this.payload?.status ?? null;
  }

  /** La API respondió que no hay exports generados (`503 no_exports`). */
  get isNoExports(): boolean {
    if (this.code) return this.code === "no_exports";
    return this.status === 503;
  }

  /** Falta de red: la API no responde o está apagada. */
  get isUnreachable(): boolean {
    return this.status === 0;
  }

  get hint(): string | null {
    if (this.payload?.hint) return this.payload.hint;
    if (this.isNoExports) return REGENERATE_EXPORTS_COMMAND;
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Transporte                                                          */
/* ------------------------------------------------------------------ */

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

export function getHealth(): Promise<Health> {
  return request<Health>("/health");
}

export function getManifest(): Promise<Manifest> {
  return request<Manifest>("/api/v1/manifest");
}

export async function getGroups(): Promise<Group[]> {
  const payload = await request<{ items: Group[]; total: number }>("/api/v1/groups");
  return payload.items;
}

export function getGroup(groupId: string): Promise<GroupResponse> {
  return request<GroupResponse>(`/api/v1/groups/${encodeURIComponent(groupId)}`);
}

export type CompanyQuery = {
  groupId?: string | null;
  q?: string | null;
  sort?: string | null;
  order?: string | null;
  offset?: number;
  limit?: number;
};

export function getCompanies(query: CompanyQuery = {}): Promise<CompanyListResponse> {
  return request<CompanyListResponse>(
    `/api/v1/companies${buildQuery({
      group_id: query.groupId ?? undefined,
      q: query.q ?? undefined,
      sort: query.sort ?? undefined,
      order: query.order ?? undefined,
      offset: query.offset,
      limit: query.limit,
    })}`,
  );
}

export function getCompany(companyId: string): Promise<CompanyResponse> {
  return request<CompanyResponse>(`/api/v1/companies/${encodeURIComponent(companyId)}`);
}

export function getMonitor(demo = false): Promise<MonitorResponse> {
  return request<MonitorResponse>(`/api/v1/monitor${demo ? "?demo=1" : ""}`);
}
