import { describe, expect, it } from "vitest";
import { kpisAt, signalAt } from "@/panels/research/hover";
import type { SignalV2, TimelineRow } from "@/lib/api-v2";
import { AS_OF, monthsEndingAt, signalsExample, timelineExample } from "@/test/examples";

/** Tres meses con la forma de `/timeline`, confianza distinta en cada uno. */
const SCORES = [61.9, 56.3, 57.4];
const CONFIDENCE = [0.4, 0.7, 1];
const timeline = monthsEndingAt(AS_OF, SCORES.length).map((month, index) => ({
  ...timelineExample[0],
  month,
  score: SCORES[index],
  confidence: CONFIDENCE[index],
})) as unknown as TimelineRow[];

const SIGNAL = signalsExample.pillars[0].signals[0] as unknown as SignalV2;

describe("panels/research/hover", () => {
  it("kpisAt returns delta null on the first month", () => {
    const [first, second, last] = timeline;

    expect(kpisAt(timeline, first.month)).toEqual({
      score: first.score,
      delta: null,
      confidence: first.confidence,
    });

    // A partir del segundo mes el delta sale de la propia serie, no de `delta_1m`.
    expect(kpisAt(timeline, second.month)!.delta).toBeCloseTo(56.3 - 61.9);
    expect(kpisAt(timeline, last.month)).toMatchObject({ score: 57.4, confidence: 1 });
    expect(kpisAt(timeline, last.month)!.delta).toBeCloseTo(1.1);
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
