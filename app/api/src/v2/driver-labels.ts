/**
 * Nombres legibles de los drivers y de las perspectivas, tomados de la propia
 * publicacion: la etiqueta del catalogo para las señales del motor, la del techo
 * (`metadata.parameters.caps`) para los drivers `CAP_*` y la de la perspectiva
 * (`metadata.parameters.strategic_modifiers`) para los modificadores. Ninguna
 * correspondencia con los IDs del mock: si la publicacion no trae nombre, se
 * devuelve `null` y la UI decide.
 */

import type { DriverRow, StrategicSignalRow, V2Store } from "./store.js";

function labels(value: unknown): Record<string, { label?: string }> {
  return (value ?? {}) as Record<string, { label?: string }>;
}

export function driverName(store: V2Store, driver: DriverRow): string | null {
  const fromCatalog = store.catalog.find((entry) => entry.signal_id === driver.signal_id)?.name;
  if (fromCatalog) return fromCatalog;
  const parameters = store.manifest.raw_parameters;
  const fromCap = labels(parameters?.caps)[driver.signal_id]?.label;
  if (fromCap) return fromCap;
  return labels(parameters?.strategic_modifiers)[driver.signal_id]?.label ?? null;
}

export function strategicLabel(store: V2Store, signal: StrategicSignalRow): string | null {
  return labels(store.manifest.raw_parameters?.strategic_modifiers)[signal.name]?.label ?? null;
}
