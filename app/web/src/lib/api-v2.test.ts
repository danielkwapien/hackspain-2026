import { describe, expect, it } from "vitest";
import companyJson from "../../../../docs/api/examples/company.json";
import metaJson from "../../../../docs/api/examples/meta.json";
import universeJson from "../../../../docs/api/examples/universe.json";
import { getUniverse } from "@/lib/api-v2";
import { BAND_CLASS, BAND_LABEL } from "@/lib/regime";
import { companyFixture, metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";

/** Dominio real de `band` según `docs/api/v2.md` §3. */
const BANDS = ["solid", "healthy", "watch", "stress"];

/** Claves que la API envía de verdad: `_truncated` es documentación del ejemplo. */
function contractKeys(example: object): string[] {
  return Object.keys(example).filter((key) => key !== "_truncated");
}

function isObjectOrNull(value: unknown): boolean {
  return value === null || typeof value === "object";
}

describe("contrato v2: cliente, regime y fixtures contra docs/api/examples", () => {
  it("BAND_LABEL and BAND_CLASS have exactly the real bands", () => {
    expect(Object.keys(BAND_LABEL).sort()).toEqual([...BANDS].sort());
    expect(Object.keys(BAND_CLASS).sort()).toEqual([...BANDS].sort());
  });

  it("universe fixture carries every key of universe.json and real bands", () => {
    for (const key of contractKeys(universeJson)) {
      expect(universeFixture, `falta ${key} en universeFixture`).toHaveProperty(key);
    }
    for (const key of contractKeys(universeJson.items[0])) {
      expect(universeFixture.items[0], `falta ${key} en universeFixture.items[0]`).toHaveProperty(
        key,
      );
    }
    for (const item of universeFixture.items) {
      expect(BANDS, `${item.id} lleva la banda ${item.band}`).toContain(item.band);
    }
  });

  it("company fixture carries every key of company.json with the real shapes", () => {
    for (const key of contractKeys(companyJson)) {
      expect(companyFixture, `falta ${key} en companyFixture`).toHaveProperty(key);
    }

    // `company` es la fila de companies.csv, no un item del universo.
    expect(companyFixture.company).not.toHaveProperty("sparkline_12");
    expect(companyFixture).toEqual(
      expect.objectContaining({
        penalty: expect.objectContaining({ points: expect.any(Number) }),
        narrative: expect.objectContaining({ headline: expect.any(String) }),
        audit: expect.objectContaining({ data_kind: "mock" }),
      }),
    );
    expect(companyFixture.drivers[0]).toEqual(
      expect.objectContaining({ value_fmt: expect.any(String) }),
    );
    expect(isObjectOrNull(companyFixture.alert), "alert es una fila de alerts.csv o null").toBe(
      true,
    );
    expect(isObjectOrNull(companyFixture.cap), "cap es {code, value} o null").toBe(true);
  });

  it("meta fixture carries every key of meta.json (cutoff_date, window…)", () => {
    for (const key of contractKeys(metaJson)) {
      expect(metaFixture, `falta ${key} en metaFixture`).toHaveProperty(key);
    }
  });

  it("getUniverse clamps limit to the 500 the API accepts", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/universe", body: universeJson }]);

    await getUniverse({ limit: 2000 });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("limit=500");
    expect(url).not.toContain("limit=2000");
  });
});
