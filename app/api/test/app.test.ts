import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const EXPORTS_FIXTURE = path.join(testDir, "fixtures", "exports");
const DEMO_FIXTURE = path.join(testDir, "fixtures", "demo-fixtures");

const temporaryDirs: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function withApp<T>(
  run: (app: FastifyInstance) => Promise<T>,
  options: { exportsDir?: string; fixturesDir?: string } = {},
): Promise<T> {
  const app = await buildApp({
    exportsDir: options.exportsDir ?? EXPORTS_FIXTURE,
    fixturesDir: options.fixturesDir ?? DEMO_FIXTURE,
  });
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

describe("salud y manifest", () => {
  it("responde ok con exports y 503 sin ellos", async () => {
    await withApp(async (app) => {
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

      const manifest = await app.inject({ method: "GET", url: "/api/v1/manifest" });
      expect(manifest.statusCode).toBe(200);
      expect(manifest.json().quality_notes.length).toBeGreaterThan(0);
    });

    const emptyDir = await mkdtemp(path.join(tmpdir(), "exports-empty-"));
    temporaryDirs.push(emptyDir);
    await withApp(
      async (app) => {
        const health = await app.inject({ method: "GET", url: "/health" });
        expect(health.statusCode).toBe(503);
        const body = health.json();
        expect(body.status).toBe("no_exports");
        expect(body.engine).toBe("pending");
        expect(body.hint).toContain("cd app/tools && uv run python dataset_inventory.py");

        const manifest = await app.inject({ method: "GET", url: "/api/v1/manifest" });
        expect(manifest.statusCode).toBe(503);
        expect(manifest.json().status).toBe("no_exports");
      },
      { exportsDir: emptyDir },
    );
  });
});

describe("listado de sociedades", () => {
  it("filtra por grupo y por texto, ordena y pagina", async () => {
    await withApp(async (app) => {
      const byGroup = await app.inject({ method: "GET", url: "/api/v1/companies?group_id=GROUP_0002" });
      expect(byGroup.statusCode).toBe(200);
      const groupBody = byGroup.json();
      expect(groupBody.total).toBe(2);
      expect(groupBody.items.map((item: { company_id: string }) => item.company_id)).toEqual([
        "COMP_0003",
        "COMP_0100",
      ]);
      expect(groupBody.limit).toBe(50);
      expect(groupBody.offset).toBe(0);
      expect(groupBody.engine_status).toBe("pending_engine");
      expect(groupBody.items[0].engine).toEqual({
        status: "pending_engine",
        score: null,
        trajectory: null,
        alerts_count: 0,
      });
      expect(groupBody.items[0].coverage.snapshot.balance_total_by_currency).toEqual([
        { currency: "EUR", total: 0 },
        { currency: "USD", total: 4100.4 },
      ]);

      const byText = await app.inject({ method: "GET", url: "/api/v1/companies?q=010" });
      expect(byText.json().items.map((item: { company_id: string }) => item.company_id)).toEqual([
        "COMP_0100",
      ]);

      const sorted = await app.inject({
        method: "GET",
        url: "/api/v1/companies?sort=months_with_activity&order=desc",
      });
      expect(sorted.json().items.map((item: { company_id: string }) => item.company_id)).toEqual([
        "COMP_0001",
        "COMP_0003",
        "COMP_0002",
        "COMP_0100",
      ]);

      const page = await app.inject({ method: "GET", url: "/api/v1/companies?limit=2&offset=2" });
      const pageBody = page.json();
      expect(pageBody.total).toBe(4);
      expect(pageBody.limit).toBe(2);
      expect(pageBody.offset).toBe(2);
      expect(pageBody.items.map((item: { company_id: string }) => item.company_id)).toEqual([
        "COMP_0003",
        "COMP_0100",
      ]);
    });
  });

  it("rechaza parámetros inválidos con 400", async () => {
    await withApp(async (app) => {
      const badSort = await app.inject({ method: "GET", url: "/api/v1/companies?sort=score" });
      expect(badSort.statusCode).toBe(400);
      expect(badSort.json().error).toBe("invalid_query");

      const badLimit = await app.inject({ method: "GET", url: "/api/v1/companies?limit=999" });
      expect(badLimit.statusCode).toBe(400);
      expect(badLimit.json().message).toContain("limit");

      const badGroup = await app.inject({ method: "GET", url: "/api/v1/companies?group_id=ACME" });
      expect(badGroup.statusCode).toBe(400);
    });
  });
});

describe("detalle de sociedad", () => {
  it("devuelve pending_engine sin número y 404 cuando no existe", async () => {
    await withApp(async (app) => {
      const detail = await app.inject({ method: "GET", url: "/api/v1/companies/COMP_0001" });
      expect(detail.statusCode).toBe(200);
      const body = detail.json();
      expect(body.company.company_id).toBe("COMP_0001");
      expect(body.detail.monthly_activity.at(-1).partial).toBe(true);
      expect(body.engine.status).toBe("pending_engine");
      expect(body.engine.score).toBeNull();
      expect(body.engine.alerts).toEqual([]);

      const missing = await app.inject({ method: "GET", url: "/api/v1/companies/COMP_9999" });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error).toBe("company_not_found");

      const malformed = await app.inject({ method: "GET", url: "/api/v1/companies/acme" });
      expect(malformed.statusCode).toBe(400);
    });
  });

  it("funde el resultado del motor cuando existe results/<id>.json", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "exports-engine-"));
    temporaryDirs.push(dir);
    await cp(EXPORTS_FIXTURE, dir, { recursive: true });
    await mkdir(path.join(dir, "results"), { recursive: true });
    await writeFile(
      path.join(dir, "results", "COMP_0001.json"),
      JSON.stringify({
        contract_version: "dashboard-v1",
        entity: { kind: "company", id: "COMP_0001" },
        status: "available",
        score: 61.5,
        months: [],
        trajectory: { direction: "improving", months_in_direction: 3 },
        alerts: [{ id: "a1" }, { id: "a2" }],
      }),
    );
    await writeFile(
      path.join(dir, "results", "COMP_0002.json"),
      JSON.stringify({ status: "insufficient_data", score: null, alerts: [] }),
    );

    await withApp(
      async (app) => {
        const detail = await app.inject({ method: "GET", url: "/api/v1/companies/COMP_0001" });
        const body = detail.json();
        expect(body.engine.status).toBe("available");
        expect(body.engine.score).toBe(61.5);
        expect(body.company.engine.trajectory).toBe("improving");
        expect(body.company.engine.alerts_count).toBe(2);

        const list = await app.inject({ method: "GET", url: "/api/v1/companies?sort=company_id" });
        const items = list.json().items;
        expect(items[0].engine.status).toBe("available");
        expect(items[1].engine.status).toBe("insufficient_data");
        expect(items[1].engine.score).toBeNull();
      },
      { exportsDir: dir },
    );
  });

  it("404 en grupos inexistentes y grupo con sus sociedades", async () => {
    await withApp(async (app) => {
      const group = await app.inject({ method: "GET", url: "/api/v1/groups/GROUP_0002" });
      expect(group.statusCode).toBe(200);
      const body = group.json();
      expect(body.group.n_companies_present).toBe(2);
      expect(body.companies.map((company: { company_id: string }) => company.company_id)).toEqual([
        "COMP_0003",
        "COMP_0100",
      ]);

      const missing = await app.inject({ method: "GET", url: "/api/v1/groups/GROUP_0099" });
      expect(missing.statusCode).toBe(404);

      const list = await app.inject({ method: "GET", url: "/api/v1/groups" });
      expect(list.json().total).toBe(2);
    });
  });
});

describe("monitor", () => {
  it("no sirve fixtures por defecto y sí con demo=1", async () => {
    await withApp(async (app) => {
      const byDefault = await app.inject({ method: "GET", url: "/api/v1/monitor" });
      expect(byDefault.statusCode).toBe(200);
      const defaultBody = byDefault.json();
      expect(defaultBody.mode).toBe("engine");
      expect(defaultBody.status).toBe("pending_engine");
      expect(defaultBody.alerts).toEqual([]);
      expect(JSON.stringify(defaultBody)).not.toContain("DEMO");

      const demo = await app.inject({ method: "GET", url: "/api/v1/monitor?demo=1" });
      expect(demo.statusCode).toBe(200);
      const demoBody = demo.json();
      expect(demoBody.mode).toBe("demo");
      expect(demoBody.source).toBe("fixture");
      expect(demoBody.demo).toBe(true);
      expect(demoBody.banner).toContain("DEMO");
      expect(demoBody.alerts).toHaveLength(2);
      expect(demoBody.alerts[0]).toMatchObject({ company_id: "COMP_0001", kind: "deterioration" });
    });
  });

  it("503 si falta el fixture de demostración", async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), "fixtures-empty-"));
    temporaryDirs.push(emptyDir);
    await withApp(
      async (app) => {
        const demo = await app.inject({ method: "GET", url: "/api/v1/monitor?demo=1" });
        expect(demo.statusCode).toBe(503);
        expect(demo.json().status).toBe("no_fixture");
      },
      { fixturesDir: emptyDir },
    );
  });
});
