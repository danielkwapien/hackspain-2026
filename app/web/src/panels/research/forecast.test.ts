import { describe, expect, it } from "vitest";
import { addMonths, buildForecast } from "@/panels/research/forecast";

describe("addMonths", () => {
  it("crosses the year boundary in both directions", () => {
    expect(addMonths("2026-08", 6)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 12)).toBe("2027-12");
  });
});

describe("buildForecast", () => {
  const outlook = { h3: 54, h6: 51, low: 41, high: 61, label: "negative" };

  it("projects six months from as_of, through h3 at +3 and h6 at +6", () => {
    const forecast = buildForecast("2026-08", 57, outlook);

    expect(forecast.from).toBe("2026-08");
    expect(forecast.points.map((point) => point.month)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(forecast.points[0].value).toBeCloseTo(56);
    expect(forecast.points[2].value).toBeCloseTo(54);
    expect(forecast.points[5].value).toBeCloseTo(51);
  });

  it("widens low and high linearly from the score to the outlook band", () => {
    const forecast = buildForecast("2026-08", 57, outlook);

    expect(forecast.low).toHaveLength(6);
    expect(forecast.high).toHaveLength(6);
    expect(forecast.low[2]).toBeCloseTo(49);
    expect(forecast.low[5]).toBeCloseTo(41);
    expect(forecast.high[2]).toBeCloseTo(59);
    expect(forecast.high[5]).toBeCloseTo(61);
  });
});
