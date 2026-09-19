/**
 * Cifras del mes apuntado en la gráfica de Investigación. Aritmética pura, sin React.
 *
 * Al pasar el ratón por la serie la cabecera y las señales dejan de hablar del corte
 * (`as_of`) y hablan del mes apuntado: el score, su delta y su confianza salen de la
 * fila de `/timeline`, y cada señal de su punto de `series_24m`.
 */

import type { SignalPoint, SignalV2, TimelineRow } from "@/lib/api-v2";

export type MonthKpis = {
  score: number;
  /** `score − score del mes anterior` en la propia serie; `null` en el primer mes. */
  delta: number | null;
  confidence: number;
};

/** Cifras de una señal en un mes; `month: null` son las del corte. */
export type SignalFigures = Omit<SignalPoint, "month"> & { month: string | null };

/** KPIs de la cabecera para `month`, o `null` si el mes no está en la serie. */
export function kpisAt(timeline: readonly TimelineRow[], month: string): MonthKpis | null {
  const index = timeline.findIndex((row) => row.month === month);
  if (index < 0) return null;
  const row = timeline[index];
  const previous = index > 0 ? timeline[index - 1] : null;
  return {
    score: row.score,
    delta: previous ? row.score - previous.score : null,
    confidence: row.confidence,
  };
}

/** Punto de `series_24m` del mes, o las cifras del corte si no hay mes o no está. */
export function signalAt(signal: SignalV2, month: string | null): SignalFigures {
  const point = month === null ? undefined : signal.series_24m.find((p) => p.month === month);
  if (point) return point;
  return {
    month: null,
    value: signal.value,
    value_fmt: signal.value_fmt,
    u: signal.u,
    u_smooth: signal.u_smooth,
    weight: signal.weight,
    contribution: signal.contribution,
    delta_vs_prev: signal.delta_vs_prev,
    is_available: signal.is_available,
  };
}
