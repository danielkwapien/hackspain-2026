import type { EngineParams, MetaReference, MetaV2 } from "@/lib/api-v2";
import { catalogItems, PILLAR_WEIGHTS } from "./catalog";
import { BASE_MEDIAN } from "./company";
import { AS_OF, MONTHS } from "./universe";

/** `reference` del manifest: bandas, base mediana, pesos de pilar y `u_ref` por señal. */
const reference: MetaReference = {
  bands: { solid: [80, null], healthy: [60, 80], watch: [40, 60], stress: [null, 40] },
  base_median: BASE_MEDIAN,
  pillar_weights: PILLAR_WEIGHTS,
  percentile_breakpoints: Object.fromEntries(
    catalogItems
      .filter((entry) => entry.breakpoints !== null)
      .map((entry) => [entry.signal_id, entry.breakpoints as number[]]),
  ),
  u_ref: Object.fromEntries(
    catalogItems.filter((entry) => entry.scores).map((entry) => [entry.signal_id, entry.u_ref as number]),
  ),
};

/** Parametros del motor congelados en `app/api/src/v2/params.ts` (`catalog.py`, `core.py`). */
const params: EngineParams = {
  params_version: "v1",
  penalty: { lambda: 0.5, tau: 0.45 },
  caps: { NEGCASH: 40, SSMISS: 45, DEBTSTOP: 50, LOCFULL: 60 },
  ewma_alpha: { flow: 0.5, stock: 1 },
  calibration: { support: [30, 92], mean: 62, sd: 13 },
  outlook: { phi: 0.85, horizons: [3, 6], z_90: 1.28, gamma: 3, sigma_resid: 3 },
  confidence: {
    f_hist: [
      [0, 0.4],
      [6, 0.7],
      [12, 0.9],
      [18, 1],
    ],
    f_quality_low: 0.8,
    unclassified_share_max: 0.6,
  },
};

/** `/api/v2/meta` sirviendo el dataset simulado: dispara el banner de datos mock. */
export const metaFixture: MetaV2 & { params: EngineParams } = {
  data_kind: "mock",
  contract_version: "dashboard-v1",
  model_version: "mock-v1",
  data_version: "embat-v2",
  params_version: "v1",
  generator_version: "mock-gen-1",
  seed: 42,
  limit: null,
  generated_at: "2026-09-01T00:00:00+00:00",
  cutoff_date: "2026-09-01",
  window: { start: MONTHS[0], end: AS_OF },
  months: MONTHS,
  counts: {
    "alerts.csv": 820,
    "companies.csv": 1286,
    "drivers.csv": 120036,
    "exports/v1/companies": 1286,
    "exports/v1/results": 1536,
    frames: 24,
    "group_timeline.csv": 4307,
    "groups.csv": 250,
    "narratives.csv": 22235,
    "score_timeline.csv": 22235,
    "signal_catalog.csv": 29,
    "signals.csv": 622580,
  },
  hashes: [
    {
      file: "companies.csv",
      sha256: "5496ad00a1e9228f7e756a55c71c512fd06a73ad45a09ce3f103a620a5ad72ae",
      bytes: 70591,
    },
  ],
  notes: [
    "Entidades y cobertura REALES (datasets/); scores, senales y alertas sinteticos (ver datasets_mocked/README.md).",
  ],
  reference,
  params,
};

/** El mismo meta con datos reales: el banner de datos simulados NO debe pintarse. */
export const realMetaFixture: MetaV2 = { ...metaFixture, data_kind: "real" };
