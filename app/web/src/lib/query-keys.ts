/**
 * Claves de React Query del contrato v2, en un solo sitio.
 *
 * Dos widgets que piden la misma cosa comparten cache solo si escriben la misma
 * clave: aqui se fija cada una una vez. `companyKey` y `metaKey` son literalmente las
 * que ya usaban los paneles (`["company-v2", id]`, `["meta"]`) para no invalidar nada.
 */

import type { AlertsQuery, TreemapQuery, UniverseQuery } from "@/lib/api-v2";

export const metaKey = ["meta"] as const;

export const catalogKey = ["catalog-signals"] as const;

export function companyKey(id: string) {
  return ["company-v2", id] as const;
}

export function companySignalsKey(id: string, asOf?: string) {
  return ["company-signals", id, asOf ?? null] as const;
}

export function companyTimelineKey(id: string) {
  return ["company-timeline", id] as const;
}

/** Informe de Health pregenerado: no depende de `as_of`. */
export function reportKey(id: string) {
  return ["company-report", id] as const;
}

export function groupKey(id: string, asOf?: string) {
  return ["group-v2", id, asOf ?? null] as const;
}

/** Identidad de presentacion (nombre, pais, industria): no depende de `as_of`. */
export function entityProfileKey(id: string) {
  return ["entity-profile", id] as const;
}

/** Buscador de empresa (`CompanyPicker`): top 8 por score filtrado por `q`. */
export function pickerKey(q: string) {
  return ["picker", q] as const;
}

export function universeKey(query: UniverseQuery = {}) {
  return ["universe", query] as const;
}

export function alertsKey(query: AlertsQuery = {}) {
  return ["alerts", query] as const;
}

export function treemapKey(query: TreemapQuery = {}) {
  return ["treemap", query] as const;
}
