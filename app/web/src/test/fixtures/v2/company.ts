import type {
  AlertRow,
  CompanyRow,
  CompanyV2,
  Driver,
  Narrative,
  Penalty,
  Pillars,
  TimelinePoint,
  UniverseItem,
} from "@/lib/api-v2";
import { AS_OF, MONTHS, bandForScore, universeFixture } from "./universe";

/**
 * Score de la empresa mediana del universo (`reference.base_median` del manifest):
 * el punto de partida de la identidad `score = base + Σ contribution − penalty`.
 */
export const BASE_MEDIAN = 60.8;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

const POINTS_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Timeline de 24 meses (`2024-09` … `2026-08`). Los 12 ultimos son exactamente la
 * `sparkline_12` del item; los 12 primeros son una rampa hacia atras con ruido
 * determinista, para que la serie larga no sea una repeticion de la corta.
 */
function buildTimeline(entity: UniverseItem): TimelinePoint[] {
  const recent = entity.sparkline_12;
  const first = recent[0];
  const scores: number[] = [];
  for (let index = 0; index < 12; index += 1) {
    const monthsBack = 12 - index;
    const wobble = ((entity.score * (index + 5)) % 5) - 2;
    scores.push(round1(clampScore(first - monthsBack * 0.8 + wobble)));
  }
  scores.push(...recent);

  const spread = round1(4 + (1 - entity.confidence) * 10);
  return scores.map((score, index) => {
    const previous = index === 0 ? score : scores[index - 1];
    const step = round1(score - previous);
    let regime: TimelinePoint["regime"] = "stable";
    if (index < 3) regime = "warmup";
    else if (step > 1) regime = "improving";
    else if (step < -1) regime = "deteriorating";
    return {
      month: MONTHS[index],
      score,
      band: bandForScore(score),
      regime: index === scores.length - 1 ? entity.regime : regime,
      outlook_low: round1(clampScore(score - spread)),
      outlook_high: round1(clampScore(score + spread)),
    };
  });
}

/**
 * Fila de `companies.csv` derivada del item: cobertura segun `branch` y recuentos
 * tomados de `docs/api/examples/company.json`, a cero donde la rama no los tiene.
 */
function buildCompanyRow(entity: UniverseItem): CompanyRow {
  const hasDebt = entity.branch !== "no_debt";
  const hasInvoices = entity.branch !== "no_invoices";
  return {
    company_id: entity.id,
    name: entity.name,
    group_id: entity.group_id,
    branch: entity.branch,
    cash_quality: "ok",
    country: null,
    created_at: `${MONTHS[0]}-30`,
    currency: "EUR",
    erp: "businessCentral",
    first_activity: `${MONTHS[0]}-30`,
    last_activity: `${AS_OF}-31`,
    months_hist: MONTHS.length,
    has_debt: hasDebt,
    has_debt_repayment: hasDebt,
    has_invoices: hasInvoices,
    has_lineofcredit: hasDebt,
    n_banking_products: 6,
    n_debt_products: hasDebt ? 26 : 0,
    n_invoices: hasInvoices ? 2188 : 0,
    n_transactions: 3750,
    op_in_12m: entity.op_in_12m,
  };
}

/** Los cinco pilares con pesos fijos que suman 1 y valores desviados del score. */
function buildPillars(score: number): Pillars {
  return {
    L: { value: round1(clampScore(score + 4)), weight: 0.3 },
    P: { value: round1(clampScore(score - 3)), weight: 0.25 },
    C: { value: round1(clampScore(score + 1)), weight: 0.2 },
    D: { value: round1(clampScore(score - 6)), weight: 0.15 },
    A: { value: round1(clampScore(score + 2)), weight: 0.1 },
  };
}

/** Sentido del movimiento de la señal frente al mes anterior. */
function directionOf(deltaVsPrev: number): Driver["direction"] {
  if (Math.abs(deltaVsPrev) < 0.05) return "neutral";
  return deltaVsPrev > 0 ? "better" : "worse";
}

/**
 * Cuatro señales del catalogo (`signal_catalog.csv`), una por pilar salvo `P`, cuyo
 * signo sigue al del `delta_3m` de la empresa. `value_fmt` usa la misma forma que la
 * API (`"8 dias de colchon de caja"`).
 */
function buildDrivers(entity: UniverseItem): Driver[] {
  const sign = entity.delta_3m < 0 ? -1 : 1;
  const base = entity.delta_3m === 0 ? 1.5 : Math.abs(entity.delta_3m);
  const runwayDays = Math.round(entity.score / 4);
  const lateShare = round1((100 - entity.score) / 100);
  const utilisation = round1(clampScore(100 - entity.score) / 100);
  const collectionsGrowth = round1(entity.delta_3m / 10);

  const seeds: Omit<Driver, "rank" | "direction">[] = [
    {
      signal_id: "L1",
      pillar: "L",
      contribution: round1(sign * base * 0.45),
      delta_vs_prev: round1(sign * base * 0.12),
      value: runwayDays,
      value_fmt: `${runwayDays} dias de colchon de caja`,
    },
    {
      signal_id: "C1",
      pillar: "C",
      contribution: round1(sign * base * 0.3),
      delta_vs_prev: round1(-sign * base * 0.08),
      value: lateShare,
      value_fmt: `${Math.round(lateShare * 100)} % de las facturas de cliente cobradas tarde`,
    },
    {
      signal_id: "D1",
      pillar: "D",
      contribution: round1(sign * base * 0.18),
      delta_vs_prev: round1(sign * base * 0.05),
      value: utilisation,
      value_fmt: `${Math.round(utilisation * 100)} % de utilizacion de lineas`,
    },
    {
      signal_id: "A1",
      pillar: "A",
      contribution: round1(sign * base * 0.07),
      delta_vs_prev: round1(sign * base * 0.03),
      value: collectionsGrowth,
      value_fmt: `${POINTS_FORMAT.format(collectionsGrowth * 100)} % de crecimiento de cobros`,
    },
  ];

  return seeds.map((seed, index) => ({
    ...seed,
    rank: index + 1,
    direction: directionOf(seed.delta_vs_prev),
  }));
}

function buildStrengthFlags(entity: UniverseItem): string[] {
  const flags: string[] = [];
  if (entity.score >= 60) flags.push("liquidez_holgada");
  if (entity.delta_3m > 0) flags.push("tendencia_positiva");
  if (entity.confidence >= 0.7) flags.push("historial_completo");
  if (entity.alert) flags.push("vigilancia_activa");
  return flags;
}

/** Con alerta, la penalizacion cae sobre Liquidez; sin ella no hay pilar debil. */
function buildPenalty(entity: UniverseItem): Penalty {
  if (!entity.alert) return { points: 0, weakest_pillar: null };
  return { points: round1(Math.abs(entity.delta_3m) * 0.5), weakest_pillar: "L" };
}

/**
 * Fila de `alerts.csv` para los items con `alert: true`: detectada el mes anterior al
 * corte, con el score de hace tres meses como `score_before` y el actual como
 * `score_after`, igual que hace el generador.
 */
function buildAlert(entity: UniverseItem): AlertRow | null {
  if (!entity.alert) return null;
  const scoreBefore = round1(entity.score - entity.delta_3m);
  const monthDetected = MONTHS[MONTHS.length - 2];
  const monthFrom = MONTHS[MONTHS.length - 4];
  const drop = POINTS_FORMAT.format(Math.abs(entity.delta_3m));
  return {
    alert_id: `ALERT_${entity.id.slice(-4).padStart(5, "0")}`,
    company_id: entity.id,
    group_id: entity.group_id,
    event: "regime_deteriorating",
    severity: "review",
    direction: "down",
    month_detected: monthDetected,
    month_evident: null,
    lead_time_months: null,
    trigger_signal: "L1",
    score_before: scoreBefore,
    score_after: entity.score,
    status: "open",
    message:
      `deterioro confirmado dos meses seguidos: el score cae ${drop} puntos desde ${monthFrom}: ` +
      `de ${POINTS_FORMAT.format(scoreBefore)} a ${POINTS_FORMAT.format(entity.score)} (vigilar).`,
  };
}

function buildNarrative(entity: UniverseItem, drivers: Driver[]): Narrative {
  const label = entity.outlook_label ?? "sin etiqueta";
  const move = entity.delta_1m >= 0 ? "Sube" : "Baja";
  const delta1m = POINTS_FORMAT.format(Math.abs(entity.delta_1m));
  const lead = drivers[0];
  return {
    headline: `${move} ${delta1m} puntos hasta ${Math.round(entity.score)} (${label})`,
    body:
      `${entity.name} cierra ${AS_OF} con ${entity.score} puntos (banda ${bandForScore(entity.score)}) ` +
      `y un regimen ${entity.regime}. El movimiento del trimestre es de ${round1(entity.delta_3m)} puntos ` +
      `y el outlook a tres meses se lee como "${label}".`,
    watch_next: `Vigilar ${lead.value_fmt}: es el driver que marca el mes que viene.`,
    guardrail_passed: true,
  };
}

/**
 * Ficha completa derivada de forma determinista de cualquier item de
 * `universeFixture`: mismo id, nombre, score, banda, regimen y sparkline que su
 * fila del universo, para poder simular varias empresas sin escribirlas a mano.
 */
export function companyFixtureFor(id: string): CompanyV2 {
  const entity = universeFixture.items.find((candidate) => candidate.id === id);
  if (!entity) throw new Error(`No hay fixture v2 para la entidad ${id}.`);

  const timeline = buildTimeline(entity);
  const drivers = buildDrivers(entity);
  const spread = round1(4 + (1 - entity.confidence) * 10);
  const h3 = round1(clampScore(entity.score + entity.delta_3m * 0.5));
  const h6 = round1(clampScore(entity.score + entity.delta_3m * 0.8));

  return {
    company: buildCompanyRow(entity),
    as_of: AS_OF,
    base: BASE_MEDIAN,
    score: entity.score,
    band: entity.band,
    delta_1m: entity.delta_1m,
    delta_3m: entity.delta_3m,
    delta_6m: round1(entity.delta_3m * 1.6),
    regime: entity.regime,
    confidence: entity.confidence,
    branch: entity.branch,
    warmup: entity.regime === "warmup",
    outlook: {
      h3,
      h6,
      low: round1(clampScore(h6 - spread)),
      high: round1(clampScore(h6 + spread)),
      label: entity.outlook_label ?? "",
    },
    pillars: buildPillars(entity.score),
    strength_flags: buildStrengthFlags(entity),
    timeline,
    drivers,
    penalty: buildPenalty(entity),
    cap: entity.alert ? { code: "LOCFULL", value: 55 } : null,
    alert: buildAlert(entity),
    narrative: buildNarrative(entity, drivers),
    audit: {
      data_kind: "mock",
      params_version: "v1",
      model_version: "mock-v1",
      data_version: "embat-v2",
      generator_version: "mock-gen-1",
      seed: 42,
      generated_at: "2026-09-01T00:00:00+00:00",
    },
  };
}

/** Ficha de la primera empresa del universo (`COMP_0001`, Distribuciones Arga S.L.). */
export const companyFixture: CompanyV2 = companyFixtureFor("COMP_0001");
