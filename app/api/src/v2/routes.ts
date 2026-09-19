/**
 * Endpoints `/api/v2/*`: sirven el dataset mock del motor X-Ray tal y como está
 * precalculado en `datasets_mocked/`. La API no calcula finanzas: lee, filtra,
 * ordena y pagina (§1 de `docs/dani/contrato-dashboard-v1.md`).
 *
 * Forma de cada respuesta: PLAN XR-001 §4.2 + `docs/api/v2.md`.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { ENGINE_PARAMS } from "./params.js";
import {
  REGENERATE_V2_COMMAND,
  type AlertRow,
  type CompanyRow,
  type ScoreRow,
  type SignalRow,
  type V2Store,
  reportFor,
} from "./store.js";
import {
  BANDS,
  DIRECTIONS,
  GROUP_BYS,
  METRICS,
  MONTH_PATTERN,
  ORDERS,
  PILLARS,
  REGIMES,
  SEVERITIES,
  SIZE_BYS,
  UNITS,
  UNIVERSE_SORTS,
  reader,
} from "./query.js";

const COMPANY_ID = /^COMP_\d{4}$/;
const GROUP_ID = /^GROUP_\d{4}$/;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

function invalid(reply: FastifyReply, message: string): FastifyReply {
  return reply.status(400).send({ error: "invalid_query", message });
}

function notFound(reply: FastifyReply, error: string, message: string): FastifyReply {
  return reply.status(404).send({ error, message });
}

function compareNullable(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a - b;
}

/** Los 12 últimos meses hasta `as_of` (menos si la empresa tiene menos historia). */
function sparkline12(rows: ScoreRow[], asOf: string): (number | null)[] {
  return rows
    .filter((row) => row.month <= asOf)
    .slice(-12)
    .map((row) => row.score);
}

function companySummary(store: V2Store, company: CompanyRow, row: ScoreRow, asOf: string) {
  return {
    id: company.company_id,
    name: company.name,
    group_id: company.group_id,
    group_name: store.groupsById.get(company.group_id)?.name ?? null,
    score: row.score,
    band: row.band,
    delta_1m: row.delta_1m,
    delta_3m: row.delta_3m,
    regime: row.regime,
    outlook_label: row.outlook_label,
    confidence: row.confidence,
    branch: row.branch,
    op_in_12m: company.op_in_12m,
    sparkline_12: sparkline12(store.scoreByCompany.get(company.company_id) ?? [], asOf),
    alert: store.hasCompanyAlert(company.company_id, asOf),
  };
}

/** Pilar con la nota más baja entre los disponibles: el que paga la penalización. */
function weakestPillar(row: ScoreRow): string | null {
  if (row.penalty === null || row.penalty === 0) return null;
  let weakest: string | null = null;
  let lowest = Number.POSITIVE_INFINITY;
  for (const pillar of PILLARS) {
    const value = row.pillars[pillar].value;
    if (value !== null && value < lowest) {
      lowest = value;
      weakest = pillar;
    }
  }
  return weakest;
}

/**
 * Un punto de `series_24m`: lo que `signals.csv` ya trae para ese mes. `u_ref` y
 * `quality_flag` no viajan en la serie (son del mes de corte).
 */
function seriesPoint(signal: SignalRow) {
  return {
    month: signal.month,
    value: signal.value,
    value_fmt: signal.value_fmt,
    u: signal.u,
    u_smooth: signal.u_smooth,
    weight: signal.weight,
    contribution: signal.contribution,
    delta_vs_prev: signal.delta_vs_prev,
    is_available: signal.is_available,
  };
}

/** La alerta vigente en `as_of`: la última detectada en ese mes o antes. */
function alertAt(store: V2Store, companyId: string, asOf: string): AlertRow | null {
  let latest: AlertRow | null = null;
  for (const alert of store.alerts) {
    if (alert.company_id !== companyId || alert.month_detected > asOf) continue;
    if (latest === null || alert.month_detected >= latest.month_detected) latest = alert;
  }
  return latest;
}

type TreemapItem = {
  id: string;
  name: string;
  size: number;
  color_value: number | null;
  score: number | null;
  band: string | null;
};

/**
 * Media ponderada por `size` de los items que SÍ tienen métrica.
 *
 * Los `null` quedan fuera del numerador **y** del denominador: imputarles 0
 * pintaría "delta exactamente 0" donde no hay dato, y el contrato lo prohíbe
 * ("Ausencia de datos ≠ 0", `docs/dani/contrato-dashboard-v1.md` §3). Sin ningún
 * item con métrica devuelve `null`, nunca 0.
 *
 * Si los items con métrica suman peso 0 (todos con `op_in_12m = 0`) cae a la
 * media simple, que es la misma salida de emergencia que usa la consolidación de
 * grupo del pipeline (`derive_group` en `datasets_mocked/xray_mock/simulate.py`).
 */
function weightedMean(items: TreemapItem[]): number | null {
  let weight = 0;
  let weighted = 0;
  let plain = 0;
  let count = 0;
  for (const item of items) {
    if (item.color_value === null) continue;
    weight += item.size;
    weighted += item.size * item.color_value;
    plain += item.color_value;
    count += 1;
  }
  if (count === 0) return null;
  return weight > 0 ? weighted / weight : plain / count;
}

export type V2Options = {
  v2Dir: string;
  currentV2: () => Promise<V2Store | null>;
  /** Directorio de los informes de Health pregenerados (`<company_id>.json`). */
  reportsDir: string;
};

export function registerV2Routes(app: FastifyInstance, options: V2Options): void {
  const { v2Dir, currentV2, reportsDir } = options;

  function sendNoTables(reply: FastifyReply): FastifyReply {
    return reply.status(503).send({
      status: "no_v2_tables",
      message: `No hay tablas del motor X-Ray en ${v2Dir}`,
      hint: `Genera el dataset mock con: ${REGENERATE_V2_COMMAND}`,
    });
  }

  app.get("/api/v2/universe", async (request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);

    const query = reader(request.query as Record<string, unknown>);
    const asOf = query.asOf("as_of", store.months);
    const unit = query.enumOf("unit", UNITS, "company");
    const sort = query.enumOf("sort", UNIVERSE_SORTS, "score");
    const order = query.enumOf("order", ORDERS, "desc");
    const band = query.optionalEnum("band", BANDS);
    const regime = query.optionalEnum("regime", REGIMES);
    const groupId = query.id("group_id", GROUP_ID, "GROUP_0001");
    const text = query.text("q");
    const limit = query.int("limit", 1, MAX_LIMIT, DEFAULT_LIMIT);
    const offset = query.int("offset", 0, Number.MAX_SAFE_INTEGER, 0);
    if (query.message !== null) return invalid(reply, query.message);

    const needle = text === null ? null : text.toLowerCase();
    const matches = (id: string, name: string): boolean =>
      needle === null || id.toLowerCase().includes(needle) || name.toLowerCase().includes(needle);

    type Item = {
      score: number | null;
      delta_1m: number | null;
      delta_3m: number | null;
      [field: string]: unknown;
    };
    const items: Item[] = [];

    if (unit === "company") {
      for (const company of store.companies) {
        if (groupId !== null && company.group_id !== groupId) continue;
        if (!matches(company.company_id, company.name)) continue;
        const row = store.scoreAt(company.company_id, asOf);
        if (!row) continue;
        if (band !== null && row.band !== band) continue;
        if (regime !== null && row.regime !== regime) continue;
        items.push(companySummary(store, company, row, asOf));
      }
    } else {
      for (const group of store.groups) {
        if (groupId !== null && group.group_id !== groupId) continue;
        if (!matches(group.group_id, group.name)) continue;
        const row = store.groupScoreAt(group.group_id, asOf);
        if (!row) continue;
        if (band !== null && row.band !== band) continue;
        if (regime !== null && row.regime !== regime) continue;
        items.push({
          id: group.group_id,
          name: group.name,
          group_id: null,
          group_name: null,
          score: row.score,
          band: row.band,
          delta_1m: row.delta_1m,
          delta_3m: row.delta_3m,
          regime: row.regime,
          outlook_label: null,
          confidence: row.confidence,
          op_in_12m_eur: group.op_in_12m_eur,
          n_companies_scored: row.n_companies_scored,
          dispersion: row.dispersion,
          weakest_company: row.weakest_company,
          sparkline_12: (store.groupTimelineByGroup.get(group.group_id) ?? [])
            .filter((item) => item.month <= asOf)
            .slice(-12)
            .map((item) => item.score),
          alert: store.hasGroupAlert(group.group_id, asOf),
        });
      }
    }

    const sign = order === "asc" ? 1 : -1;
    items.sort((a, b) => compareNullable(a[sort], b[sort]) * sign);

    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      as_of: asOf,
      unit,
      limit,
      offset,
      data_kind: store.manifest.data_kind ?? null,
    };
  });

  app.get("/api/v2/companies/:companyId", async (request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);

    const { companyId } = request.params as { companyId: string };
    if (!COMPANY_ID.test(companyId)) {
      return reply.status(400).send({
        error: "invalid_company_id",
        message: `company_id inválido: ${companyId}. Formato esperado COMP_0001`,
      });
    }
    const company = store.companiesById.get(companyId);
    if (!company) {
      return notFound(reply, "company_not_found", `No existe la sociedad ${companyId}`);
    }

    const query = reader(request.query as Record<string, unknown>);
    const asOf = query.asOf("as_of", store.months);
    if (query.message !== null) return invalid(reply, query.message);

    const rows = store.scoreByCompany.get(companyId) ?? [];
    const row = store.scoreAt(companyId, asOf);
    if (!row) {
      return notFound(
        reply,
        "month_not_found",
        `La sociedad ${companyId} no tiene score en ${asOf} (activa desde ${rows[0]?.month ?? "nunca"})`,
      );
    }

    const narrative = store.narrativeAt(companyId, asOf);
    const alert = alertAt(store, companyId, asOf);
    const pillars = Object.fromEntries(
      PILLARS.map((pillar) => [
        pillar,
        { value: row.pillars[pillar].value, weight: row.pillars[pillar].weight },
      ]),
    );

    return {
      company,
      ...(store.snapshotAt ? { snapshot: store.snapshotAt(companyId) } : {}),
      as_of: asOf,
      score: row.score,
      band: row.band,
      delta_1m: row.delta_1m,
      delta_3m: row.delta_3m,
      delta_6m: row.delta_6m,
      regime: row.regime,
      confidence: row.confidence,
      branch: row.branch,
      warmup: row.warmup,
      base: row.base,
      outlook: {
        h3: row.outlook_3m,
        h6: row.outlook_6m,
        low: row.outlook_low,
        high: row.outlook_high,
        label: row.outlook_label,
      },
      pillars,
      strength_flags: row.strength_flags,
      timeline: rows.map((item) => ({
        month: item.month,
        score: item.score,
        band: item.band,
        regime: item.regime,
        outlook_low: item.outlook_low,
        outlook_high: item.outlook_high,
      })),
      drivers: store.driversAt(companyId, asOf).map((driver) => ({
        rank: driver.rank,
        signal_id: driver.signal_id,
        pillar: driver.pillar,
        contribution: driver.contribution,
        delta_vs_prev: driver.delta_vs_prev,
        value: driver.value,
        value_fmt: driver.value_fmt,
        direction: driver.direction,
      })),
      penalty: { points: row.penalty, weakest_pillar: weakestPillar(row) },
      cap: row.cap_code === null ? null : { code: row.cap_code, value: row.cap },
      alert,
      narrative:
        narrative === null
          ? null
          : {
              headline: narrative.headline,
              body: narrative.body,
              watch_next: narrative.watch_next,
              guardrail_passed: narrative.guardrail_passed,
            },
      audit: {
        source: store.manifest.source?.data_dir ?? null,
        data_kind: store.manifest.data_kind ?? null,
        params_version: store.manifest.params_version ?? null,
        model_version: store.manifest.model_version ?? null,
        data_version: store.manifest.data_version ?? null,
        generator_version: store.manifest.generator_version ?? null,
        seed: store.manifest.seed ?? null,
        generated_at: store.manifest.generated_at ?? null,
      },
    };
  });

  app.get("/api/v2/companies/:companyId/signals", async (request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);

    const { companyId } = request.params as { companyId: string };
    if (!COMPANY_ID.test(companyId)) {
      return reply.status(400).send({
        error: "invalid_company_id",
        message: `company_id inválido: ${companyId}. Formato esperado COMP_0001`,
      });
    }
    if (!store.companiesById.has(companyId)) {
      return notFound(reply, "company_not_found", `No existe la sociedad ${companyId}`);
    }

    const query = reader(request.query as Record<string, unknown>);
    const asOf = query.asOf("as_of", store.months);
    const pillarFilter = query.optionalEnum("pillar", PILLARS);
    if (query.message !== null) return invalid(reply, query.message);

    const row = store.scoreAt(companyId, asOf);
    if (!row) {
      return notFound(
        reply,
        "month_not_found",
        `La sociedad ${companyId} no tiene score en ${asOf}`,
      );
    }

    const catalogById = new Map(store.catalog.map((entry) => [entry.signal_id, entry]));
    const signals = (await store.signalsFor(companyId)).filter((signal) => signal.month <= asOf);
    const series = new Map<string, ReturnType<typeof seriesPoint>[]>();
    const current = new Map<string, (typeof signals)[number]>();
    for (const signal of signals) {
      const bucket = series.get(signal.signal_id);
      const point = seriesPoint(signal);
      if (bucket) bucket.push(point);
      else series.set(signal.signal_id, [point]);
      if (signal.month === asOf) current.set(signal.signal_id, signal);
    }

    const pillars = PILLARS.filter(
      (pillar) => pillarFilter === null || pillar === pillarFilter,
    ).map((pillar) => {
      const entries = [...current.values()]
        .filter((signal) => signal.pillar === pillar)
        .sort((a, b) => a.signal_id.localeCompare(b.signal_id));
      return {
        pillar,
        pillar_name: store.catalog.find((entry) => entry.pillar === pillar)?.pillar_name ?? null,
        weight: row.pillars[pillar].weight,
        value: row.pillars[pillar].value,
        signals: entries.map((signal) => ({
          signal_id: signal.signal_id,
          name: catalogById.get(signal.signal_id)?.name ?? null,
          unit: catalogById.get(signal.signal_id)?.unit ?? null,
          value: signal.value,
          value_fmt: signal.value_fmt,
          u: signal.u,
          u_smooth: signal.u_smooth,
          u_ref: signal.u_ref,
          weight: signal.weight,
          contribution: signal.contribution,
          delta_vs_prev: signal.delta_vs_prev,
          is_available: signal.is_available,
          quality_flag: signal.quality_flag,
          series_24m: (series.get(signal.signal_id) ?? []).slice(-24),
        })),
      };
    });

    return { company_id: companyId, as_of: asOf, pillars };
  });

  app.get("/api/v2/companies/:companyId/timeline", async (request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);

    const { companyId } = request.params as { companyId: string };
    if (!COMPANY_ID.test(companyId)) {
      return reply.status(400).send({
        error: "invalid_company_id",
        message: `company_id inválido: ${companyId}. Formato esperado COMP_0001`,
      });
    }
    if (!store.companiesById.has(companyId)) {
      return notFound(reply, "company_not_found", `No existe la sociedad ${companyId}`);
    }

    const query = reader(request.query as Record<string, unknown>);
    const from = query.month("from");
    const to = query.month("to");
    if (query.message !== null) return invalid(reply, query.message);

    return (store.scoreByCompany.get(companyId) ?? [])
      .filter((row) => (from === null || row.month >= from) && (to === null || row.month <= to))
      .map((row) => ({
        month: row.month,
        score: row.score,
        level: row.level,
        penalty: row.penalty,
        cap: row.cap,
        cap_code: row.cap_code,
        band: row.band,
        regime: row.regime,
        delta_1m: row.delta_1m,
        outlook_3m: row.outlook_3m,
        outlook_6m: row.outlook_6m,
        outlook_low: row.outlook_low,
        outlook_high: row.outlook_high,
        confidence: row.confidence,
        base: row.base,
        pillars: row.pillars,
      }));
  });

  /**
   * Informe de Health: JSON pregenerado por `app/tools/gen_health_reports.py`,
   * servido tal cual. Sin fichero para la empresa, `404 report_not_found`.
   */
  app.get("/api/v2/companies/:companyId/report", async (request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);

    const { companyId } = request.params as { companyId: string };
    if (!COMPANY_ID.test(companyId)) {
      return reply.status(400).send({
        error: "invalid_company_id",
        message: `company_id inválido: ${companyId}. Formato esperado COMP_0001`,
      });
    }
    if (!store.companiesById.has(companyId)) {
      return notFound(reply, "company_not_found", `No existe la sociedad ${companyId}`);
    }

    const report = await reportFor(reportsDir, companyId);
    if (report === null) {
      return notFound(reply, "report_not_found", "Informe no disponible para esta empresa");
    }
    return report;
  });

  app.get("/api/v2/groups/:groupId", async (request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);

    const { groupId } = request.params as { groupId: string };
    if (!GROUP_ID.test(groupId)) {
      return reply.status(400).send({
        error: "invalid_group_id",
        message: `group_id inválido: ${groupId}. Formato esperado GROUP_0001`,
      });
    }
    const group = store.groupsById.get(groupId);
    if (!group) return notFound(reply, "group_not_found", `No existe el grupo ${groupId}`);

    const query = reader(request.query as Record<string, unknown>);
    const asOf = query.asOf("as_of", store.months);
    if (query.message !== null) return invalid(reply, query.message);

    const timeline = store.groupTimelineByGroup.get(groupId) ?? [];
    const row = store.groupScoreAt(groupId, asOf);
    const strongest = row?.strongest_company ?? null;

    const companies = (store.companiesByGroup.get(groupId) ?? [])
      .map((company) => {
        const scoreRow = store.scoreAt(company.company_id, asOf);
        return scoreRow === null ? null : companySummary(store, company, scoreRow, asOf);
      })
      .filter((item) => item !== null)
      .sort((a, b) => compareNullable(b.score, a.score));

    return {
      group,
      as_of: asOf,
      score: row?.score ?? null,
      band: row?.band ?? null,
      regime: row?.regime ?? null,
      delta_1m: row?.delta_1m ?? null,
      delta_3m: row?.delta_3m ?? null,
      outlook_6m: row?.outlook_6m ?? null,
      outlook_low: row?.outlook_low ?? null,
      outlook_high: row?.outlook_high ?? null,
      confidence: row?.confidence ?? null,
      n_companies_scored: row?.n_companies_scored ?? null,
      dispersion: row?.dispersion ?? null,
      weakest_company: row?.weakest_company ?? null,
      weakest_score: row?.weakest_score ?? null,
      strongest_company: strongest,
      strongest_score: strongest === null ? null : (store.scoreAt(strongest, asOf)?.score ?? null),
      intragroup_dependency_max: row?.intragroup_dependency_max ?? null,
      alert: store.hasGroupAlert(groupId, asOf),
      timeline: timeline.map((item) => ({
        month: item.month,
        score: item.score,
        band: item.band,
        regime: item.regime,
        delta_1m: item.delta_1m,
        outlook_low: item.outlook_low,
        outlook_high: item.outlook_high,
        dispersion: item.dispersion,
        n_companies_scored: item.n_companies_scored,
      })),
      companies,
    };
  });

  app.get("/api/v2/alerts", async (request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);

    const query = reader(request.query as Record<string, unknown>);
    const since = query.month("since");
    const until = query.month("until");
    const severity = query.optionalEnum("severity", SEVERITIES);
    const direction = query.optionalEnum("direction", DIRECTIONS);
    const companyId = query.id("company_id", COMPANY_ID, "COMP_0001");
    const groupId = query.id("group_id", GROUP_ID, "GROUP_0001");
    const limit = query.int("limit", 1, MAX_LIMIT, DEFAULT_LIMIT);
    const offset = query.int("offset", 0, Number.MAX_SAFE_INTEGER, 0);
    if (query.message !== null) return invalid(reply, query.message);

    const items = store.alerts.filter((alert) => {
      if (since !== null && alert.month_detected < since) return false;
      if (until !== null && alert.month_detected > until) return false;
      if (severity !== null && alert.severity !== severity) return false;
      if (direction !== null && alert.direction !== direction) return false;
      if (companyId !== null && alert.company_id !== companyId) return false;
      if (groupId !== null && alert.group_id !== groupId) return false;
      return true;
    });

    return {
      items: items.slice(offset, offset + limit).map((alert) => ({
        ...alert,
        company_name: store.companiesById.get(alert.company_id)?.name ?? null,
        group_name:
          alert.group_id === null ? null : (store.groupsById.get(alert.group_id)?.name ?? null),
      })),
      total: items.length,
      limit,
      offset,
    };
  });

  /**
   * Treemap: un rectángulo por bucket (`group` | `country` | `erp`).
   *
   * El color del bucket (`delta`) sale de `group_timeline.csv` cuando se agrupa
   * por grupo —el pipeline ya lo calcula, y la API no recalcula lo calculado
   * (§1 del contrato)— y solo se agrega aquí para `country` y `erp`, que no
   * tienen fila precalculada. `delta_source` dice cuál de los dos es.
   */
  app.get("/api/v2/treemap", async (request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);

    const query = reader(request.query as Record<string, unknown>);
    const asOf = query.asOf("as_of", store.months);
    const groupBy = query.enumOf("group_by", GROUP_BYS, "group");
    const metric = query.enumOf("metric", METRICS, "delta_3m");
    const sizeBy = query.enumOf("size_by", SIZE_BYS, "op_in_12m");
    if (query.message !== null) return invalid(reply, query.message);

    type Bucket = {
      key: string;
      label: string;
      value_sum: number;
      items: TreemapItem[];
    };
    const buckets = new Map<string, Bucket>();

    for (const company of store.companies) {
      const row = store.scoreAt(company.company_id, asOf);
      if (!row) continue;
      const bucketKey =
        groupBy === "group"
          ? company.group_id
          : groupBy === "country"
            ? (company.country ?? "unknown")
            : (company.erp ?? "unknown");
      const label =
        groupBy === "group"
          ? (store.groupsById.get(company.group_id)?.name ?? company.group_id)
          : bucketKey;
      // `op_in_12m` es el tamaño del rectángulo, no una métrica: el pipeline lo
      // escribe siempre (`real_inputs.py` hace `fillna(0.0)`) y un 0 ahí es un 0
      // real (sin cobros en la ventana TTM), no un dato ausente.
      const size = sizeBy === "n_companies" ? 1 : (company.op_in_12m ?? 0);

      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = { key: bucketKey, label, value_sum: 0, items: [] };
        buckets.set(bucketKey, bucket);
      }
      bucket.value_sum += size;
      bucket.items.push({
        id: company.company_id,
        name: company.name,
        size,
        color_value: row[metric],
        score: row.score,
        band: row.band,
      });
    }

    const groups = [...buckets.values()]
      .map((bucket) => {
        const withMetric = bucket.items.filter((item) => item.color_value !== null);
        const groupRow = groupBy === "group" ? store.groupScoreAt(bucket.key, asOf) : null;
        return {
          key: bucket.key,
          label: bucket.label,
          value_sum: bucket.value_sum,
          // `null` = sin dato. Nunca 0 imputado.
          delta: groupBy === "group" ? (groupRow?.[metric] ?? null) : weightedMean(bucket.items),
          coverage: {
            items_with_metric: withMetric.length,
            items_total: bucket.items.length,
            size_with_metric: withMetric.reduce((total, item) => total + item.size, 0),
          },
          items: bucket.items.sort((a, b) => b.size - a.size),
        };
      })
      .sort((a, b) => b.value_sum - a.value_sum);

    return {
      as_of: asOf,
      group_by: groupBy,
      metric,
      size_by: sizeBy,
      delta_source: groupBy === "group" ? "group_timeline" : "weighted_mean",
      groups,
    };
  });

  app.get("/api/v2/frames", async (_request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);
    return {
      months: store.months,
      frames_url: "/api/v2/frames/{month}",
      data_kind: store.manifest.data_kind ?? null,
    };
  });

  app.get("/api/v2/frames/:month", async (request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);
    const { month } = request.params as { month: string };
    if (!MONTH_PATTERN.test(month)) {
      return invalid(reply, `month inválido: ${month}. Formato esperado YYYY-MM`);
    }
    const frame = await store.readFrame(month);
    if (frame === null) {
      const last = store.months.at(-1) ?? "";
      return notFound(
        reply,
        "frame_not_found",
        `No hay frame para ${month}. Válidos: de ${store.months[0]} a ${last}`,
      );
    }
    return frame;
  });

  app.get("/api/v2/catalog/signals", async (_request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);
    const breakpoints = store.manifest.reference?.percentile_breakpoints ?? {};
    const uRef = store.manifest.reference?.u_ref ?? {};
    return {
      items: store.catalog.map((entry) => ({
        ...entry,
        breakpoints: breakpoints[entry.signal_id] ?? null,
        u_ref: uRef[entry.signal_id] ?? null,
      })),
      total: store.catalog.length,
      pillar_weights: store.manifest.reference?.pillar_weights ?? null,
    };
  });

  app.get("/api/v2/meta", async (_request, reply) => {
    const store = await currentV2();
    if (!store) return sendNoTables(reply);
    const manifest = store.manifest;
    return {
      data_kind: manifest.data_kind ?? null,
      contract_version: manifest.contract_version ?? null,
      model_version: manifest.model_version ?? null,
      data_version: manifest.data_version ?? null,
      params_version: manifest.params_version ?? null,
      generator_version: manifest.generator_version ?? null,
      seed: manifest.seed ?? null,
      limit: manifest.limit ?? null,
      generated_at: manifest.generated_at ?? null,
      cutoff_date: manifest.cutoff_date ?? null,
      window: manifest.window ?? null,
      months: store.months,
      counts: manifest.counts ?? {},
      hashes: (manifest.source?.files ?? []).map((file) => ({
        file: file.file,
        sha256: file.sha256,
        bytes: file.bytes,
      })),
      notes: manifest.notes ?? [],
      reference: manifest.reference ?? null,
      source: manifest.source?.data_dir ?? null,
      capabilities: manifest.capabilities ?? null,
      params: manifest.capabilities?.snapshots_only ? null : ENGINE_PARAMS,
    };
  });
}
