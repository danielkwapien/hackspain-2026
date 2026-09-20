/**
 * Aritmética del panel Investigación, sin React: el rango visible, la variación en
 * ese rango (en puntos para score y pilares, en % para señales), la serie de un pilar
 * en la escala del score, los cinco drivers que más pesan y la proyección de un grupo.
 */

import type { LineForecast, LinePoint } from "@/charts";
import type { GroupV2, Pillar, Pillars } from "@/lib/api-v2";
import { relativeChange } from "@/lib/format";
import { addMonths } from "@/panels/research/forecast";

/**
 * Rango como texto; `points` es el número de meses visibles (`null` = todos) y
 * `peaks` cuántas burbujas de valor caben sin que la gráfica se llene de cifras.
 * Con dos meses no hay pico que señalar, y de 1A en adelante tres es el techo:
 * más burbujas y vuelve a ser una tabla.
 */
export const RANGES = [
  { label: "1M", points: 2, peaks: 0 },
  { label: "3M", points: 4, peaks: 1 },
  { label: "6M", points: 7, peaks: 2 },
  { label: "1A", points: 13, peaks: 3 },
  { label: "Total", points: null, peaks: 3 },
] as const;

export type RangeLabel = (typeof RANGES)[number]["label"];

/** Meses proyectados tras `as_of`; `outlook_6m` cae en el último. */
const HORIZON = 6;
/** Señales que caben en «Señales»: las cinco que más mueven el score. */

/** Los últimos meses de `rows` que entran en el rango; `Total` los devuelve todos. */
export function visibleSlice<T extends { month: string }>(
  rows: readonly T[],
  range: RangeLabel,
): T[] {
  const points = RANGES.find((option) => option.label === range)?.points ?? null;
  return points === null ? [...rows] : rows.slice(-points);
}

/** Burbujas de valor que admite el rango; 0 apaga las etiquetas de pico. */
export function peakBudget(range: RangeLabel): number {
  return RANGES.find((option) => option.label === range)?.peaks ?? 0;
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
