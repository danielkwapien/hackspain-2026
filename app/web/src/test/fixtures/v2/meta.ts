import type { MetaV2 } from "@/lib/api-v2";
import { AS_OF, MONTHS } from "./universe";

/** `/api/v2/meta` sirviendo el dataset simulado: dispara el banner de datos mock. */
export const metaFixture: MetaV2 = {
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
};

/** El mismo meta con datos reales: el banner de datos simulados NO debe pintarse. */
export const realMetaFixture: MetaV2 = { ...metaFixture, data_kind: "real" };
