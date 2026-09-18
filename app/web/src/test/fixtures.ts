import type {
  CompanyDetail,
  CompanyListItem,
  Manifest,
  MonitorResponse,
} from "@/lib/api";

export const manifestFixture: Manifest = {
  contract_version: "dashboard-v1",
  dataset_version: "embat-v2",
  cutoff_date: "2026-09-01",
  window: { start: "2024-09-01", end: "2026-09-01" },
  generated_at: "2026-09-18T20:45:00+00:00",
  source: { data_dir: "/datos/embat-v2/output", files: [] },
  counts: { n_groups: 250, n_companies: 1286 },
  quality_notes: ["El corte 2026-09 es un mes parcial: contiene solo datos del día 2026-09-01."],
};

export const company1: CompanyListItem = {
  company_id: "COMP_0001",
  group_id: "GROUP_0147",
  country: null,
  currency: "EUR",
  erp: "sage200",
  created_at: "2026-03-11T12:20:06",
  coverage: {
    months_with_activity: 9,
    periods_total: 25,
    first_activity: "2026-01-14",
    last_activity: "2026-09-01",
    counts: {
      banking_products: 2,
      debt_products: 0,
      invoices: 633,
      transactions: 203,
      transactions_pending: 0,
    },
    snapshot: {
      dates: ["2026-09-01"],
      balance_total_by_currency: [{ currency: "EUR", total: 32477.26 }],
      n_products_with_balance: 2,
    },
    currencies: [{ code: "EUR", n_tx: 203 }],
  },
  engine: { status: "pending_engine", score: null, trajectory: null },
};

export const company2: CompanyListItem = {
  ...company1,
  company_id: "COMP_0002",
  group_id: "GROUP_0147",
  country: "PT",
  coverage: {
    ...company1.coverage,
    months_with_activity: 8,
    last_activity: "2026-08-28",
    counts: { ...company1.coverage.counts, banking_products: 1, debt_products: 3 },
    currencies: [{ code: "USD", n_tx: 41 }],
    snapshot: {
      dates: ["2026-09-01"],
      balance_total_by_currency: [{ currency: "USD", total: 9120.5 }],
      n_products_with_balance: 1,
    },
  },
};

export const companyListResponse = {
  items: [company1, company2],
  total: 2,
  offset: 0,
  limit: 50,
  engine_status: "pending_engine",
};

export const companyDetailFixture: CompanyDetail = {
  contract_version: "dashboard-v1",
  identification: {
    company_id: company1.company_id,
    group_id: company1.group_id,
    country: company1.country,
    currency: company1.currency,
    erp: company1.erp,
    created_at: company1.created_at,
  },
  coverage: company1.coverage,
  products: {
    banking: [
      {
        product_id: "PRODUCT_03496",
        label: "CHECKING_01",
        type: "checking",
        bank_name: "iberCaja",
        service: "ibercaja",
        currency: "EUR",
        created_at: "2026-03-12T09:31:53",
        has_balance: true,
        balance_date: "2026-09-01",
      },
    ],
    debt: [],
  },
  schedule: { n_with_schedule: 0, n_debt_products: 0, items: [] },
  balances: [
    {
      product_id: "PRODUCT_03496",
      date: "2026-09-01",
      balance: 31795.29,
      available: null,
      liquidity: null,
      countable: null,
    },
  ],
  monthly_activity: [
    {
      month: "2026-07",
      currency: "EUR",
      n_tx: 12,
      inflow: 42100.0,
      outflow: -31000.5,
      net: 11099.5,
      n_tx_pending: 0,
      partial: false,
    },
    {
      month: "2026-08",
      currency: "EUR",
      n_tx: 9,
      inflow: 28000.0,
      outflow: -33500.25,
      net: -5500.25,
      n_tx_pending: 1,
      partial: false,
    },
    {
      month: "2026-09",
      currency: "EUR",
      n_tx: 3,
      inflow: 5200.0,
      outflow: -1800.0,
      net: 3400.0,
      n_tx_pending: 0,
      partial: true,
    },
  ],
  monthly_invoices: {
    direction_note: "Sin separación emitida/recibida verificada.",
    items: [
      {
        month: "2026-08",
        currency: "EUR",
        n: 14,
        n_paid: 9,
        n_overdue: 2,
        n_pending: 3,
        n_cancel: 0,
        pending_amount_sum: 12450.75,
      },
      {
        month: "2026-09",
        currency: "EUR",
        n: 3,
        n_paid: 1,
        n_overdue: 0,
        n_pending: 2,
        n_cancel: 0,
        pending_amount_sum: 3200.0,
      },
    ],
  },
};

export const companyResponseFixture = {
  company: company1,
  detail: companyDetailFixture,
  engine: { status: "pending_engine", score: null, trajectory: null },
};

export const monitorEngineFixture: MonitorResponse = {
  mode: "engine",
  status: "pending_engine",
  alerts: [],
  note: "El motor analítico no publica resultados todavía.",
};

export const monitorDemoFixture = {
  mode: "demo",
  source: "fixture",
  demo: true,
  banner: "DEMO — datos sintéticos de ejemplo; no son resultados del motor ni del dataset",
  generated_at: "2026-09-18T20:45:00+00:00",
  note: "Alertas de ejemplo escritas a mano.",
  alerts: [
    {
      id: "demo-2026-07-COMP_0047",
      company_id: "COMP_0047",
      month: "2026-07",
      kind: "deterioration",
      severity: "high",
      message: "Tres meses consecutivos con salidas por encima de entradas en las cuentas principales.",
      evidence: {
        "Meses consecutivos con neto negativo": "3",
        "Cobertura del saldo sobre salidas medias": "0,4 meses",
      },
    },
  ],
};
