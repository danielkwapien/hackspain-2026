/**
 * Proyección del score para la banda de outlook de `LineNoAxes`.
 *
 * La API publica solo dos horizontes (`h3`, `h6`) y una banda final (`low`, `high`);
 * aquí se convierten en siete meses `as_of … as_of+6` interpolados linealmente: el
 * primero es el propio score (banda de anchura cero, pegada a la línea), el centro
 * pasa por `h3` en el mes +3 y por `h6` en el +6, y `low`/`high` van desde el score
 * hasta la banda del +6. Es aritmética pura, sin React.
 */

import type { LineForecast } from "@/charts";
import type { Outlook } from "@/lib/api-v2";

type ForecastOutlook = Omit<Outlook, "h3" | "h6" | "low" | "high"> & {
  h3: number;
  h6: number;
  low: number;
  high: number;
};

/** Meses proyectados tras `as_of`; `outlook.h6` cae en el último. */
const HORIZON = 6;
/** Mes en el que cae `outlook.h3`. */
const MID = 3;

/** `addMonths("2026-08", 6)` → `"2027-02"`; admite `n` negativo. */
export function addMonths(month: string, n: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + n;
  const y = year + Math.floor(index / 12);
  const m = ((index % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function buildForecast(asOf: string, score: number, outlook: ForecastOutlook): LineForecast {
  // Paso 0 es `as_of`: todas las interpolaciones dan el score y la banda nace cerrada.
  const steps = Array.from({ length: HORIZON + 1 }, (_, index) => index);
  return {
    from: asOf,
    points: steps.map((n) => ({
      month: addMonths(asOf, n),
      value:
        n <= MID
          ? lerp(score, outlook.h3, n / MID)
          : lerp(outlook.h3, outlook.h6, (n - MID) / (HORIZON - MID)),
    })),
    low: steps.map((n) => lerp(score, outlook.low, n / HORIZON)),
    high: steps.map((n) => lerp(score, outlook.high, n / HORIZON)),
  };
}
