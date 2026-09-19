import { describe, expect, it } from "vitest";
import { companyFixture, groupFixture } from "@/test/fixtures/v2";
import { favoriteRow } from "@/widgets/favorites/rows";

describe("favoriteRow", () => {
  it("DADO una ficha de empresa CUANDO favoriteRow ENTONCES fila company con nombre, score, deltas, régimen, banda y los 12 últimos scores", () => {
    const row = favoriteRow("COMP_0001", companyFixture);

    expect(row).toEqual({
      id: "COMP_0001",
      kind: "company",
      name: companyFixture.company.name,
      score: companyFixture.score,
      delta_1m: companyFixture.delta_1m,
      delta_3m: companyFixture.delta_3m,
      regime: companyFixture.regime,
      band: companyFixture.band,
      sparkline: companyFixture.timeline.slice(-12).map((point) => point.score),
    });
    expect(row.sparkline).toHaveLength(12);
  });

  it("DADO un grupo CUANDO favoriteRow ENTONCES fila group con el nombre de groups.csv, el consolidado y la sparkline de su timeline", () => {
    const row = favoriteRow("GROUP_0288", groupFixture);

    expect(row).toEqual({
      id: "GROUP_0288",
      kind: "group",
      name: groupFixture.group.name,
      score: groupFixture.score,
      delta_1m: groupFixture.delta_1m,
      delta_3m: groupFixture.delta_3m,
      regime: groupFixture.regime,
      band: groupFixture.band,
      sparkline: groupFixture.timeline.slice(-12).map((point) => point.score),
    });
    expect(row.name).toBe("Grupo Ribalta");
  });
});
