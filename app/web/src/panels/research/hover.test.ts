import { describe, expect, it } from "vitest";
import { groupKpisAt, kpisAt, signalAt } from "@/panels/research/hover";
import type { GroupTimelinePoint, SignalV2, TimelineRow } from "@/lib/api-v2";
import {
  AS_OF,
  groupExample,
  monthsEndingAt,
  signalsExample,
  timelineExample,
} from "@/test/examples";

/** Tres meses con la forma de `/timeline`, confianza y outlook distintos en cada uno. */
const SCORES = [61.9, 56.3, 57.4];
const CONFIDENCE = [0.4, 0.7, 1];
const OUTLOOK_6M = [60.0, 55.0, 50.8];
const timeline = monthsEndingAt(AS_OF, SCORES.length).map((month, index) => ({
  ...timelineExample[0],
  month,
  score: SCORES[index],
  confidence: CONFIDENCE[index],
  outlook_6m: OUTLOOK_6M[index],
  pillars: {
    L: { value: 0.3 + index * 0.05, weight: 0.25 },
    P: { value: 0.552, weight: 0.2 },
    C: { value: 0.832, weight: 0.15 },
    D: { value: 0.722, weight: 0.2 },
    A: { value: null, weight: 0 },
  },
})) as unknown as TimelineRow[];

const SIGNAL = signalsExample.pillars[0].signals[0] as unknown as SignalV2;

/** Tres meses con la forma de `group.timeline`. */
const GROUP_SCORES = [68.4, 72.7, 69.7];
const DISPERSION = [29.5, 30.5, 39.3];
const SCORED = [8, 11, 12];
const groupTimeline = monthsEndingAt(AS_OF, GROUP_SCORES.length).map((month, index) => ({
  ...groupExample.timeline[0],
  month,
  score: GROUP_SCORES[index],
  delta_1m: index === 0 ? null : GROUP_SCORES[index] - GROUP_SCORES[index - 1],
  dispersion: DISPERSION[index],
  n_companies_scored: SCORED[index],
})) as unknown as GroupTimelinePoint[];

describe("panels/research/hover", () => {
  it("kpisAt returns delta null on the first month", () => {
    const [first, second, last] = timeline;

    expect(kpisAt(timeline, first.month)).toMatchObject({
      score: first.score,
      delta: null,
      confidence: first.confidence,
    });

    // A partir del segundo mes el delta sale de la propia serie, no de `delta_1m`.
    expect(kpisAt(timeline, second.month)!.delta).toBeCloseTo(56.3 - 61.9);
    expect(kpisAt(timeline, last.month)).toMatchObject({ score: 57.4, confidence: 1 });
    expect(kpisAt(timeline, last.month)!.delta).toBeCloseTo(1.1);
  });

  it("DADO una fila con outlook_6m y pillars CUANDO kpisAt ENTONCES devuelve outlook6 y los pilares de ese mes", () => {
    const [first, , last] = timeline;

    const kpis = kpisAt(timeline, first.month);
    expect(kpis).not.toBeNull();
    expect(kpis!.outlook6).toBeCloseTo(60.0);
    const firstPillars = kpis!.pillars;
    expect(firstPillars).not.toBeNull();
    if (!firstPillars) throw new Error("missing pillars");
    expect(firstPillars.L.value).toBeCloseTo(0.3);
    expect(firstPillars.L.weight).toBeCloseTo(0.25);
    expect(firstPillars.A).toEqual({ value: null, weight: 0 });

    expect(kpisAt(timeline, last.month)!.outlook6).toBeCloseTo(50.8);
    const lastPillars = kpisAt(timeline, last.month)?.pillars;
    expect(lastPillars).not.toBeNull();
    if (!lastPillars) throw new Error("missing pillars");
    expect(lastPillars.L.value).toBeCloseTo(0.4);

    expect(kpisAt(timeline, "1999-01")).toBeNull();
  });

  it("DADO group.timeline CUANDO groupKpisAt ENTONCES score, Δ de la serie, dispersión y filiales puntuadas del mes; null si no está", () => {
    const [first, second, last] = groupTimeline;

    expect(groupKpisAt(groupTimeline, first.month)).toMatchObject({
      score: 68.4,
      delta: null,
      dispersion: 29.5,
      nScored: 8,
    });
    expect(groupKpisAt(groupTimeline, second.month)!.delta).toBeCloseTo(72.7 - 68.4);
    expect(groupKpisAt(groupTimeline, last.month)).toMatchObject({
      score: 69.7,
      dispersion: 39.3,
      nScored: 12,
    });
    expect(groupKpisAt(groupTimeline, last.month)!.delta).toBeCloseTo(69.7 - 72.7);

    expect(groupKpisAt(groupTimeline, "1999-01")).toBeNull();
  });

  it("signalAt falls back to the as_of figures when the month is missing", () => {
    const point = SIGNAL.series_24m[0];

    expect(signalAt(SIGNAL, point.month)).toMatchObject({
      month: point.month,
      value: point.value,
      value_fmt: point.value_fmt,
      contribution: point.contribution,
      is_available: point.is_available,
    });

    // Mes fuera de la serie (o sin mes): las cifras actuales de la señal.
    for (const month of ["1999-01", null]) {
      expect(signalAt(SIGNAL, month)).toMatchObject({
        value: SIGNAL.value,
        value_fmt: SIGNAL.value_fmt,
        u_smooth: SIGNAL.u_smooth,
        contribution: SIGNAL.contribution,
        delta_vs_prev: SIGNAL.delta_vs_prev,
        is_available: SIGNAL.is_available,
      });
    }
  });
});
