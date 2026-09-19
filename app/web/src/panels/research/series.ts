/**
 * Aritmética del panel Investigación, sin React: el rango visible, la variación en
 * ese rango (en puntos para score y pilares, en % para señales), la serie de un pilar
 * en la escala del score, los cinco drivers que más pesan y la proyección de un grupo.
 */

import type { LineForecast, LinePoint } from "@/charts";
import type { Driver, GroupV2, Pillar, Pillars } from "@/lib/api-v2";
import { relativeChange } from "@/lib/format";
import { addMonths } from "@/panels/research/forecast";

/** Rango como texto; `points` es el número de meses visibles, `null` = todos. */
export const RANGES = [
  { label: "3M", points: 4 },
  { label: "6M", points: 7 },
  { label: "1A", points: 13 },
  { label: "Máx", points: null },
] as const;

export type RangeLabel = (typeof RANGES)[number]["label"];

/** Meses proyectados tras `as_of`; `outlook_6m` cae en el último. */
const HORIZON = 6;
/** Señales que caben en «Señales»: las cinco que más mueven el score. */
const TOP_DRIVERS = 5;

/** Los últimos meses de `rows` que entran en el rango; `Máx` los devuelve todos. */
export function visibleSlice<T extends { month: string }>(
  rows: readonly T[],
  range: RangeLabel,
): T[] {
  const points = RANGES.find((option) => option.label === range)?.points ?? null;
  return points === null ? [...rows] : rows.slice(-points);
}

/**
 * Puntos ganados entre el primer mes visible y el mes activo; si el mes activo no
 * está en el rango (o es `null`) manda el corte. Con menos de dos puntos no hay Δ.
 */
export function rangeDelta(
  visible: readonly { month: string; score: number | null }[],
  activeMonth: string | null,
): number | null {
  if (visible.length < 2) return null;
  const first = visible[0];
  const end = visible.find((row) => row.month === activeMonth) ?? visible[visible.length - 1];
  if (first.score === null || end.score === null) return null;
  return end.score - first.score;
}

/** Variación en % entre dos valores; `null` sin base comparable (0 o ausente). */
export function rangeChangePct(
  first: number | null | undefined,
  last: number | null | undefined,
): number | null {
  if (last == null) return null;
  return relativeChange(last, first);
}

/** Serie `100·P_k` del pilar, en la escala del score; los meses sin valor se omiten. */
export function pillarSeries(
  timeline: readonly { month: string; pillars: Pillars | null }[],
  pillar: Pillar,
): LinePoint[] {
  const points: LinePoint[] = [];
  for (const row of timeline) {
    if (row.pillars === null) continue;
    const value = row.pillars[pillar].value;
    if (value !== null) points.push({ month: row.month, value: value * 100 });
  }
  return points;
}

/** Los cinco drivers de mayor |contribución|, de mayor a menor. */
export function topDrivers(drivers: readonly Driver[]): Driver[] {
  return [...drivers]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, TOP_DRIVERS);
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Proyección del score consolidado: el grupo solo publica `outlook_6m` y su banda,
 * así que el centro va en línea recta del score al +6 (el +3 queda interpolado).
 */
export function groupForecast(group: GroupV2): LineForecast {
  if (
    group.score === null ||
    group.outlook_6m === null ||
    group.outlook_low === null ||
    group.outlook_high === null
  ) {
    return { from: group.as_of, points: [], low: [], high: [] };
  }
  const score = group.score;
  const outlook6 = group.outlook_6m;
  const low = group.outlook_low;
  const high = group.outlook_high;
  const steps = Array.from({ length: HORIZON + 1 }, (_, index) => index);
  return {
    from: group.as_of,
    points: steps.map((n) => ({
      month: addMonths(group.as_of, n),
      value: lerp(score, outlook6, n / HORIZON),
    })),
    low: steps.map((n) => lerp(score, low, n / HORIZON)),
    high: steps.map((n) => lerp(score, high, n / HORIZON)),
  };
}
