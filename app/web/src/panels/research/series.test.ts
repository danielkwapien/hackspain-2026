import { describe, expect, it } from "vitest";
import type { GroupV2, TimelineRow } from "@/lib/api-v2";
import {
  RANGES,
  groupForecast,
  peakBudget,
  pillarSeries,
  rangeChangePct,
  rangeDelta,
  visibleSlice,
} from "@/panels/research/series";
import {
  AS_OF,
  groupExample,
  monthsEndingAt,
  timelineExample,
} from "@/test/examples";

/** Los 24 meses del contrato, de `2024-09` a `AS_OF` (`2026-08`). */
const MONTHS = monthsEndingAt(AS_OF, 24);

/**
 * Score de los 24 meses: termina en 57,4. El primer mes visible a 1A es `2025-08`
 * (índice 11): 56,6. A 3M el primer visible es `2026-05` (índice 20): 59,7.
 */
const SCORES = [
  65.2, 64.0, 62.7, 61.5, 60.8, 60.1, 59.6, 59.0, 58.4, 57.9, 57.2, 56.6, 56.0, 55.4, 55.1, 54.8,
  54.3, 60.2, 61.9, 61.0, 59.7, 58.1, 56.3, 57.4,
];

const FIRST_1A = "2025-08";

/** Liquidez baja en `2025-08` (0,305) y vale 0,412 el resto; Actividad no aplica. */
const timeline = MONTHS.map((month, index) => ({
  ...timelineExample[0],
  month,
  score: SCORES[index],
  pillars: {
    L: { value: index === 11 ? 0.305 : 0.412, weight: 0.25 },
    P: { value: 0.552, weight: 0.2 },
    C: { value: 0.832, weight: 0.15 },
    D: { value: 0.722, weight: 0.2 },
    A: { value: null, weight: 0 },
  },
})) as unknown as TimelineRow[];

describe("panels/research/series", () => {
  it("DADO 24 meses CUANDO el rango es 1A ENTONCES hay 13 visibles y rangeDelta = score(as_of) − score(2025-08)", () => {
    expect(RANGES.map((range) => range.label)).toEqual(["1M", "3M", "6M", "1A", "Total"]);

    const visible = visibleSlice(timeline, "1A");
    expect(visible).toHaveLength(13);
    expect(visible[0].month).toBe(FIRST_1A);
    expect(visible.at(-1)?.month).toBe(AS_OF);
    expect(visibleSlice(timeline, "1M")).toHaveLength(2);
    expect(visibleSlice(timeline, "3M")).toHaveLength(4);
    expect(visibleSlice(timeline, "Total")).toHaveLength(24);

    expect(rangeDelta(visible, null)).toBeCloseTo(57.4 - 56.6);
    expect(rangeDelta(visibleSlice(timeline, "3M"), null)).toBeCloseTo(57.4 - 59.7);
  });

  it("DADO activeMonth dentro del rango ENTONCES Δ = score(mes) − score(primer visible); fuera del rango, la del corte", () => {
    const visible = visibleSlice(timeline, "1A");

    // `2026-02` (índice 17) vale 60,2.
    expect(rangeDelta(visible, "2026-02")).toBeCloseTo(60.2 - 56.6);
    expect(rangeDelta(visible, FIRST_1A)).toBeCloseTo(0);
    // Un mes anterior al rango (o inexistente) no cambia nada: manda el corte.
    expect(rangeDelta(visible, "2024-09")).toBeCloseTo(57.4 - 56.6);
    expect(rangeDelta(visible, "1999-01")).toBeCloseTo(57.4 - 56.6);
  });

  it("DADO un solo punto (o ninguno) CUANDO se pide rangeDelta ENTONCES es null", () => {
    expect(rangeDelta(timeline.slice(-1), null)).toBeNull();
    expect(rangeDelta(timeline.slice(-1), AS_OF)).toBeNull();
    expect(rangeDelta([], null)).toBeNull();
  });

  it("DADO pillars por fila CUANDO pillarSeries ENTONCES multiplica por 100 y omite los null", () => {
    const liquidity = pillarSeries(timeline, "L");
    expect(liquidity).toHaveLength(24);
    expect(liquidity[11]).toMatchObject({ month: FIRST_1A });
    expect(liquidity[11].value).toBeCloseTo(30.5);
    expect(liquidity.at(-1)?.month).toBe(AS_OF);
    expect(liquidity.at(-1)?.value).toBeCloseTo(41.2);

    // Actividad no aplica: ningún punto, nunca un 0.
    expect(pillarSeries(timeline, "A")).toEqual([]);
  });

  it("DADO first 0 o null CUANDO rangeChangePct ENTONCES null; 8 → 10 es +25,0 %", () => {
    expect(rangeChangePct(8, 10)).toBeCloseTo(25);
    expect(rangeChangePct(10, 8)).toBeCloseTo(-20);
    expect(rangeChangePct(0, 10)).toBeNull();
    expect(rangeChangePct(null, 10)).toBeNull();
    expect(rangeChangePct(8, null)).toBeNull();
  });

  it("DADO un grupo CUANDO groupForecast ENTONCES siete meses desde as_of, h3 interpolado y banda hacia outlook_low/high", () => {
    const group = {
      ...groupExample,
      as_of: "2026-08",
      score: 69.7,
      outlook_6m: 66.0,
      outlook_low: 56.6,
      outlook_high: 75.4,
    } as unknown as GroupV2;

    const forecast = groupForecast(group);

    expect(forecast.from).toBe("2026-08");
    expect(forecast.points).toHaveLength(7);
    expect(forecast.points[0]).toMatchObject({ month: "2026-08" });
    expect(forecast.points[0].value).toBeCloseTo(69.7);
    expect(forecast.points[3].value).toBeCloseTo((69.7 + 66.0) / 2);
    expect(forecast.points[6]).toMatchObject({ month: "2027-02" });
    expect(forecast.points[6].value).toBeCloseTo(66.0);

    expect(forecast.low[0]).toBeCloseTo(69.7);
    expect(forecast.high[0]).toBeCloseTo(69.7);
    expect(forecast.low[6]).toBeCloseTo(56.6);
    expect(forecast.high[6]).toBeCloseTo(75.4);
  });
});

describe("XR-037 (E10): el presupuesto de burbujas por rango", () => {
  it("sube con los meses visibles y se planta en tres", () => {
    // Con dos meses no hay pico que señalar; de 1A en adelante, tres es el techo.
    expect(RANGES.map((range) => [range.label, range.peaks])).toEqual([
      ["1M", 0],
      ["3M", 1],
      ["6M", 2],
      ["1A", 3],
      ["Total", 3],
    ]);
  });

  it("peakBudget lee la tabla y nunca pide más burbujas que meses visibles", () => {
    expect(peakBudget("1M")).toBe(0);
    expect(peakBudget("6M")).toBe(2);
    expect(peakBudget("Total")).toBe(3);

    for (const range of RANGES) {
      const visible = visibleSlice(timeline, range.label).length;
      expect(peakBudget(range.label), `${range.label} pide más picos que meses`).toBeLessThan(
        visible,
      );
    }
  });
});
