import { describe, expect, it } from "vitest";
import { AXIS_HEIGHT, HISTORY_SHARE, axisTicks, buildTimeScale } from "@/charts/time-scale";
import { monthsEndingAt } from "@/test/examples";

/** 24 meses de historia que acaban en el corte, como la timeline de la API. */
const AS_OF = "2026-08";
const HISTORY = monthsEndingAt(AS_OF, 24);
/** Horizonte de outlook: el corte y seis meses más (+1 … +6). */
const FORECAST = monthsEndingAt("2027-02", 7);
/** Primer mes visible de cada rango: 3M, 6M, 1A y Máx. */
const WINDOWS = [4, 7, 13, 24] as const;

function fromFor(points: number): string {
  return HISTORY[HISTORY.length - points];
}

describe("charts/time-scale", () => {
  it("DADO forecast CUANDO la ventana es de 4, 7, 13 o 24 meses ENTONCES as_of cae en x=468 y el horizonte acaba en 600", () => {
    expect(HISTORY_SHARE).toBe(0.78);
    expect(AXIS_HEIGHT).toBe(16);

    for (const points of WINDOWS) {
      const scale = buildTimeScale({ history: HISTORY, forecast: FORECAST, from: fromFor(points) });

      // El presente siempre en el mismo sitio: 78 % del ancho, con hueco para la predicción.
      expect(scale.present).toBe(AS_OF);
      expect(scale.x(AS_OF), `ventana ${points}`).toBeCloseTo(468, 6);
      expect(scale.pct(AS_OF), `ventana ${points}`).toBeCloseTo(78, 6);

      // La ventana arranca en 0 y el eje completo sigue siendo toda la historia + horizonte.
      expect(scale.from).toBe(fromFor(points));
      expect(scale.x(fromFor(points))).toBe(0);
      expect(scale.visible).toEqual(HISTORY.slice(-points));
      expect(scale.axis).toEqual([...HISTORY, ...FORECAST.slice(1)]);

      // El horizonte reparte el 22 % restante: +6 llega al borde derecho.
      expect(scale.x(FORECAST.at(-1)!)).toBeCloseTo(600, 6);
      expect(scale.x(FORECAST[3])).toBeCloseTo(600 * (0.78 + 0.22 * (3 / 6)), 6);
    }

    // Sin `from`, la ventana es toda la historia.
    const whole = buildTimeScale({ history: HISTORY, forecast: FORECAST });
    expect(whole.visible).toEqual(HISTORY);
    expect(whole.x(AS_OF)).toBeCloseTo(468, 6);
  });

  it("DADO sin forecast CUANDO se escala ENTONCES el último mes va en 600 y los anteriores a from en 0", () => {
    const scale = buildTimeScale({ history: HISTORY, from: fromFor(13) });

    expect(scale.present).toBe(AS_OF);
    expect(scale.x(AS_OF)).toBeCloseTo(600, 6);
    expect(scale.pct(AS_OF)).toBeCloseTo(100, 6);
    expect(scale.visible).toHaveLength(13);
    expect(scale.axis).toEqual(HISTORY);

    // Los meses ocultos colapsan al borde izquierdo: comandos degenerados, invisibles.
    for (const month of HISTORY.slice(0, 11)) {
      expect(scale.x(month), month).toBe(0);
      expect(scale.pct(month), month).toBe(0);
    }
    expect(scale.x(fromFor(13))).toBe(0);
    // Y los visibles se reparten a partes iguales: el segundo visible a 1/12 del ancho.
    expect(scale.x(HISTORY[12])).toBeCloseTo(600 / 12, 6);

    // El puntero solo puede caer en meses visibles, nunca en los ocultos ni en el horizonte.
    expect(scale.nearest(0)).toBe(fromFor(13));
    expect(scale.nearest(1)).toBe(AS_OF);
    expect(scale.nearest(-0.5)).toBe(fromFor(13));
    expect(scale.nearest(1.5)).toBe(AS_OF);

    const withForecast = buildTimeScale({ history: HISTORY, forecast: FORECAST, from: fromFor(4) });
    expect(withForecast.nearest(1)).toBe(AS_OF);
    expect(withForecast.nearest(0.78)).toBe(AS_OF);
    expect(withForecast.nearest(0)).toBe(fromFor(4));
  });

  it("DADO ventanas de 4, 7, 13 y 24 CUANDO se piden los ticks ENTONCES salen 4, 7, 5 y 4 más 2 en muted con forecast", () => {
    const expected: Record<number, number> = { 4: 4, 7: 7, 13: 5, 24: 4 };

    for (const points of WINDOWS) {
      const scale = buildTimeScale({ history: HISTORY, from: fromFor(points) });
      const ticks = axisTicks(scale);
      expect(ticks.map((tick) => tick.month), `ventana ${points}`).toHaveLength(expected[points]);
      // Contados desde el último mes: as_of siempre lleva etiqueta.
      expect(ticks.at(-1)?.month).toBe(AS_OF);
      expect(ticks.every((tick) => !tick.muted)).toBe(true);
      // Solo meses visibles, en orden.
      expect(ticks.map((tick) => tick.month)).toEqual(
        scale.visible.filter((month) => ticks.some((tick) => tick.month === month)),
      );
    }

    // ≤ 7 → todos los meses visibles.
    const quarter = axisTicks(buildTimeScale({ history: HISTORY, from: fromFor(4) }));
    expect(quarter.map((tick) => tick.month)).toEqual(HISTORY.slice(-4));

    // ≤ 13 → cada 3.º desde el final; > 13 → cada 6.º desde el final.
    const year = axisTicks(buildTimeScale({ history: HISTORY, from: fromFor(13) }));
    expect(year.map((tick) => tick.month)).toEqual([
      HISTORY[11],
      HISTORY[14],
      HISTORY[17],
      HISTORY[20],
      HISTORY[23],
    ]);
    const whole = axisTicks(buildTimeScale({ history: HISTORY, from: fromFor(24) }));
    expect(whole.map((tick) => tick.month)).toEqual([
      HISTORY[5],
      HISTORY[11],
      HISTORY[17],
      HISTORY[23],
    ]);

    // Con forecast, +3 y +6 se añaden atenuados al final.
    const withForecast = axisTicks(
      buildTimeScale({ history: HISTORY, forecast: FORECAST, from: fromFor(13) }),
    );
    expect(withForecast).toHaveLength(5 + 2);
    const muted = withForecast.filter((tick) => tick.muted);
    expect(muted.map((tick) => tick.month)).toEqual([FORECAST[3], FORECAST[6]]);
    expect(withForecast.slice(-2)).toEqual(muted);
  });
});
