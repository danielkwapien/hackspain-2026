/**
 * Tableros fijos: presets que no viven en el estado ni se persisten. Son
 * objetos únicos para que `useSyncExternalStore` vea un snapshot estable.
 */

import type { Dashboard } from "../types";
import { FIXED_DASHBOARD_IDS } from "../types";
import { EMPRESA } from "./empresa";
import { INVESTIGACION } from "./investigacion";

export { EMPRESA, INVESTIGACION };

export const FIXED_DASHBOARDS: readonly Dashboard[] = [EMPRESA, INVESTIGACION];

export const DEFAULT_DASHBOARD_ID = "empresa";

export function isFixedDashboard(id: string): boolean {
  return (FIXED_DASHBOARD_IDS as readonly string[]).includes(id);
}

export function fixedDashboard(id: string): Dashboard | undefined {
  return FIXED_DASHBOARDS.find((dashboard) => dashboard.id === id);
}
