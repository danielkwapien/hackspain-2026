import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
/** Mini-mock committeado: `generate_mock.py --seed 7 --limit 50` (ver docs/api/v2.md). */
const MOCK_FIXTURE = path.join(testDir, "fixtures", "v2", "exports", "v1");
/** Inventario real en miniatura, sin tablas v2: sirve de control negativo. */
const EXPORTS_FIXTURE = path.join(testDir, "fixtures", "exports");

async function withApp<T>(
  run: (app: FastifyInstance) => Promise<T>,
  options: { exportsDir?: string } = {},
): Promise<T> {
  const app = await buildApp({ exportsDir: options.exportsDir ?? MOCK_FIXTURE });
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

describe("universe", () => {
  it("devuelve items paginados ordenados por score desc con sparkline de 12 puntos", async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/v2/universe" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.total).toBe(50);
      expect(body.as_of).toBe("2026-08");
      expect(body.unit).toBe("company");
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
      expect(body.data_kind).toBe("mock");

      const first = body.items[0];
      expect(first.id).toBe("COMP_0009");
      expect(first.name).toBe("Suministros Doriga S.L.U.");
      expect(first.group_id).toBe("GROUP_0225");
      expect(first.score).toBeCloseTo(91.1076528622, 9);
      expect(first.band).toBe("solid");
      expect(first.regime).toBe("stable");
      expect(first.outlook_label).toBe("stable");
      expect(first.branch).toBe("full");
      expect(first.op_in_12m).toBe(36343681.44);
      expect(first.alert).toBe(false);
      expect(first.sparkline_12).toHaveLength(12);
      expect(first.sparkline_12.at(-1)).toBe(first.score);

      const scores = body.items.map((item: { score: number }) => item.score);
      expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));

      // COMP_0040 arranca en 2026-01: menos de 12 meses, sparkline más corta.
      const short = body.items.find((item: { id: string }) => item.id === "COMP_0040");
      expect(short.sparkline_12).toHaveLength(8);

      const page = await app.inject({ method: "GET", url: "/api/v2/universe?limit=2&offset=1" });
      const pageBody = page.json();
      expect(pageBody.total).toBe(50);
      expect(pageBody.limit).toBe(2);
      expect(pageBody.offset).toBe(1);
      expect(pageBody.items.map((item: { id: string }) => item.id)).toEqual([
        "COMP_0046",
        "COMP_0016",
      ]);
    });
  });

  it("filtra por band y por regime y rechaza un sort inválido", async () => {
    await withApp(async (app) => {
      const band = await app.inject({ method: "GET", url: "/api/v2/universe?band=watch" });
      const bandBody = band.json();
      expect(bandBody.total).toBe(13);
      expect(bandBody.items[0].id).toBe("COMP_0050");
      expect(bandBody.items.every((item: { band: string }) => item.band === "watch")).toBe(true);

      const regime = await app.inject({
        method: "GET",
        url: "/api/v2/universe?regime=deteriorating",
      });
      expect(regime.json().items.map((item: { id: string }) => item.id)).toEqual([
        "COMP_0050",
        "COMP_0006",
        "COMP_0038",
        "COMP_0008",
      ]);

      const both = await app.inject({
        method: "GET",
        url: "/api/v2/universe?band=watch&regime=deteriorating",
      });
      expect(both.json().items.map((item: { id: string }) => item.id)).toEqual([
        "COMP_0050",
        "COMP_0006",
      ]);

      const groups = await app.inject({ method: "GET", url: "/api/v2/universe?unit=group&limit=1" });
      const groupsBody = groups.json();
      expect(groupsBody.total).toBe(44);
      expect(groupsBody.items[0].id).toBe("GROUP_0225");
      expect(groupsBody.items[0].weakest_company).toBe("COMP_0039");

      const badSort = await app.inject({ method: "GET", url: "/api/v2/universe?sort=ebitda" });
      expect(badSort.statusCode).toBe(400);
      expect(badSort.json()).toEqual({
        error: "invalid_query",
        message: "sort inválido: ebitda. Válidos: score, delta_1m, delta_3m",
      });

      const badBand = await app.inject({ method: "GET", url: "/api/v2/universe?band=verde" });
      expect(badBand.statusCode).toBe(400);
      expect(badBand.json().message).toContain("solid, healthy, watch, stress");

      const badAsOf = await app.inject({ method: "GET", url: "/api/v2/universe?as_of=2030-01" });
      expect(badAsOf.statusCode).toBe(400);
      expect(badAsOf.json().message).toContain("de 2024-09 a 2026-08");
    });
  });
});

describe("company", () => {
  it("devuelve el vector (score, band, regime, outlook, pillars, drivers, timeline) para as_of", async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/v2/companies/COMP_0004" });
      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.as_of).toBe("2026-08");
      expect(body.company.company_id).toBe("COMP_0004");
      expect(body.company.group_id).toBe("GROUP_0058");
      expect(body.company.branch).toBe("full");
      expect(body.score).toBeCloseTo(30.3626972485, 9);
      expect(body.band).toBe("stress");
      expect(body.regime).toBe("stable");
      expect(body.confidence).toBe(0.7);
      expect(body.warmup).toBe(false);
      expect(body.delta_3m).toBeCloseTo(-15.0791380561, 9);

      expect(body.outlook.label).toBe("negative");
      expect(body.outlook.h3).toBeCloseTo(18.937364369, 9);
      expect(body.outlook.h6).toBeCloseTo(8.9308108795, 9);
      expect(body.outlook.low).toBe(0);

      expect(Object.keys(body.pillars)).toEqual(["L", "P", "C", "D", "A"]);
      expect(body.pillars.L.weight).toBe(0.25);
      expect(body.pillars.C.value).toBeCloseTo(0.225899883859, 9);
      expect(body.strength_flags).toEqual([]);

      expect(body.drivers).toHaveLength(6);
      expect(body.drivers[0]).toEqual({
        rank: 1,
        signal_id: "D3",
        pillar: "D",
        contribution: -2.12049618353,
        delta_vs_prev: -0.0185250781528,
        value: 0.693359919816,
        value_fmt: "servicio de deuda 69 % de los cobros",
        direction: "neutral",
      });
      expect(body.penalty.points).toBeCloseTo(11.2050058071, 9);
      expect(body.penalty.weakest_pillar).toBe("C");
      expect(body.cap).toBeNull();
      expect(body.alert.alert_id).toBe("ALERT_00010");
      expect(body.narrative.headline).toBe("Estable en 30 (en tension)");
      expect(body.narrative.guardrail_passed).toBe(true);
      expect(body.audit).toMatchObject({
        data_kind: "mock",
        model_version: "mock-v1",
        params_version: "v1",
        seed: 7,
      });

      // La sociedad arranca en 2025-12: la timeline no inventa meses anteriores.
      expect(body.timeline).toHaveLength(9);
      expect(body.timeline[0]).toEqual({
        month: "2025-12",
        score: 43.7234454778,
        band: "watch",
        regime: "warmup",
        outlook_low: 34.3174048655,
        outlook_high: 53.1294860901,
      });

      // En 2026-06 la línea de crédito estaba agotada: hay techo.
      const capped = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0004?as_of=2026-06",
      });
      const cappedBody = capped.json();
      expect(cappedBody.as_of).toBe("2026-06");
      expect(cappedBody.score).toBeCloseTo(26.4097870939, 9);
      expect(cappedBody.cap).toEqual({ code: "LOCFULL", value: 60 });
      expect(cappedBody.alert.alert_id).toBe("ALERT_00006");
    });
  });

  it("404 con id desconocido, 400 con id mal formado", async () => {
    await withApp(async (app) => {
      const missing = await app.inject({ method: "GET", url: "/api/v2/companies/COMP_9999" });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({
        error: "company_not_found",
        message: "No existe la sociedad COMP_9999",
      });

      const malformed = await app.inject({ method: "GET", url: "/api/v2/companies/acme" });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json()).toEqual({
        error: "invalid_company_id",
        message: "company_id inválido: acme. Formato esperado COMP_0001",
      });

      const group = await app.inject({ method: "GET", url: "/api/v2/groups/GROUP_9999" });
      expect(group.statusCode).toBe(404);
      expect(group.json().error).toBe("group_not_found");

      const badGroup = await app.inject({ method: "GET", url: "/api/v2/groups/ACME" });
      expect(badGroup.statusCode).toBe(400);
      expect(badGroup.json().error).toBe("invalid_group_id");
    });
  });
});

describe("signals", () => {
  it("agrupa las señales por pilar e incluye la serie de 24 meses", async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0009/signals",
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.company_id).toBe("COMP_0009");
      expect(body.as_of).toBe("2026-08");
      expect(body.pillars.map((pillar: { pillar: string }) => pillar.pillar)).toEqual([
        "L",
        "P",
        "C",
        "D",
        "A",
      ]);

      const liquidity = body.pillars[0];
      expect(liquidity.pillar_name).toBe("Liquidez");
      expect(liquidity.weight).toBeCloseTo(0.263157894737, 9);
      expect(liquidity.value).toBeCloseTo(0.853390559882, 9);
      expect(liquidity.signals.map((signal: { signal_id: string }) => signal.signal_id)).toEqual([
        "L1",
        "L2",
        "L3",
        "L4",
        "L5",
      ]);

      const buffer = liquidity.signals[0];
      expect(buffer.name).toBe("Dias de colchon de caja");
      expect(buffer.unit).toBe("dias");
      expect(buffer.value_fmt).toBe("39 dias de colchon de caja");
      expect(buffer.u).toBeCloseTo(0.706902036402, 9);
      expect(buffer.u_smooth).toBeCloseTo(0.79016428015, 9);
      expect(buffer.contribution).toBeCloseTo(1.42873312094, 9);
      expect(buffer.is_available).toBe(true);
      expect(buffer.series_24m).toHaveLength(24);
      expect(buffer.series_24m[0]).toEqual({ month: "2024-09", value: 58.203879807, u: 0.883671634609 });
      expect(buffer.series_24m.at(-1)).toEqual({
        month: "2026-08",
        value: buffer.value,
        u: buffer.u,
      });

      // COMP_0009 no tiene línea de crédito: D1 no existe en la tabla de señales.
      expect(body.pillars[3].signals.map((signal: { signal_id: string }) => signal.signal_id)).toEqual([
        "D2",
        "D3",
        "D4",
        "D5",
        "D6",
      ]);

      const filtered = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0009/signals?pillar=C&as_of=2025-09",
      });
      const filteredBody = filtered.json();
      expect(filteredBody.as_of).toBe("2025-09");
      expect(filteredBody.pillars).toHaveLength(1);
      expect(filteredBody.pillars[0].pillar).toBe("C");
      expect(filteredBody.pillars[0].signals[0].series_24m).toHaveLength(13);

      const badPillar = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0009/signals?pillar=Z",
      });
      expect(badPillar.statusCode).toBe(400);
      expect(badPillar.json().message).toBe("pillar inválido: Z. Válidos: L, P, C, D, A");
    });
  });
});

describe("timeline", () => {
  it("respeta from/to y devuelve las columnas de la banda de outlook", async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0004/timeline?from=2026-06&to=2026-08",
      });
      expect(response.statusCode).toBe(200);
      const rows = response.json();
      expect(rows.map((row: { month: string }) => row.month)).toEqual([
        "2026-06",
        "2026-07",
        "2026-08",
      ]);
      expect(rows[0]).toEqual({
        month: "2026-06",
        score: 26.4097870939,
        level: 26.4097870939,
        penalty: 9.99785350269,
        cap: 60,
        cap_code: "LOCFULL",
        band: "stress",
        regime: "stable",
        delta_1m: -19.0320482107,
        outlook_3m: 20.3792454711,
        outlook_6m: 18.8048335563,
        outlook_low: 9.398792944,
        outlook_high: 28.2108741686,
        confidence: 0.7,
      });

      const full = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0004/timeline",
      });
      expect(full.json()).toHaveLength(9);

      const badMonth = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0004/timeline?from=junio",
      });
      expect(badMonth.statusCode).toBe(400);
      expect(badMonth.json().message).toBe("from inválido: junio. Formato esperado YYYY-MM");
    });
  });
});

describe("alerts", () => {
  it("filtra por severity y por direction", async () => {
    await withApp(async (app) => {
      const all = await app.inject({ method: "GET", url: "/api/v2/alerts?limit=500" });
      expect(all.json().total).toBe(11);

      const urgent = await app.inject({ method: "GET", url: "/api/v2/alerts?severity=urgent" });
      const urgentBody = urgent.json();
      expect(urgentBody.total).toBe(1);
      expect(urgentBody.items[0]).toMatchObject({
        alert_id: "ALERT_00006",
        company_id: "COMP_0004",
        group_id: "GROUP_0058",
        event: "cap_LOCFULL",
        severity: "urgent",
        direction: "down",
        month_detected: "2026-06",
        trigger_signal: "LOCFULL",
        status: "resolved",
      });
      expect(urgentBody.items[0].message).toContain("linea de credito");

      const up = await app.inject({ method: "GET", url: "/api/v2/alerts?direction=up" });
      expect(up.json().items.map((alert: { alert_id: string }) => alert.alert_id)).toEqual([
        "ALERT_00005",
      ]);

      const down = await app.inject({ method: "GET", url: "/api/v2/alerts?direction=down" });
      expect(down.json().total).toBe(10);

      const window = await app.inject({
        method: "GET",
        url: "/api/v2/alerts?since=2026-07&until=2026-08",
      });
      expect(window.json().items.map((alert: { alert_id: string }) => alert.alert_id)).toEqual([
        "ALERT_00008",
        "ALERT_00009",
        "ALERT_00010",
        "ALERT_00011",
      ]);

      const byCompany = await app.inject({
        method: "GET",
        url: "/api/v2/alerts?company_id=COMP_0004",
      });
      expect(byCompany.json().total).toBe(2);

      const badSeverity = await app.inject({ method: "GET", url: "/api/v2/alerts?severity=alta" });
      expect(badSeverity.statusCode).toBe(400);
      expect(badSeverity.json().message).toBe(
        "severity inválido: alta. Válidos: watch, review, urgent",
      );

      const badDirection = await app.inject({ method: "GET", url: "/api/v2/alerts?direction=left" });
      expect(badDirection.statusCode).toBe(400);
      expect(badDirection.json().message).toContain("Válidos: down, up");
    });
  });
});

describe("treemap", () => {
  it("agrupa por group_id con size y color_value", async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/v2/treemap" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        as_of: "2026-08",
        group_by: "group",
        metric: "delta_3m",
        size_by: "op_in_12m",
      });

      const group = body.groups.find((item: { key: string }) => item.key === "GROUP_0195");
      expect(group.label).toBe("Iranzo Corporacion");
      expect(group.value_sum).toBeCloseTo(530050.23, 6);
      expect(group.delta).toBeCloseTo(-4.7561011826, 8);
      expect(group.items).toEqual([
        {
          id: "COMP_0008",
          name: "Transportes Yuste S.L.U.",
          size: 396885.21,
          color_value: -1.33869400652,
          score: 17.9085394121,
          band: "stress",
        },
        {
          id: "COMP_0006",
          name: "Comercial Carrion S.L.",
          size: 133165.02,
          color_value: -14.9413462625,
          score: 48.6031068147,
          band: "watch",
        },
      ]);

      const byCount = await app.inject({
        method: "GET",
        url: "/api/v2/treemap?size_by=n_companies&metric=score",
      });
      const counted = byCount
        .json()
        .groups.find((item: { key: string }) => item.key === "GROUP_0195");
      expect(counted.value_sum).toBe(2);
      expect(counted.items.map((item: { size: number }) => item.size)).toEqual([1, 1]);
      expect(counted.delta).toBeCloseTo((17.9085394121 + 48.6031068147) / 2, 9);

      const byCountry = await app.inject({ method: "GET", url: "/api/v2/treemap?group_by=country" });
      expect(
        byCountry.json().groups.map((item: { key: string }) => item.key),
      ).toContain("ES");

      const bad = await app.inject({ method: "GET", url: "/api/v2/treemap?group_by=sector" });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().message).toBe("group_by inválido: sector. Válidos: group, country, erp");
    });
  });
});

describe("frames", () => {
  it("lista los meses y sirve un frame", async () => {
    await withApp(async (app) => {
      const list = await app.inject({ method: "GET", url: "/api/v2/frames" });
      expect(list.statusCode).toBe(200);
      const listBody = list.json();
      expect(listBody.months).toHaveLength(24);
      expect(listBody.months[0]).toBe("2024-09");
      expect(listBody.months.at(-1)).toBe("2026-08");
      expect(listBody.frames_url).toBe("/api/v2/frames/{month}");
      expect(listBody.data_kind).toBe("mock");

      const frame = await app.inject({ method: "GET", url: "/api/v2/frames/2026-08" });
      expect(frame.statusCode).toBe(200);
      const frameBody = frame.json();
      expect(frameBody.month).toBe("2026-08");
      expect(frameBody.companies).toHaveLength(50);
      expect(frameBody.groups).toHaveLength(44);
      expect(frameBody.stats.mean_score).toBeCloseTo(58.3066749286, 9);
      expect(frameBody.stats.n_deteriorating).toBe(4);
      expect(
        frameBody.alerts_this_month.map((alert: { alert_id: string }) => alert.alert_id),
      ).toEqual(["ALERT_00010", "ALERT_00011"]);

      const missing = await app.inject({ method: "GET", url: "/api/v2/frames/2020-01" });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error).toBe("frame_not_found");

      const malformed = await app.inject({ method: "GET", url: "/api/v2/frames/agosto" });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json().message).toBe("month inválido: agosto. Formato esperado YYYY-MM");
    });
  });
});

describe("health", () => {
  it("informa engine=mock y data_kind=mock cuando EXPORTS_DIR apunta al mock", async () => {
    await withApp(async (app) => {
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({
        status: "ok",
        contract_version: "dashboard-v1",
        dataset_version: "embat-v2",
        cutoff_date: "2026-09-01",
        generated_at: "2026-09-19T00:00:00+00:00",
        engine: "mock",
        data_kind: "mock",
      });

      const meta = await app.inject({ method: "GET", url: "/api/v2/meta" });
      const metaBody = meta.json();
      expect(metaBody.data_kind).toBe("mock");
      expect(metaBody.model_version).toBe("mock-v1");
      expect(metaBody.data_version).toBe("embat-v2");
      expect(metaBody.params_version).toBe("v1");
      expect(metaBody.generator_version).toBe("mock-gen-1");
      expect(metaBody.seed).toBe(7);
      expect(metaBody.months).toHaveLength(24);
      expect(metaBody.counts["companies.csv"]).toBe(50);
      expect(metaBody.hashes.length).toBeGreaterThan(0);

      const catalog = await app.inject({ method: "GET", url: "/api/v2/catalog/signals" });
      const catalogBody = catalog.json();
      expect(catalogBody.total).toBe(29);
      expect(catalogBody.items[0]).toMatchObject({
        signal_id: "L1",
        pillar: "L",
        name: "Dias de colchon de caja",
        norm: "anchor",
        anchors: [
          [0, 0],
          [10, 0.3],
          [27, 0.6],
          [60, 0.9],
          [120, 1],
        ],
      });
      expect(catalogBody.items[1].breakpoints).toHaveLength(21);
      expect(catalogBody.pillar_weights).toEqual({ L: 25, P: 20, C: 15, D: 20, A: 20 });
    });
  });

  it("no toca /health ni ofrece v2 cuando el directorio servido no es un mock", async () => {
    await withApp(
      async (app) => {
        const health = await app.inject({ method: "GET", url: "/health" });
        expect(health.statusCode).toBe(200);
        expect(health.json()).toEqual({
          status: "ok",
          contract_version: "dashboard-v1",
          dataset_version: "embat-v2",
          cutoff_date: "2026-09-01",
          generated_at: "2026-09-18T12:00:00+00:00",
          engine: "pending",
        });

        const meta = await app.inject({ method: "GET", url: "/api/v2/meta" });
        expect(meta.statusCode).toBe(503);
        const body = meta.json();
        expect(body.status).toBe("no_v2_tables");
        expect(body.hint).toContain("generate_mock.py");
      },
      { exportsDir: EXPORTS_FIXTURE },
    );
  });
});
