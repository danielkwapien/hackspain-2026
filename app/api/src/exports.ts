import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** `<app>/exports/v1` (funciona igual desde `src/` en dev y desde `dist/` en build). */
export const defaultExportsDir = (): string =>
  path.resolve(moduleDir, "..", "..", "exports", "v1");

/** `<app>/fixtures/v1` (fixtures de demostración, nunca servidos por defecto). */
export const defaultFixturesDir = (): string =>
  path.resolve(moduleDir, "..", "..", "fixtures", "v1");

export const REGENERATE_COMMAND = "cd app/tools && uv run python dataset_inventory.py";

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

export type CompanyListItem = Identification & { coverage: Coverage };

export type GroupRecord = {
  group_id: string;
  erp: string | null;
  n_companies_in_sample: number;
  n_companies_present: number;
  currencies: { code: string; n: number }[];
  countries: { code: string; n: number }[];
  coverage: { months_with_activity_min: number | null; months_with_activity_max: number | null };
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

/** Contrato `app/exports/v1/results/<entity_id>.json` (motor analítico, §3 del contrato). */
export type EngineResult = {
  contract_version?: string;
  entity?: { kind: string; id: string };
  cutoff_date?: string;
  model_version?: string;
  data_version?: string;
  status: string;
  score?: number | null;
  months?: unknown[];
  trajectory?: unknown;
  quality?: unknown;
  alerts?: unknown[];
  forecast?: unknown;
};

const PROCESSABLE_ENGINE_STATUS: Record<string, true> = {
  available: true,
  partial: true,
  insufficient_data: true,
};

export const PENDING_ENGINE = {
  status: "pending_engine",
  score: null,
  months: [],
  trajectory: null,
  alerts: [],
} as const;

export type ExportsStore = {
  dir: string;
  manifest: Manifest;
  groups: GroupRecord[];
  groupsById: Map<string, GroupRecord>;
  companies: CompanyListItem[];
  companiesById: Map<string, CompanyListItem>;
  companiesByGroup: Map<string, CompanyListItem[]>;
  readCompanyDetail: (companyId: string) => Promise<CompanyDetail | null>;
  readEngineResult: (companyId: string) => Promise<EngineResult | null>;
};

export class ExportsUnavailableError extends Error {
  readonly dir: string;
  readonly hint = REGENERATE_COMMAND;

  constructor(dir: string, cause?: unknown) {
    super(`No se pudo cargar el inventario de exports en ${dir}`);
    this.name = "ExportsUnavailableError";
    this.dir = dir;
    this.cause = cause;
  }
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function readJsonIfExists<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadExports(dir: string): Promise<ExportsStore> {
  let manifest: Manifest;
  let groups: GroupRecord[];
  let companies: CompanyListItem[];
  try {
    [manifest, groups, companies] = await Promise.all([
      readJson<Manifest>(path.join(dir, "manifest.json")),
      readJson<GroupRecord[]>(path.join(dir, "groups.json")),
      readJson<CompanyListItem[]>(path.join(dir, "companies.json")),
    ]);
  } catch (error) {
    throw new ExportsUnavailableError(dir, error);
  }

  const detailCache = new Map<string, CompanyDetail>();
  const companiesByGroup = new Map<string, CompanyListItem[]>();
  for (const company of companies) {
    const bucket = companiesByGroup.get(company.group_id);
    if (bucket) bucket.push(company);
    else companiesByGroup.set(company.group_id, [company]);
  }

  return {
    dir,
    manifest,
    groups,
    groupsById: new Map(groups.map((group) => [group.group_id, group])),
    companies,
    companiesById: new Map(companies.map((company) => [company.company_id, company])),
    companiesByGroup,
    async readCompanyDetail(companyId: string): Promise<CompanyDetail | null> {
      const cached = detailCache.get(companyId);
      if (cached) return cached;
      const detail = await readJsonIfExists<CompanyDetail>(
        path.join(dir, "companies", `${companyId}.json`),
      );
      if (detail) detailCache.set(companyId, detail);
      return detail;
    },
    async readEngineResult(companyId: string): Promise<EngineResult | null> {
      const result = await readJsonIfExists<EngineResult>(
        path.join(dir, "results", `${companyId}.json`),
      );
      if (!result || !PROCESSABLE_ENGINE_STATUS[result.status]) return null;
      return result;
    },
  };
}

export function exportsHealth(store: ExportsStore | null): {
  status: "ok" | "no_exports";
  contract_version?: string;
  dataset_version?: string;
  cutoff_date?: string;
  generated_at?: string;
  engine: "pending";
} {
  if (!store) return { status: "no_exports", engine: "pending" };
  return {
    status: "ok",
    contract_version: store.manifest.contract_version,
    dataset_version: store.manifest.dataset_version,
    cutoff_date: store.manifest.cutoff_date,
    generated_at: store.manifest.generated_at,
    engine: "pending",
  };
}
