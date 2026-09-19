/**
 * Aritmética de la cabecera de Cartera. Pura: recibe posiciones y fichas ya
 * cargadas y devuelve cifras; una ficha que aún no tiene score (`null`) no pesa
 * en el promedio, y sin ninguna cargada el promedio es `null`, nunca 0.
 */

import type { PortfolioPosition } from "@/dashboard/watchlist";
import type { Band } from "@/lib/api-v2";

export type BandCounts = Record<Band, number>;

export function totalInvested(positions: readonly PortfolioPosition[]): number {
  return positions.reduce((sum, position) => sum + position.amount, 0);
}

/** Score medio ponderado por importe sobre las posiciones con score. */
export function weightedScore(
  rows: readonly { amount: number; score: number | null }[],
): number | null {
  let weight = 0;
  let total = 0;
  for (const row of rows) {
    if (row.score === null) continue;
    weight += row.amount;
    total += row.amount * row.score;
  }
  return weight === 0 ? null : total / weight;
}

export function bandCounts(rows: readonly { band: Band | null }[]): BandCounts {
  const counts: BandCounts = { solid: 0, healthy: 0, watch: 0, stress: 0 };
  for (const row of rows) {
    if (row.band !== null) counts[row.band] += 1;
  }
  return counts;
}
