import type { CompanySignals, Pillar, PillarSignals, SignalPoint, SignalV2 } from "@/lib/api-v2";
import { PILLAR_NAMES, PILLAR_WEIGHTS, catalogItems } from "./catalog";
import { companyFixture } from "./company";
import { AS_OF, MONTHS } from "./universe";

/**
 * Señales que la empresa de la fixture NO tiene: sin linea de credito (`D1`) y sin
 * facturas (`P1`–`P3`, `C1`–`C6`). Llegan con `is_available: false`, valores `null`
 * y `weight: 0`, como hace la API; la UI las pinta «No aplica», nunca 0.
 */
export const UNAVAILABLE_SIGNALS = ["D1", "P1", "P2", "P3", "C1", "C2", "C3", "C4", "C5", "C6"];

const PILLARS: Pillar[] = ["L", "P", "C", "D", "A"];

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const VALUE_FORMAT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

/** Escala de `u` a valor bruto por unidad, para que `value` tenga un orden creible. */
function rawValue(u: number, unit: string): number {
  switch (unit) {
    case "dias":
      return round6(u * 120);
    case "meses":
      return round6(u * 6);
    case "ratio":
      return round6(u * 1.5);
    case "variacion":
      return round6(u * 0.4 - 0.2);
    default:
      return round6(u);
  }
}

function formatValue(value: number, unit: string, name: string): string {
  return `${VALUE_FORMAT.format(value)} ${unit} · ${name.toLocaleLowerCase("es-ES")}`;
}

/**
 * Serie `u` de 24 meses determinista por señal: rampa suave con ruido, dentro de
 * [0, 1]. `u_smooth` es la EWMA del motor (α 0,5 en `flow`, 1 en `stock`).
 */
function buildSeries(
  index: number,
  weight: number,
  uRef: number,
  ewma: "flow" | "stock",
): { u: number; uSmooth: number; contribution: number; deltaVsPrev: number }[] {
  const alpha = ewma === "flow" ? 0.5 : 1;
  const out: { u: number; uSmooth: number; contribution: number; deltaVsPrev: number }[] = [];
  for (let month = 0; month < MONTHS.length; month += 1) {
    const wobble = ((((index + 1) * (month + 3)) % 7) - 3) / 100;
    const u = round6(clamp01(0.35 + month * 0.02 + wobble + (index % 5) * 0.03));
    const previous = out.at(-1);
    const uSmooth = round6(previous ? alpha * u + (1 - alpha) * previous.uSmooth : u);
    out.push({
      u,
      uSmooth,
      contribution: round6(weight * (uSmooth - uRef) * 100),
      deltaVsPrev: previous ? round6(uSmooth - previous.uSmooth) : 0,
    });
  }
  return out;
}

const scored = catalogItems.filter((entry) => entry.scores);

/** Pilares con alguna señal disponible: entre ellos se reparte el peso. */
const activePillars = PILLARS.filter((pillar) =>
  scored.some((entry) => entry.pillar === pillar && !UNAVAILABLE_SIGNALS.includes(entry.signal_id)),
);
const activeWeight = activePillars.reduce((sum, pillar) => sum + PILLAR_WEIGHTS[pillar], 0);

function pillarWeight(pillar: Pillar): number {
  return activePillars.includes(pillar) ? round6(PILLAR_WEIGHTS[pillar] / activeWeight) : 0;
}

function signalWeight(signalId: string): number {
  const entry = scored.find((candidate) => candidate.signal_id === signalId)!;
  if (UNAVAILABLE_SIGNALS.includes(signalId)) return 0;
  const siblings = scored.filter(
    (candidate) =>
      candidate.pillar === entry.pillar && !UNAVAILABLE_SIGNALS.includes(candidate.signal_id),
  );
  const total = siblings.reduce((sum, candidate) => sum + candidate.weight_in_pillar, 0);
  return round6((pillarWeight(entry.pillar) * entry.weight_in_pillar) / total);
}

/**
 * Las contribuciones se reescalan para que cumplan la identidad del motor con la
 * ficha de la misma empresa: `score = base + Σ contribution − penalty.points`.
 */
const { score: fixtureScore, base: fixtureBase, penalty: fixturePenalty } = companyFixture;
if (fixtureScore === null || fixtureBase === null || fixturePenalty === null) {
  throw new Error("La fixture de la empresa debe traer score, base y penalty completos");
}
const target = fixtureScore - fixtureBase + fixturePenalty.points;

const rawSignals = scored.map((entry, index) => {
  const available = !UNAVAILABLE_SIGNALS.includes(entry.signal_id);
  const weight = signalWeight(entry.signal_id);
  const series = available ? buildSeries(index, weight, entry.u_ref ?? 0.5, entry.ewma) : null;
  return { entry, available, weight, series };
});

const rawSum = rawSignals.reduce((sum, signal) => sum + (signal.series?.at(-1)?.contribution ?? 0), 0);
const scale = rawSum === 0 ? 1 : target / rawSum;

function buildSignal(raw: (typeof rawSignals)[number]): SignalV2 {
  const { entry, available, weight, series } = raw;
  const points: SignalPoint[] = MONTHS.map((month, index) => {
    const point = series?.[index];
    if (!point) {
      return {
        month,
        value: null,
        value_fmt: null,
        u: null,
        u_smooth: null,
        weight: 0,
        contribution: 0,
        delta_vs_prev: 0,
        is_available: false,
      };
    }
    const value = rawValue(point.u, entry.unit);
    return {
      month,
      value,
      value_fmt: formatValue(value, entry.unit, entry.name),
      u: point.u,
      u_smooth: point.uSmooth,
      weight,
      contribution: round6(point.contribution * scale),
      delta_vs_prev: point.deltaVsPrev,
      is_available: true,
    };
  });
  const last = points.at(-1)!;
  return {
    signal_id: entry.signal_id,
    name: entry.name,
    unit: entry.unit,
    value: last.value,
    value_fmt: last.value_fmt,
    u: last.u,
    u_smooth: last.u_smooth,
    u_ref: available ? entry.u_ref : null,
    weight: last.weight,
    contribution: last.contribution,
    delta_vs_prev: last.delta_vs_prev,
    is_available: available,
    quality_flag: null,
    series_24m: points,
  };
}

const signalsById = new Map(rawSignals.map((raw) => [raw.entry.signal_id, buildSignal(raw)]));

function buildPillar(pillar: Pillar): PillarSignals {
  const signals = scored
    .filter((entry) => entry.pillar === pillar)
    .map((entry) => signalsById.get(entry.signal_id)!);
  const available = signals.filter((signal) => signal.is_available);
  const value =
    available.length === 0
      ? null
      : round6(
          available.reduce((sum, signal) => sum + (signal.u_smooth ?? 0) * signal.weight, 0) /
            available.reduce((sum, signal) => sum + signal.weight, 0),
        );
  return {
    pillar,
    pillar_name: PILLAR_NAMES[pillar],
    weight: pillarWeight(pillar),
    value,
    signals,
  };
}

/**
 * `/api/v2/companies/COMP_0001/signals`: 28 señales x 24 meses con la forma
 * enriquecida de XR-031 (cada punto lleva `value_fmt`, `u_smooth`, `weight`,
 * `contribution`, `delta_vs_prev` e `is_available`).
 */
export const companySignalsFixture: CompanySignals = {
  company_id: companyFixture.company.company_id,
  as_of: AS_OF,
  pillars: PILLARS.map(buildPillar),
};
