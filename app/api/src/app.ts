import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ExportsUnavailableError,
  PENDING_ENGINE,
  REGENERATE_COMMAND,
  defaultExportsDir,
  defaultFixturesDir,
  loadExports,
  type CompanyListItem,
  type EngineResult,
  type ExportsStore,
} from "./exports.js";
import { registerV2Routes } from "./v2/routes.js";
import { createV2Loader, defaultReportsDir } from "./v2/store.js";
import { MotherDuckClient, MotherDuckUnavailableError } from "./motherduck/client.js";
import { createMotherDuckLoader } from "./motherduck/store.js";
import { motherDuckExports } from "./motherduck/exports.js";

export type AppOptions = {
  exportsDir?: string;
  fixturesDir?: string;
  reportsDir?: string;
  logger?: boolean;
};

const SORT_FIELDS = ["company_id", "months_with_activity", "last_activity", "n_transactions"] as const;
type SortField = (typeof SORT_FIELDS)[number];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type ListParams = {
  groupId: string | null;
  q: string | null;
  sort: SortField;
  order: "asc" | "desc";
  offset: number;
  limit: number;
};

function compareCompanies(a: CompanyListItem, b: CompanyListItem, sort: SortField): number {
  switch (sort) {
    case "months_with_activity":
      return a.coverage.months_with_activity - b.coverage.months_with_activity;
    case "n_transactions":
      return a.coverage.counts.transactions - b.coverage.counts.transactions;
    case "last_activity":
      return (a.coverage.last_activity ?? "").localeCompare(b.coverage.last_activity ?? "");
    default:
      return a.company_id.localeCompare(b.company_id);
  }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

function parseListQuery(query: Record<string, unknown>): Parsed<ListParams> {
  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : null;

  const rawSort = text(query.sort);
  if (rawSort !== null && !(SORT_FIELDS as readonly string[]).includes(rawSort)) {
    return { ok: false, message: `sort inválido: ${rawSort}. Válidos: ${SORT_FIELDS.join(", ")}` };
  }
  const rawOrder = text(query.order);
  if (rawOrder !== null && rawOrder !== "asc" && rawOrder !== "desc") {
    return { ok: false, message: `order inválido: ${rawOrder}. Válidos: asc, desc` };
  }
  const rawGroup = text(query.group_id);
  if (rawGroup !== null && !/^GROUP_\d{4}$/.test(rawGroup)) {
    return { ok: false, message: `group_id inválido: ${rawGroup}. Formato esperado GROUP_0001` };
  }

  const offset = text(query.offset);
  if (offset !== null && (!/^\d+$/.test(offset) || Number(offset) < 0)) {
    return { ok: false, message: `offset inválido: ${offset}. Entero >= 0` };
  }
  const limit = text(query.limit);
  if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > MAX_LIMIT)) {
    return { ok: false, message: `limit inválido: ${limit}. Entero entre 1 y ${MAX_LIMIT}` };
  }

  return {
    ok: true,
    value: {
      groupId: rawGroup,
      q: text(query.q),
      sort: (rawSort as SortField | null) ?? "company_id",
      order: (rawOrder as "asc" | "desc" | null) ?? "asc",
      offset: offset === null ? 0 : Number(offset),
      limit: limit === null ? DEFAULT_LIMIT : Number(limit),
    },
  };
}

async function engineSummary(store: ExportsStore, companyId: string) {
  const result = await store.readEngineResult(companyId);
  if (!result) {
    return { status: PENDING_ENGINE.status as string, score: null, trajectory: null, alerts_count: 0 };
  }
  const trajectory = result.trajectory as { direction?: string } | null | undefined;
  return {
    status: result.status,
    score: result.score ?? null,
    trajectory: trajectory?.direction ?? null,
    alerts_count: result.alerts?.length ?? 0,
  };
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const exportsDir = options.exportsDir ?? process.env.EXPORTS_DIR ?? defaultExportsDir();
  const fixturesDir = options.fixturesDir ?? process.env.FIXTURES_DIR ?? defaultFixturesDir();
  // Las tablas del motor X-Ray viven un nivel por encima de `exports/v1`:
  // `EXPORTS_DIR=datasets_mocked/exports/v1` → `V2_DIR=datasets_mocked`.
  const v2Dir = process.env.XRAY_V2_DIR ?? path.resolve(exportsDir, "..", "..");
  const local = options.exportsDir !== undefined || process.env.DATA_SOURCE === "local";
  const database = new MotherDuckClient();
  const currentV2 = local ? createV2Loader(v2Dir) : createMotherDuckLoader(database);
  const reportsDir = options.reportsDir ?? process.env.XRAY_REPORTS_DIR ?? defaultReportsDir();

  const app = Fastify({ logger: options.logger ?? false });
  await app.register(cors, {
    origin: ["http://localhost:5173", "http://localhost:4173"],
  });

  app.addHook("onClose", async () => database.close());
  app.setErrorHandler((error, request, reply) => {
    if (!local) {
      request.log.error({ source: "motherduck" }, "Data request failed");
      return reply.status(503).send({ status: "source_unavailable", source: "motherduck", message: new MotherDuckUnavailableError().message });
    }
    return reply.send(error);
  });

  let store: ExportsStore | null = null;

  async function currentStore(): Promise<ExportsStore | null> {
    if (!local) {
      const live = await currentV2();
      return live ? motherDuckExports(database, live) : null;
    }
    if (store) return store;
    try {
      store = await loadExports(exportsDir);
      return store;
    } catch (error) {
      if (error instanceof ExportsUnavailableError) return null;
      throw error;
    }
  }

  function sendNoExports(reply: FastifyReply) {
    return reply.status(503).send({
      status: "no_exports",
      message: `No hay inventario de exports en ${exportsDir}`,
      hint: `Genera exports/v1 con: ${REGENERATE_COMMAND}`,
    });
  }

  // Descriptor del servicio y sonda de vida del PROCESO: 200 siempre, también
  // sin exports. Quien pregunta por la raíz quiere saber si la API está viva y
  // qué contratos sirve; el estado del inventario se cuenta en el cuerpo
  // (`status`) y con detalle en `/health`, que sí es sonda de los datos.
  app.get("/", async () => {
    const base = {
      service: "xray-api",
      status: (await currentStore()) ? "ok" : "no_exports",
      versions: ["v1", "v2"],
      endpoints: {
        health: "/health",
        v1: "/api/v1/manifest",
        v2: "/api/v2/meta",
      },
    };
    if (base.status === "no_exports") {
      return {
        ...base,
        message: `No hay inventario de exports en ${exportsDir}`,
        hint: `Genera exports/v1 con: ${REGENERATE_COMMAND}`,
      };
    }
    const dataKind = (await currentV2())?.manifest.data_kind ?? null;
    if (dataKind === null) return base;
    return { ...base, data_kind: dataKind };
  });

  app.get("/health", async (_request, reply) => {
    const current = await currentStore();
    if (!current) {
      return reply.status(503).send({
        status: "no_exports",
        engine: "pending",
        message: `No hay inventario de exports en ${exportsDir}`,
        hint: `Genera exports/v1 con: ${REGENERATE_COMMAND}`,
      });
    }
    const base = {
      status: "ok",
      contract_version: current.manifest.contract_version,
      dataset_version: current.manifest.dataset_version,
      cutoff_date: current.manifest.cutoff_date,
      generated_at: current.manifest.generated_at,
    };
    // Con el inventario real no hay tablas v2: la respuesta es exactamente la de
    // siempre. Solo el mock añade `data_kind` y sube `engine` a "mock".
    const dataKind = (await currentV2())?.manifest.data_kind ?? null;
    if (!local) return { ...base, source: "motherduck", data_kind: "real", engine: "static-baseline-v1" };
    if (dataKind !== "mock") return { ...base, engine: "pending" };
    return { ...base, engine: "mock", data_kind: dataKind };
  });

  app.get("/api/v1/manifest", async (_request, reply) => {
    const current = await currentStore();
    if (!current) return sendNoExports(reply);
    return current.manifest;
  });

  app.get("/api/v1/groups", async (_request, reply) => {
    const current = await currentStore();
    if (!current) return sendNoExports(reply);
    return { items: current.groups, total: current.groups.length };
  });

  app.get("/api/v1/groups/:groupId", async (request, reply) => {
    const current = await currentStore();
    if (!current) return sendNoExports(reply);
    const { groupId } = request.params as { groupId: string };
    const group = current.groupsById.get(groupId);
    if (!group) {
      return reply.status(404).send({ error: "group_not_found", message: `No existe el grupo ${groupId}` });
    }
    const members = current.companiesByGroup.get(groupId) ?? [];
    const companies = await Promise.all(
      members.map(async (company) => ({
        ...company,
        engine: await engineSummary(current, company.company_id),
      })),
    );
    return { group, companies };
  });

  app.get("/api/v1/companies", async (request, reply) => {
    const current = await currentStore();
    if (!current) return sendNoExports(reply);

    const parsed = parseListQuery(request.query as Record<string, unknown>);
    if (!parsed.ok) {
      return reply.status(400).send({ error: "invalid_query", message: parsed.message });
    }
    const { groupId, q, sort, order, offset, limit } = parsed.value;

    let selected = groupId === null ? current.companies : (current.companiesByGroup.get(groupId) ?? []);
    if (q !== null) {
      const needle = q.toLowerCase();
      selected = selected.filter((company) => company.company_id.toLowerCase().includes(needle));
    }

    const sorted = [...selected].sort((a, b) => compareCompanies(a, b, sort) * (order === "asc" ? 1 : -1));
    const page = sorted.slice(offset, offset + limit);
    const items = await Promise.all(
      page.map(async (company) => ({
        ...company,
        engine: await engineSummary(current, company.company_id),
      })),
    );

    return { items, total: sorted.length, offset, limit, engine_status: local ? PENDING_ENGINE.status : "static-baseline-v1" };
  });

  app.get("/api/v1/companies/:companyId", async (request, reply) => {
    const current = await currentStore();
    if (!current) return sendNoExports(reply);
    const { companyId } = request.params as { companyId: string };
    if (!/^COMP_\d{4}$/.test(companyId)) {
      return reply.status(400).send({
        error: "invalid_company_id",
        message: `company_id inválido: ${companyId}. Formato esperado COMP_0001`,
      });
    }
    const company = current.companiesById.get(companyId);
    const detail = await current.readCompanyDetail(companyId);
    if (!company || !detail) {
      return reply.status(404).send({ error: "company_not_found", message: `No existe la sociedad ${companyId}` });
    }
    const result: EngineResult | null = await current.readEngineResult(companyId);
    return {
      company: { ...company, engine: await engineSummary(current, companyId) },
      detail,
      engine: result ?? PENDING_ENGINE,
    };
  });

  app.get("/api/v1/monitor", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const demo = query.demo === "1" || query.demo === "true";
    if (!local) {
      await currentV2();
      return { mode: "engine", source: "motherduck", status: "available", alerts: [], note: "El snapshot static-baseline-v1 no contiene alertas temporales. No se sirven fixtures de demostración." };
    }

    if (!demo) {
      return {
        mode: "engine",
        status: PENDING_ENGINE.status,
        alerts: [],
        note:
          "La bandeja del monitor se llena con las alertas del motor analítico " +
          "(app/exports/v1/results/<entity_id>.json). Todavía no hay motor, así que no hay alertas que mostrar.",
      };
    }

    try {
      const raw = await readFile(path.join(fixturesDir, "monitor-demo.json"), "utf8");
      const fixture = JSON.parse(raw) as {
        demo?: boolean;
        source?: string;
        banner?: string;
        alerts?: unknown[];
      };
      return {
        mode: "demo",
        source: "fixture",
        demo: true,
        banner:
          fixture.banner ??
          "DEMO — datos sintéticos de ejemplo; no son resultados del motor ni del dataset",
        alerts: fixture.alerts ?? [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return reply.status(503).send({
          status: "no_fixture",
          message: `No existe el fixture de demostración en ${path.join(fixturesDir, "monitor-demo.json")}`,
        });
      }
      throw error;
    }
  });

  registerV2Routes(app, { v2Dir, currentV2, reportsDir });

  return app;
}
