import type { MetaV2 } from "@/lib/api-v2";
import { MONTHS } from "./universe";

/** `/api/v2/meta` sirviendo el dataset simulado: dispara el banner de datos mock. */
export const metaFixture: MetaV2 = {
  data_kind: "mock",
  model_version: "mock-v1",
  generated_at: "2026-09-01T00:00:00+00:00",
  months: MONTHS,
  counts: { companies: 1286, groups: 250 },
};

/** El mismo meta con datos reales: el banner de datos simulados NO debe pintarse. */
export const realMetaFixture: MetaV2 = { ...metaFixture, data_kind: "real" };
