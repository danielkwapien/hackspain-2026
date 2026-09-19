import { describe, expect, it } from "vitest";
import { PORTFOLIO } from "@/dashboard/watchlist";
import { bandCounts, totalInvested, weightedScore } from "@/widgets/portfolio/portfolio-math";

describe("portfolio-math", () => {
  it("DADO posiciones con score CUANDO weightedScore ENTONCES pondera por importe, ignora las que aún no tienen score y devuelve null sin filas", () => {
    expect(
      weightedScore([
        { amount: 100, score: 80 },
        { amount: 300, score: 40 },
      ]),
    ).toBe(50);

    // Una ficha cargando (score null) no pesa: el promedio es de lo cargado.
    expect(
      weightedScore([
        { amount: 100, score: 80 },
        { amount: 900, score: null },
      ]),
    ).toBe(80);

    expect(weightedScore([])).toBeNull();
    expect(weightedScore([{ amount: 500, score: null }])).toBeNull();
  });

  it("DADO bandas CUANDO bandCounts ENTONCES cuenta las cuatro bandas, con cero donde no hay", () => {
    expect(
      bandCounts([{ band: "solid" }, { band: "watch" }, { band: "watch" }, { band: "stress" }]),
    ).toEqual({ solid: 1, healthy: 0, watch: 2, stress: 1 });

    expect(bandCounts([])).toEqual({ solid: 0, healthy: 0, watch: 0, stress: 0 });
  });

  it("DADO la cartera CUANDO totalInvested ENTONCES suma los importes (3,64 M) y 0 sin posiciones", () => {
    expect(totalInvested(PORTFOLIO)).toBe(3_640_000);
    expect(totalInvested([{ id: "COMP_0001", amount: 1_000 }, { id: "COMP_0002", amount: 250 }])).toBe(
      1_250,
    );
    expect(totalInvested([])).toBe(0);
  });
});
