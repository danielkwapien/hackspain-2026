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
/** Directorio que no existe: la API arranca igual, sin inventario que servir. */
const MISSING_EXPORTS_FIXTURE = path.join(testDir, "fixtures", "no-exports");

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
      expect(first.score).toBeCloseTo(91.1158834324, 9);
      expect(first.band).toBe("solid");
      expect(first.regime).toBe("stable");
      expect(first.outlook_label).toBe("negative");
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
      expect(bandBody.total).toBe(12);
      expect(bandBody.items[0].id).toBe("COMP_0036");
      expect(bandBody.items.every((item: { band: string }) => item.band === "watch")).toBe(true);

      const regime = await app.inject({
        method: "GET",
        url: "/api/v2/universe?regime=deteriorating",
      });
      expect(regime.json().items.map((item: { id: string }) => item.id)).toEqual([
        "COMP_0023",
        "COMP_0017",
        "COMP_0006",
        "COMP_0038",
        "COMP_0008",
      ]);

      // El generador escribe un régimen por forma de serie, no solo stable/warmup:
      // la fixture trae improving, blip y shock_pending además de deteriorating.
      const improving = await app.inject({
        method: "GET",
        url: "/api/v2/universe?regime=improving",
      });
      expect(improving.json().items.map((item: { id: string }) => item.id)).toEqual([
        "COMP_0046",
        "COMP_0037",
      ]);

      const blip = await app.inject({ method: "GET", url: "/api/v2/universe?regime=blip" });
      expect(blip.json().items.map((item: { id: string }) => item.id)).toEqual(["COMP_0025"]);

      const shock = await app.inject({
        method: "GET",
        url: "/api/v2/universe?regime=shock_pending",
      });
      expect(shock.json().items.map((item: { id: string }) => item.id)).toEqual(["COMP_0035"]);

      const both = await app.inject({
        method: "GET",
        url: "/api/v2/universe?band=watch&regime=deteriorating",
      });
      expect(both.json().items.map((item: { id: string }) => item.id)).toEqual(["COMP_0006"]);

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
      expect(body.score).toBeCloseTo(30.1408527935, 9);
      expect(body.band).toBe("stress");
      expect(body.regime).toBe("stable");
      expect(body.confidence).toBe(0.7);
      expect(body.warmup).toBe(false);
      expect(body.delta_3m).toBeCloseTo(-15.1215275335, 9);

      expect(body.outlook.label).toBe("negative");
      expect(body.outlook.h3).toBeCloseTo(14.2260739468, 9);
      expect(body.outlook.h6).toBeCloseTo(3.56349958986, 9);
      expect(body.outlook.low).toBe(0);

      expect(Object.keys(body.pillars)).toEqual(["L", "P", "C", "D", "A"]);
      expect(body.pillars.L.weight).toBe(0.25);
      expect(body.pillars.C.value).toBeCloseTo(0.344194357449, 9);
      expect(body.strength_flags).toEqual([]);

      expect(body.drivers).toHaveLength(6);
      expect(body.drivers[0]).toEqual({
        rank: 1,
        signal_id: "L1",
        pillar: "L",
        contribution: -2.14839899079,
        delta_vs_prev: -0.0490967276022,
        value: 8.78059261526,
        value_fmt: "9 dias de colchon de caja",
        direction: "neutral",
      });
      expect(body.penalty.points).toBeCloseTo(9.45059923407, 9);
      expect(body.penalty.weakest_pillar).toBe("L");
      // Ningún mes de las 50 sociedades toca techo (el generador reporta
      // "empresa-mes con techo 0"), y COMP_0004 no dispara alerta.
      expect(body.cap).toBeNull();
      expect(body.alert).toBeNull();
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
        score: 43.6836732729,
        band: "watch",
        regime: "warmup",
        outlook_low: 34.2776326606,
        outlook_high: 53.0897138852,
      });

      // COMP_0008 cierra en régimen deteriorating y con la alerta de ese episodio.
      const alerted = await app.inject({ method: "GET", url: "/api/v2/companies/COMP_0008" });
      const alertedBody = alerted.json();
      expect(alertedBody.score).toBeCloseTo(17.9737015069, 9);
      expect(alertedBody.regime).toBe("deteriorating");
      expect(alertedBody.alert).toMatchObject({
        alert_id: "ALERT_00017",
        event: "regime_deteriorating",
        severity: "review",
        direction: "down",
        month_detected: "2026-08",
      });

      // as_of histórico: la alerta que se sirve es la del episodio de ese mes.
      const past = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0008?as_of=2026-06",
      });
      const pastBody = past.json();
      expect(pastBody.as_of).toBe("2026-06");
      expect(pastBody.score).toBeCloseTo(20.3708640584, 9);
      expect(pastBody.band).toBe("stress");
      expect(pastBody.alert.alert_id).toBe("ALERT_00012");
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

  it("publica base y cumple score = base + Σcontribution − penalty", async () => {
    await withApp(async (app) => {
      // Σ contribution de las 28 señales en el mes de corte (las no disponibles suman 0).
      async function contributionsAt(companyId: string): Promise<number> {
        const signals = await app.inject({
          method: "GET",
          url: `/api/v2/companies/${companyId}/signals`,
        });
        expect(signals.statusCode).toBe(200);
        const all = signals
          .json()
          .pillars.flatMap((pillar: { signals: { contribution: number }[] }) => pillar.signals);
        expect(all).toHaveLength(28);
        return all.reduce(
          (sum: number, signal: { contribution: number }) => sum + signal.contribution,
          0,
        );
      }

      // COMP_0004: base de la mediana, penalización de 9,45 y score 30,14.
      const penalised = (await app.inject({ method: "GET", url: "/api/v2/companies/COMP_0004" })).json();
      expect(penalised.base).toBeCloseTo(63.0269724839, 9);
      expect(penalised.base + (await contributionsAt("COMP_0004")) - penalised.penalty.points).toBeCloseTo(
        penalised.score,
        6,
      );
      expect(penalised.score).toBeCloseTo(30.1408527935, 9);

      // COMP_0009: sin penalización, la identidad es base + Σ = score.
      const clean = (await app.inject({ method: "GET", url: "/api/v2/companies/COMP_0009" })).json();
      expect(clean.base).toBeCloseTo(63.4434774399, 9);
      expect(clean.penalty.points).toBe(0);
      expect(clean.base + (await contributionsAt("COMP_0009"))).toBeCloseTo(clean.score, 6);
      expect(clean.score).toBeCloseTo(91.1158834324, 9);
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
      expect(liquidity.value).toBeCloseTo(0.873613080101, 9);
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
      expect(buffer.value_fmt).toBe("119 dias de colchon de caja");
      expect(buffer.u).toBeCloseTo(0.998338406286, 9);
      expect(buffer.u_smooth).toBeCloseTo(0.996788250954, 9);
      expect(buffer.contribution).toBeCloseTo(3.47661350034, 9);
      expect(buffer.is_available).toBe(true);
      expect(buffer.series_24m).toHaveLength(24);
      expect(buffer.series_24m[0]).toEqual({
        month: "2024-09",
        value: 101.185439109,
        value_fmt: "101 dias de colchon de caja",
        u: 0.968642398515,
        u_smooth: 0.968642398515,
        weight: 0.0789473684211,
        contribution: 3.25440940214,
        delta_vs_prev: 0,
        is_available: true,
      });
      expect(buffer.series_24m.at(-1)).toEqual({
        month: "2026-08",
        value: buffer.value,
        value_fmt: buffer.value_fmt,
        u: buffer.u,
        u_smooth: buffer.u_smooth,
        weight: buffer.weight,
        contribution: buffer.contribution,
        delta_vs_prev: buffer.delta_vs_prev,
        is_available: true,
      });

      // El catálogo tiene 28 señales y la respuesta las trae todas, disponibles o no.
      const allSignals = body.pillars.flatMap((pillar: { signals: unknown[] }) => pillar.signals);
      expect(allSignals).toHaveLength(28);

      // COMP_0009 no tiene línea de crédito: D1 llega marcada como no disponible.
      expect(body.pillars[3].signals.map((signal: { signal_id: string }) => signal.signal_id)).toEqual([
        "D1",
        "D2",
        "D3",
        "D4",
        "D5",
        "D6",
      ]);
      const unavailable = body.pillars[3].signals[0];
      expect(unavailable).toMatchObject({
        signal_id: "D1",
        name: "Utilizacion de lineas",
        is_available: false,
        value: null,
        value_fmt: null,
        u: null,
        u_smooth: null,
        u_ref: null,
        weight: 0,
        contribution: 0,
        delta_vs_prev: 0,
      });
      // La serie sigue teniendo los 24 puntos del calendario, todos vacíos.
      expect(unavailable.series_24m).toHaveLength(24);
      expect(unavailable.series_24m[0]).toEqual({
        month: "2024-09",
        value: null,
        value_fmt: null,
        u: null,
        u_smooth: null,
        weight: 0,
        contribution: 0,
        delta_vs_prev: 0,
        is_available: false,
      });
      expect(
        unavailable.series_24m.every(
          (point: { value: number | null; u: number | null; is_available: boolean }) =>
            point.value === null && point.u === null && point.is_available === false,
        ),
      ).toBe(true);
      // D1 no puntúa: el peso se reparte entre las cinco señales que sí existen.
      expect(
        body.pillars[3].signals.map((signal: { weight: number }) => signal.weight),
      ).toEqual([
        0, 0.0526315789474, 0.0421052631579, 0.0315789473684, 0.0210526315789,
        0.0105263157895,
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

  it("la serie de 24 meses lleva value_fmt, u_smooth, weight, contribution, delta_vs_prev e is_available", async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0009/signals",
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();

      // L1 (disponible): cada punto lleva lo que ya viaja en signals.csv para ese mes.
      const buffer = body.pillars[0].signals[0];
      expect(buffer.signal_id).toBe("L1");
      expect(buffer.series_24m[0]).toEqual({
        month: "2024-09",
        value: 101.185439109,
        value_fmt: "101 dias de colchon de caja",
        u: 0.968642398515,
        u_smooth: 0.968642398515,
        weight: 0.0789473684211,
        contribution: 3.25440940214,
        delta_vs_prev: 0,
        is_available: true,
      });
      expect(buffer.series_24m.at(-1)).toMatchObject({
        month: "2026-08",
        value_fmt: "119 dias de colchon de caja",
        u_smooth: 0.996788250954,
        contribution: 3.47661350034,
        delta_vs_prev: 0.0122380684098,
        is_available: true,
      });

      // D1 (no disponible): 24 puntos vacíos, sin peso y marcados como no disponibles.
      const unavailable = body.pillars[3].signals[0];
      expect(unavailable.signal_id).toBe("D1");
      expect(unavailable.series_24m[0]).toEqual({
        month: "2024-09",
        value: null,
        value_fmt: null,
        u: null,
        u_smooth: null,
        weight: 0,
        contribution: 0,
        delta_vs_prev: 0,
        is_available: false,
      });

      // Y ningún punto de ninguna señal se queda sin las claves nuevas.
      const keys = [
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
      for (const pillar of body.pillars) {
        for (const signal of pillar.signals) {
          for (const point of signal.series_24m) {
            expect(Object.keys(point).sort()).toEqual([...keys].sort());
          }
        }
      }
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
        score: 34.9336430599,
        level: 34.9336430599,
        penalty: 8.30696423763,
        cap: 100,
        cap_code: null,
        band: "stress",
        regime: "stable",
        delta_1m: -10.3287372671,
        outlook_3m: 13.0534274643,
        outlook_6m: 10.4580201417,
        outlook_low: 1.0519795294,
        outlook_high: 19.864060754,
        confidence: 0.7,
        base: 63.0269724839,
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

  it("cada fila lleva base", async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v2/companies/COMP_0004/timeline?from=2026-06&to=2026-08",
      });
      expect(response.statusCode).toBe(200);
      const rows = response.json();
      expect(rows).toHaveLength(3);
      expect(rows[0].base).toBeCloseTo(63.0269724839, 9);
      for (const row of rows) {
        expect(typeof row.base, `${row.month} sin base`).toBe("number");
        // Sin techo (cap 100), level = base + Σ contribution y score = level − penalty.
        expect(row.score).toBeCloseTo(row.level - row.penalty, 6);
      }
    });
  });
});

describe("meta", () => {
  it("expone reference del manifest y params del motor", async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/v2/meta" });
      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.reference).not.toBeNull();
      expect(body.reference.bands.solid).toEqual([80, null]);
      expect(body.reference.base_median).toBeCloseTo(60.806848068, 9);
      expect(body.reference.pillar_weights).toEqual({ A: 20, C: 15, D: 20, L: 25, P: 20 });
      expect(Object.keys(body.reference.u_ref)).toHaveLength(28);

      expect(body.params.params_version).toBe("v1");
      expect(body.params.penalty).toEqual({ lambda: 0.5, tau: 0.45 });
      expect(body.params.caps.LOCFULL).toBe(60);
      expect(body.params.caps).toEqual({ NEGCASH: 40, SSMISS: 45, DEBTSTOP: 50, LOCFULL: 60 });
      expect(body.params.ewma_alpha).toEqual({ flow: 0.5, stock: 1 });
      expect(body.params.outlook.phi).toBe(0.85);
      expect(body.params.outlook.horizons).toEqual([3, 6]);
      expect(body.params.confidence.f_hist).toHaveLength(4);
      expect(body.params.confidence.f_quality_low).toBe(0.8);
    });
  });
});

describe("alerts", () => {
  it("filtra por severity y por direction", async () => {
    await withApp(async (app) => {
      const all = await app.inject({ method: "GET", url: "/api/v2/alerts?limit=500" });
      expect(all.json().total).toBe(18);

      const review = await app.inject({ method: "GET", url: "/api/v2/alerts?severity=review" });
      const reviewBody = review.json();
      expect(reviewBody.total).toBe(14);
      expect(reviewBody.items[0]).toMatchObject({
        alert_id: "ALERT_00001",
        company_id: "COMP_0018",
        group_id: "GROUP_0250",
        event: "regime_deteriorating",
        severity: "review",
        direction: "down",
        month_detected: "2025-04",
        trigger_signal: "L1",
        status: "resolved",
      });
      expect(reviewBody.items[0].message).toContain("deterioro confirmado dos meses seguidos");

      const watch = await app.inject({ method: "GET", url: "/api/v2/alerts?severity=watch" });
      expect(watch.json().total).toBe(4);

      // Sin techos en estas 50 sociedades no hay alerta urgent (ver docs/api/v2.md).
      const urgent = await app.inject({ method: "GET", url: "/api/v2/alerts?severity=urgent" });
      expect(urgent.json().total).toBe(0);

      const up = await app.inject({ method: "GET", url: "/api/v2/alerts?direction=up" });
      expect(up.json().items.map((alert: { alert_id: string }) => alert.alert_id)).toEqual([
        "ALERT_00007",
        "ALERT_00011",
        "ALERT_00016",
      ]);

      const down = await app.inject({ method: "GET", url: "/api/v2/alerts?direction=down" });
      expect(down.json().total).toBe(15);

      const window = await app.inject({
        method: "GET",
        url: "/api/v2/alerts?since=2026-07&until=2026-08",
      });
      expect(window.json().items.map((alert: { alert_id: string }) => alert.alert_id)).toEqual([
        "ALERT_00014",
        "ALERT_00015",
        "ALERT_00016",
        "ALERT_00017",
        "ALERT_00018",
      ]);

      const byCompany = await app.inject({
        method: "GET",
        url: "/api/v2/alerts?company_id=COMP_0018",
      });
      expect(byCompany.json().total).toBe(4);

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
        delta_source: "group_timeline",
      });

      const group = body.groups.find((item: { key: string }) => item.key === "GROUP_0195");
      expect(group.label).toBe("Iranzo Corporacion");
      expect(group.value_sum).toBeCloseTo(530050.23, 6);
      // El delta_3m precalculado del grupo, el mismo de GET /api/v2/groups/GROUP_0195.
      expect(group.delta).toBeCloseTo(-11.1247287561, 8);
      expect(group.coverage).toEqual({
        items_with_metric: 2,
        items_total: 2,
        size_with_metric: 530050.23,
      });
      expect(group.items).toEqual([
        {
          id: "COMP_0008",
          name: "Transportes Yuste S.L.U.",
          size: 396885.21,
          color_value: -10.0262907567,
          score: 17.9737015069,
          band: "stress",
        },
        {
          id: "COMP_0006",
          name: "Comercial Carrion S.L.",
          size: 133165.02,
          color_value: -14.3985148905,
          score: 49.0497490285,
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
      // `size_by` cambia el tamaño del rectángulo, no el color: con group_by=group
      // el color es el score consolidado del grupo (ponderado por op_in_12m_eur en
      // el pipeline), no la media de los scores de las filiales de este bucket.
      expect(counted.delta).toBeCloseTo(25.780966282, 9);

      const byCountry = await app.inject({ method: "GET", url: "/api/v2/treemap?group_by=country" });
      expect(byCountry.json().delta_source).toBe("weighted_mean");
      expect(
        byCountry.json().groups.map((item: { key: string }) => item.key),
      ).toContain("ES");

      const bad = await app.inject({ method: "GET", url: "/api/v2/treemap?group_by=sector" });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().message).toBe("group_by inválido: sector. Válidos: group, country, erp");
    });
  });

  // Regresión: las métricas ausentes se imputaban a 0 en el numerador dejando su
  // `size` en el denominador, así que un bucket sin dato salía como "delta
  // exactamente 0". Solo se ve con `as_of` histórico: en 2024-10 ninguna sociedad
  // de la fixture tiene 3 meses de historia y `delta_3m` es null en todas.
  it("no imputa 0 a las métricas ausentes con un as_of histórico", async () => {
    await withApp(async (app) => {
      const empty = await app.inject({
        method: "GET",
        url: "/api/v2/treemap?as_of=2024-10&group_by=country",
      });
      expect(empty.statusCode).toBe(200);
      const emptyBody = empty.json();
      expect(emptyBody.groups.length).toBeGreaterThan(0);
      for (const bucket of emptyBody.groups) {
        expect(bucket.items.length).toBeGreaterThan(0);
        expect(bucket.items.every((item: { color_value: null }) => item.color_value === null)).toBe(
          true,
        );
        expect(bucket.delta).toBeNull();
        expect(bucket.coverage.items_with_metric).toBe(0);
        expect(bucket.coverage.size_with_metric).toBe(0);
      }
      const unknown = emptyBody.groups.find((item: { key: string }) => item.key === "unknown");
      expect(unknown.coverage).toEqual({
        items_with_metric: 0,
        items_total: 10,
        size_with_metric: 0,
      });
      // El tamaño del rectángulo sigue siendo el de las 10 sociedades: es el peso
      // del bucket, no su cobertura.
      expect(unknown.value_sum).toBeCloseTo(88517950.15, 6);

      // Cobertura parcial: en 2024-12, 9 de las 11 sociedades sin país tienen
      // delta_3m. La media sale solo sobre esas 9; con el sesgo hacia 0 salía
      // 1.3339098706 (los 2 nulos pesaban 70.428.353,97 € en el denominador).
      const partial = await app.inject({
        method: "GET",
        url: "/api/v2/treemap?as_of=2024-12&group_by=country",
      });
      const partialBody = partial.json();
      const mixed = partialBody.groups.find((item: { key: string }) => item.key === "unknown");
      expect(mixed.coverage).toEqual({
        items_with_metric: 9,
        items_total: 11,
        size_with_metric: 88517950.15,
      });
      expect(mixed.value_sum).toBeCloseTo(158946304.12, 6);
      expect(mixed.delta).toBeCloseTo(2.3952208971, 9);

      // Bucket con una sola sociedad de op_in_12m = 0: peso total 0 pero SÍ hay
      // métrica, así que cae a la media simple en vez de devolver 0 imputado.
      const zeroWeight = partialBody.groups.find((item: { key: string }) => item.key === "PT");
      expect(zeroWeight.value_sum).toBe(0);
      expect(zeroWeight.coverage).toEqual({
        items_with_metric: 1,
        items_total: 1,
        size_with_metric: 0,
      });
      expect(zeroWeight.delta).toBeCloseTo(2.28638523925, 9);

      // Y por grupo, donde el delta viene precalculado: sin fila en
      // group_timeline.csv para ese mes, `delta` es null, no 0.
      const byGroup = await app.inject({ method: "GET", url: "/api/v2/treemap?as_of=2024-10" });
      const bierzo = byGroup
        .json()
        .groups.find((item: { key: string }) => item.key === "GROUP_0126");
      expect(bierzo.delta).toBeNull();
      expect(bierzo.coverage).toEqual({
        items_with_metric: 0,
        items_total: 1,
        size_with_metric: 0,
      });
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
      expect(frameBody.stats.mean_score).toBeCloseTo(57.9110592266, 9);
      expect(frameBody.stats.n_deteriorating).toBe(5);
      expect(
        frameBody.alerts_this_month.map((alert: { alert_id: string }) => alert.alert_id),
      ).toEqual(["ALERT_00017", "ALERT_00018"]);

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

describe("raíz", () => {
  it("describe el servicio y responde 200 con y sin exports", async () => {
    await withApp(async (app) => {
      const root = await app.inject({ method: "GET", url: "/" });
      expect(root.statusCode).toBe(200);
      expect(root.json()).toEqual({
        service: "xray-api",
        status: "ok",
        versions: ["v1", "v2"],
        endpoints: {
          health: "/health",
          v1: "/api/v1/manifest",
          v2: "/api/v2/meta",
        },
        data_kind: "mock",
      });
    });

    // Sonda de vida del proceso: sin inventario sigue siendo 200 y sigue
    // anunciando los dos contratos; el "no hay datos" va en el cuerpo.
    await withApp(
      async (app) => {
        const root = await app.inject({ method: "GET", url: "/" });
        expect(root.statusCode).toBe(200);
        const body = root.json();
        expect(body.service).toBe("xray-api");
        expect(body.status).toBe("no_exports");
        expect(body.versions).toEqual(["v1", "v2"]);
        expect(body.endpoints.health).toBe("/health");
        expect(body.hint).toContain("exports/v1");
        expect(body.data_kind).toBeUndefined();
      },
      { exportsDir: MISSING_EXPORTS_FIXTURE },
    );
  });
});
