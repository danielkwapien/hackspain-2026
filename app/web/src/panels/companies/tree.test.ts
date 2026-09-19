import { describe, expect, it } from "vitest";
import { flattenTree, pageSizeFor } from "./tree";
import { groupUniverseFixture, universeFixture } from "@/test/fixtures/v2";

const [ARGA, RIBALTA] = groupUniverseFixture.items;

/** Las filiales de Arga como las publica `/groups/:id`: ya ordenadas por score. */
const argaCompanies = universeFixture.items
  .filter((item) => item.group_id === ARGA.id)
  .sort((a, b) => b.score - a.score);

describe("panels/companies/tree", () => {
  it("flattenTree keeps score order and inserts a loading row under an expanded group without children", () => {
    const rows = flattenTree(
      [ARGA, RIBALTA],
      new Set([ARGA.id, RIBALTA.id]),
      new Map([[ARGA.id, argaCompanies]]),
    );

    expect(rows.map((row) => row.kind)).toEqual([
      "group",
      "company",
      "company",
      "company",
      "company",
      "group",
      "loading",
    ]);
    expect(rows[0]).toMatchObject({ kind: "group", item: ARGA });
    expect(rows.slice(1, 5).map((row) => (row.kind === "company" ? row.item.id : null))).toEqual(
      argaCompanies.map((company) => company.id),
    );
    expect(rows[1]).toMatchObject({ kind: "company", parent: ARGA.id, level: 2 });
    expect(rows[5]).toMatchObject({ kind: "group", item: RIBALTA });
    expect(rows[6]).toEqual({ kind: "loading", parent: RIBALTA.id });

    // Sin nada desplegado, solo los grupos y en el orden recibido.
    expect(flattenTree([ARGA, RIBALTA], new Set(), new Map()).map((row) => row.kind)).toEqual([
      "group",
      "group",
    ]);
  });

  it("pageSizeFor clamps between 10 and 500", () => {
    // jsdom entrega 600 px: 600 / 28 = 21,4 → 21 filas.
    expect(pageSizeFor(600, 28)).toBe(21);
    expect(pageSizeFor(0, 28)).toBe(10);
    expect(pageSizeFor(100, 28)).toBe(10);
    expect(pageSizeFor(100_000, 28)).toBe(500);
  });
});
