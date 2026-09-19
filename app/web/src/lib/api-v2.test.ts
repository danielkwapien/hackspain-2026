import { describe, expect, it } from "vitest";
import companyJson from "../../../../docs/api/examples/company.json";
import metaJson from "../../../../docs/api/examples/meta.json";
import universeJson from "../../../../docs/api/examples/universe.json";
import {
  getAlerts,
  getCatalogSignals,
  getCompanySignals,
  getCompanyTimeline,
  getGroupV2,
  getTreemap,
  getUniverse,
} from "@/lib/api-v2";
import { BAND_CLASS, BAND_LABEL } from "@/lib/regime";
import {
  alertsExample,
  catalogExample,
  groupExample,
  signalsExample,
  timelineExample,
  treemapExample,
} from "@/test/examples";
import {
  UNAVAILABLE_SIGNALS,
  alertsFixture,
  catalogFixture,
  companyFixture,
  companySignalsFixture,
  groupFixture,
  metaFixture,
  treemapFixture,
  universeFixture,
} from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";

/** Claves nuevas de cada punto de `series_24m` (XR-031). */
const SERIES_POINT_KEYS = [
  "month",
  "value",
  "value_fmt",
  "u",
  "u_smooth",
  "weight",
  "contribution",
  "delta_vs_prev",
  "is_available",
];

/** Dominio real de `band` según `docs/api/v2.md` §3. */
const BANDS = ["solid", "healthy", "watch", "stress"];

/** Claves que la API envía de verdad: `_truncated` es documentación del ejemplo. */
function contractKeys(example: object): string[] {
  return Object.keys(example).filter((key) => key !== "_truncated");
}

function isObjectOrNull(value: unknown): boolean {
  return value === null || typeof value === "object";
}

/** `actual` lleva todas las claves que el ejemplo publica (y puede llevar mas). */
function expectKeysOf(example: object, actual: object, label: string) {
  for (const key of contractKeys(example)) {
    expect(actual, `falta ${key} en ${label}`).toHaveProperty(key);
  }
}

/** URL de la llamada `n` al `fetch` simulado. */
function urlOf(fetchMock: ReturnType<typeof mockApi>, call: number): string {
  return String(fetchMock.mock.calls[call]?.[0]);
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

describe("XR-031: señales, grupo, catalogo, alertas, mapa y meta contra docs/api/examples", () => {
  it("signals/group/catalog fixtures carry every key of their example", () => {
    expectKeysOf(signalsExample, companySignalsFixture, "companySignalsFixture");
    const examplePillar = signalsExample.pillars[0];
    const pillar = companySignalsFixture.pillars[0];
    expectKeysOf(examplePillar, pillar, "companySignalsFixture.pillars[0]");
    expectKeysOf(examplePillar.signals[0], pillar.signals[0], "…pillars[0].signals[0]");
    expectKeysOf(
      examplePillar.signals[0].series_24m[0],
      pillar.signals[0].series_24m[0],
      "…signals[0].series_24m[0]",
    );

    // La serie va enriquecida (XR-031): cada punto de la fixture lleva las claves nuevas.
    for (const key of SERIES_POINT_KEYS) {
      expect(pillar.signals[0].series_24m[0], `falta ${key} en la fixture`).toHaveProperty(key);
    }

    // 28 señales con 24 puntos cada una; las no disponibles van vacias y sin peso.
    const signals = companySignalsFixture.pillars.flatMap((entry) => entry.signals);
    expect(signals).toHaveLength(28);
    expect(companySignalsFixture.pillars.map((entry) => entry.pillar)).toEqual([
      "L",
      "P",
      "C",
      "D",
      "A",
    ]);
    for (const signal of signals) {
      expect(signal.series_24m, `${signal.signal_id} no tiene 24 puntos`).toHaveLength(24);
      const available = !UNAVAILABLE_SIGNALS.includes(signal.signal_id);
      expect(signal.is_available, `${signal.signal_id} is_available`).toBe(available);
      if (!available) {
        expect(signal).toMatchObject({ value: null, value_fmt: null, u: null, weight: 0 });
        expect(
          signal.series_24m.every(
            (point) => point.value === null && point.weight === 0 && !point.is_available,
          ),
        ).toBe(true);
      }
    }
    expect(signals.find((signal) => signal.signal_id === "D1")?.is_available).toBe(false);

    expectKeysOf(groupExample, groupFixture, "groupFixture");
    expectKeysOf(groupExample.group, groupFixture.group, "groupFixture.group");
    expectKeysOf(groupExample.timeline[0], groupFixture.timeline[0], "groupFixture.timeline[0]");
    expectKeysOf(groupExample.companies[0], groupFixture.companies[0], "groupFixture.companies[0]");
    expect(groupFixture.companies.length).toBeGreaterThan(1);

    expectKeysOf(catalogExample, catalogFixture, "catalogFixture");
    expectKeysOf(catalogExample.items[0], catalogFixture.items[0], "catalogFixture.items[0]");
    expect(catalogFixture.total).toBe(29);

    // Y el ejemplo publicado (regenerado por la API) lleva la misma serie enriquecida.
    for (const key of SERIES_POINT_KEYS) {
      expect(examplePillar.signals[0].series_24m[0], `falta ${key} en company-signals.json`)
        .toHaveProperty(key);
    }
  });

  it("alerts and treemap fixtures carry every key of their example", () => {
    expectKeysOf(alertsExample, alertsFixture, "alertsFixture");
    expectKeysOf(alertsExample.items[0], alertsFixture.items[0], "alertsFixture.items[0]");

    expectKeysOf(treemapExample, treemapFixture, "treemapFixture");
    expectKeysOf(treemapExample.groups[0], treemapFixture.groups[0], "treemapFixture.groups[0]");
    expectKeysOf(
      treemapExample.groups[0].items[0],
      treemapFixture.groups[0].items[0],
      "treemapFixture.groups[0].items[0]",
    );
    // El contrato no imputa 0: la fixture trae al menos un item sin metrica.
    const items = treemapFixture.groups.flatMap((group) => group.items);
    expect(items.some((item) => item.color_value === null)).toBe(true);
  });

  it("meta fixture carries reference and params", () => {
    expect(metaFixture.reference).not.toBeNull();
    expect(metaFixture.reference?.bands.solid).toEqual([80, null]);
    expect(typeof metaFixture.reference?.base_median).toBe("number");
    expect(metaFixture.reference?.pillar_weights).toEqual({ L: 25, P: 20, C: 15, D: 20, A: 20 });
    expect(Object.keys(metaFixture.reference?.u_ref ?? {})).toHaveLength(28);

    expect(metaFixture.params.penalty).toEqual({ lambda: 0.5, tau: 0.45 });
    expect(metaFixture.params.caps.LOCFULL).toBe(60);
    expect(metaFixture.params.outlook.phi).toBe(0.85);
    expect(metaFixture.params.confidence.f_hist).toHaveLength(4);

    // Y el ejemplo publicado las lleva tambien: `meta.json` regenerado por la API.
    expect(metaJson).toHaveProperty("reference");
    expect(metaJson).toHaveProperty("params");
  });

  it("company fixture carries base", () => {
    expect(typeof companyFixture.base).toBe("number");
    expect(companyJson).toHaveProperty("base");

    // La timeline publica `base` en cada fila, con la misma identidad que la ficha.
    expect(timelineExample[0]).toHaveProperty("base");
  });

  it("getCompanySignals builds /companies/:id/signals with as_of", async () => {
    const fetchMock = mockApi([{ match: "/signals", body: companySignalsFixture }]);

    await getCompanySignals("COMP_0001", "2026-06");
    expect(urlOf(fetchMock, 0)).toContain("/api/v2/companies/COMP_0001/signals?as_of=2026-06");

    await getCompanySignals("COMP_0001");
    expect(urlOf(fetchMock, 1)).toMatch(/\/api\/v2\/companies\/COMP_0001\/signals$/);
  });

  it("getCompanyTimeline builds /companies/:id/timeline", async () => {
    const fetchMock = mockApi([{ match: "/timeline", body: timelineExample }]);

    const rows = await getCompanyTimeline("COMP_0001");
    expect(urlOf(fetchMock, 0)).toMatch(/\/api\/v2\/companies\/COMP_0001\/timeline$/);
    expect(rows).toHaveLength(timelineExample.length);
  });

  it("getGroupV2 builds /groups/:id with as_of", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/groups/", body: groupFixture }]);

    await getGroupV2("GROUP_0288", "2026-06");
    expect(urlOf(fetchMock, 0)).toContain("/api/v2/groups/GROUP_0288?as_of=2026-06");

    await getGroupV2("GROUP_0288");
    expect(urlOf(fetchMock, 1)).toMatch(/\/api\/v2\/groups\/GROUP_0288$/);
  });

  it("getCatalogSignals builds /catalog/signals", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/catalog/signals", body: catalogFixture }]);

    const catalog = await getCatalogSignals();
    expect(urlOf(fetchMock, 0)).toMatch(/\/api\/v2\/catalog\/signals$/);
    expect(catalog.total).toBe(29);
  });

  it("getAlerts builds /alerts with its filters", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/alerts", body: alertsFixture }]);

    await getAlerts({ limit: 50, severity: "review" });
    const url = urlOf(fetchMock, 0);
    expect(url).toContain("/api/v2/alerts?");
    expect(url).toContain("limit=50");
    expect(url).toContain("severity=review");

    await getAlerts();
    expect(urlOf(fetchMock, 1)).toMatch(/\/api\/v2\/alerts$/);
  });

  it("getTreemap builds /treemap with group_by, metric and size_by", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/treemap", body: treemapFixture }]);

    await getTreemap({ groupBy: "group", metric: "delta_1m", sizeBy: "op_in_12m" });
    const url = urlOf(fetchMock, 0);
    expect(url).toContain("/api/v2/treemap?");
    expect(url).toContain("group_by=group");
    expect(url).toContain("metric=delta_1m");
    expect(url).toContain("size_by=op_in_12m");
  });
});
