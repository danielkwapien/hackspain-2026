import { describe, expect, it } from "vitest";
import { isGroupId, kindOf } from "@/lib/entity";

describe("lib/entity", () => {
  it("DADO un id GROUP_ CUANDO kindOf ENTONCES «group»; con COMP_ «company»", () => {
    expect(kindOf("GROUP_0147")).toBe("group");
    expect(kindOf("GROUP_0001")).toBe("group");
    expect(kindOf("COMP_0004")).toBe("company");
    // Cualquier otro id se trata como empresa: el prefijo de grupo es el único especial.
    expect(kindOf("X_0001")).toBe("company");
  });

  it("DADO isGroupId CUANDO se le pasan ids de grupo y de empresa ENTONCES distingue solo el prefijo GROUP_", () => {
    expect(isGroupId("GROUP_0288")).toBe(true);
    expect(isGroupId("COMP_0288")).toBe(false);
    expect(isGroupId("group_0288")).toBe(false);
    expect(isGroupId("")).toBe(false);
  });
});
