import type { CompanyV2, Driver, Pillars, TimelinePoint, UniverseItem } from "@/lib/api-v2";
import { AS_OF, MONTHS, bandForScore, universeFixture } from "./universe";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

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

/** Cuatro señales cuyo signo sigue al del `delta_3m` de la empresa. */
function buildDrivers(entity: UniverseItem): Driver[] {
  const sign = entity.delta_3m < 0 ? -1 : 1;
  const base = entity.delta_3m === 0 ? 1.5 : Math.abs(entity.delta_3m);
  return [
    {
      signal_id: "LIQ_RUNWAY",
      name: "Colchón de liquidez",
      pillar: "L",
      contribution: round1(sign * base * 0.45),
      delta_vs_prev: round1(sign * base * 0.12),
    },
    {
      signal_id: "COB_DSO",
      name: "Días de cobro",
      pillar: "C",
      contribution: round1(sign * base * 0.3),
      delta_vs_prev: round1(-sign * base * 0.08),
    },
    {
      signal_id: "DEU_COBERTURA",
      name: "Cobertura de deuda",
      pillar: "D",
      contribution: round1(sign * base * 0.18),
      delta_vs_prev: round1(sign * base * 0.05),
    },
    {
      signal_id: "ACT_INGRESOS",
      name: "Tendencia de ingresos",
      pillar: "A",
      contribution: round1(sign * base * 0.07),
      delta_vs_prev: round1(sign * base * 0.03),
    },
  ];
}

function buildStrengthFlags(entity: UniverseItem): string[] {
  const flags: string[] = [];
  if (entity.score >= 60) flags.push("liquidez_holgada");
  if (entity.delta_3m > 0) flags.push("tendencia_positiva");
  if (entity.confidence >= 0.7) flags.push("historial_completo");
  if (entity.alert) flags.push("vigilancia_activa");
  return flags;
}

function buildNarrative(entity: UniverseItem): string {
  return (
    `${entity.name} cierra ${AS_OF} con ${entity.score} puntos (banda ${bandForScore(entity.score)}) ` +
    `y un regimen ${entity.regime}. El movimiento del trimestre es de ${round1(entity.delta_3m)} puntos ` +
    `y el outlook a tres meses se lee como "${entity.outlook_label}".`
  );
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
  const spread = round1(4 + (1 - entity.confidence) * 10);
  const h3 = round1(clampScore(entity.score + entity.delta_3m * 0.5));
  const h6 = round1(clampScore(entity.score + entity.delta_3m * 0.8));
  const capped = entity.alert;

  return {
    company: entity,
    as_of: AS_OF,
    score: entity.score,
    band: entity.band,
    delta_1m: entity.delta_1m,
    delta_3m: entity.delta_3m,
    delta_6m: round1(entity.delta_3m * 1.6),
    regime: entity.regime,
    confidence: entity.confidence,
    branch: entity.delta_3m > 0 ? "upside" : entity.delta_3m < 0 ? "downside" : "base",
    outlook: {
      h3,
      h6,
      low: round1(clampScore(h6 - spread)),
      high: round1(clampScore(h6 + spread)),
      label: entity.outlook_label,
    },
    pillars: buildPillars(entity.score),
    strength_flags: buildStrengthFlags(entity),
    timeline,
    drivers: buildDrivers(entity),
    penalty: capped ? round1(Math.abs(entity.delta_3m) * 0.5) : 0,
    cap: capped ? 55 : null,
    alert: entity.alert,
    narrative: buildNarrative(entity),
    audit: {
      model_version: "mock-v1",
      generated_at: "2026-09-01T00:00:00+00:00",
      inputs: ["balances", "transactions", "invoices", "debt_schedule"],
    },
  };
}

/** Ficha de la primera empresa del universo (`COMP_0001`, Distribuciones Arga S.L.). */
export const companyFixture: CompanyV2 = companyFixtureFor("COMP_0001");
