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

  it("projects seven points from as_of itself, through h3 at +3 and h6 at +6", () => {
    const forecast = buildForecast("2026-08", 57, outlook);

    expect(forecast.from).toBe("2026-08");
    expect(forecast.points.map((point) => point.month)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(forecast.points[0].value).toBe(57);
    expect(forecast.points[1].value).toBeCloseTo(56);
    expect(forecast.points[3].value).toBeCloseTo(54);
    expect(forecast.points[6].value).toBeCloseTo(51);
  });

  it("starts the band closed on the score and widens linearly to the outlook band", () => {
    const forecast = buildForecast("2026-08", 57, outlook);

    expect(forecast.low).toHaveLength(7);
    expect(forecast.high).toHaveLength(7);
    expect(forecast.low[0]).toBe(57);
    expect(forecast.high[0]).toBe(57);
    expect(forecast.low[3]).toBeCloseTo(49);
    expect(forecast.low[6]).toBeCloseTo(41);
    expect(forecast.high[3]).toBeCloseTo(59);
    expect(forecast.high[6]).toBeCloseTo(61);
  });
});
