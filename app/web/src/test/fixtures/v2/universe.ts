import type { Band, UniverseItem, UniverseResponse } from "@/lib/api-v2";

/** Rama de cobertura por defecto: la empresa tiene deuda y facturas. */
const FULL_BRANCH = "full";

/** Mes de corte de todas las fixtures v2. */
export const AS_OF = "2026-08";

/** Los 24 meses que cubren las fixtures, de `2024-09` a `AS_OF`. */
export const MONTHS: string[] = buildMonths("2024-09", 24);

function buildMonths(first: string, count: number): string[] {
  const firstYear = Number(first.slice(0, 4));
  const firstMonth = Number(first.slice(5, 7));
  const months: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = firstMonth - 1 + index;
    const year = firstYear + Math.floor(offset / 12);
    const month = (offset % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return months;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Banda derivada del score, con los mismos cortes en toda la fixture. */
export function bandForScore(score: number): Band {
  if (score >= 80) return "solid";
  if (score >= 60) return "healthy";
  if (score >= 40) return "watch";
  return "stress";
}

/**
 * Serie de 12 meses que termina en el score del mes de corte y respeta los dos
 * deltas publicados: `delta_1m` entre los dos ultimos puntos y `delta_3m` entre
 * el ultimo y el cuarto por la cola. El resto es una rampa con ruido determinista
 * (`seed`), para que la sparkline no sea una recta.
 */
function sparkline(score: number, delta1m: number, delta3m: number, seed: number): number[] {
  const step = delta3m / 3;
  const values: number[] = [];
  for (let index = 0; index < 12; index += 1) {
    const monthsBack = 11 - index;
    const wobble = ((seed * (index + 3)) % 7) - 3;
    values.push(round1(clampScore(score - step * monthsBack + wobble)));
  }
  values[8] = round1(clampScore(score - delta3m));
  values[10] = round1(clampScore(score - delta1m));
  values[11] = score;
  return values;
}

type ItemSeed = Omit<UniverseItem, "band" | "branch" | "op_in_12m" | "sparkline_12"> & {
  branch?: string;
};

/**
 * `op_in_12m` sale de la misma semilla que la sparkline: entre 1,25 M y 12 M, el
 * rango de los ejemplos del contrato, y distinto en cada fila para que un tamano
 * por operativa no salga plano.
 */
function item(seed: ItemSeed, wobbleSeed: number): UniverseItem {
  return {
    ...seed,
    band: bandForScore(seed.score),
    branch: seed.branch ?? FULL_BRANCH,
    op_in_12m: 1_000_000 + wobbleSeed * 250_000,
    sparkline_12: sparkline(seed.score, seed.delta_1m, seed.delta_3m, wobbleSeed),
  };
}

/**
 * 12 empresas de 3 grupos (4 por grupo). El orden de escritura NO es el de score
 * descendente: un test de ordenacion que no ordene nada tiene que fallar.
 */
export const universeFixture: UniverseResponse = {
  items: [
    item(
      {
        id: "COMP_0001",
        name: "Distribuciones Arga S.L.",
        group_id: "GROUP_0147",
        score: 74,
        delta_1m: 2.4,
        delta_3m: 6.1,
        regime: "improving",
        outlook_label: "Mejora sostenida",
        confidence: 0.82,
        alert: false,
      },
      2,
    ),
    item(
      {
        id: "COMP_0002",
        name: "Talleres Mendive S.A.",
        group_id: "GROUP_0147",
        branch: "no_debt",
        score: 88,
        delta_1m: 0,
        delta_3m: 1.2,
        regime: "stable",
        outlook_label: "Estable en cabeza",
        confidence: 0.91,
        alert: false,
      },
      3,
    ),
    item(
      {
        id: "COMP_0003",
        name: "Bodegas Ribalta S.L.",
        group_id: "GROUP_0288",
        score: 41,
        delta_1m: -3.8,
        delta_3m: -9.4,
        regime: "deteriorating",
        outlook_label: "Deterioro en curso",
        confidence: 0.68,
        alert: true,
      },
      5,
    ),
    item(
      {
        id: "COMP_0004",
        name: "Cerámicas Noval S.A.",
        group_id: "GROUP_0288",
        score: 63,
        delta_1m: 1.1,
        delta_3m: -2,
        regime: "blip",
        outlook_label: "Bache puntual",
        confidence: 0.74,
        alert: false,
      },
      7,
    ),
    item(
      {
        id: "COMP_0005",
        name: "Textiles Belmar S.L.",
        group_id: "GROUP_0391",
        score: 21,
        delta_1m: -6.5,
        delta_3m: -11.2,
        regime: "shock_pending",
        outlook_label: "Shock a la vista",
        confidence: 0.55,
        alert: true,
      },
      11,
    ),
    item(
      {
        id: "COMP_0006",
        name: "Logística Caldera S.A.",
        group_id: "GROUP_0391",
        score: 57,
        delta_1m: 0,
        delta_3m: 3.4,
        regime: "recovering",
        outlook_label: "Recuperacion lenta",
        confidence: 0.63,
        alert: false,
      },
      13,
    ),
    item(
      {
        id: "COMP_0007",
        name: "Aceites Valdemar S.L.",
        group_id: "GROUP_0147",
        score: 82,
        delta_1m: -1.3,
        delta_3m: 2.7,
        regime: "stable",
        outlook_label: "Estable con sesgo positivo",
        confidence: 0.88,
        alert: false,
      },
      17,
    ),
    item(
      {
        id: "COMP_0008",
        name: "Montajes Iruña S.A.",
        group_id: "GROUP_0147",
        score: 35,
        delta_1m: 4.2,
        delta_3m: 7.9,
        regime: "recovering",
        outlook_label: "Sale del pozo",
        confidence: 0.6,
        alert: false,
      },
      19,
    ),
    item(
      {
        id: "COMP_0009",
        name: "Papelera Sotillo S.L.",
        group_id: "GROUP_0288",
        score: 69,
        delta_1m: -0.7,
        delta_3m: -4.1,
        regime: "deteriorating",
        outlook_label: "Pierde fuelle",
        confidence: 0.77,
        alert: false,
      },
      23,
    ),
    item(
      {
        id: "COMP_0010",
        name: "Frutas Aldabe S.A.",
        group_id: "GROUP_0288",
        branch: "no_invoices",
        score: 50,
        delta_1m: 2.9,
        delta_3m: 0,
        regime: "warmup",
        outlook_label: "Historial corto",
        confidence: 0.42,
        alert: false,
      },
      29,
    ),
    item(
      {
        id: "COMP_0011",
        name: "Envases Miravet S.L.",
        group_id: "GROUP_0391",
        score: 77,
        delta_1m: 3.6,
        delta_3m: 5.5,
        regime: "improving",
        outlook_label: "Mejora firme",
        confidence: 0.85,
        alert: false,
      },
      31,
    ),
    item(
      {
        id: "COMP_0012",
        name: "Herrajes Zubiri S.A.",
        group_id: "GROUP_0391",
        score: 28,
        delta_1m: -2.2,
        delta_3m: -6.8,
        regime: "deteriorating",
        outlook_label: "Riesgo alto",
        confidence: 0.58,
        alert: false,
      },
      37,
    ),
  ],
  total: 12,
  as_of: AS_OF,
  unit: "company",
  limit: 50,
  offset: 0,
  data_kind: "mock",
};

/**
 * Los mismos 3 grupos vistos como universo con `unit=group`: `group_id` es su propio id
 * y `outlook_label` va a `null` (`group_timeline.csv` no publica etiqueta de outlook).
 */
export const groupUniverseFixture: UniverseResponse = {
  items: [
    item(
      {
        id: "GROUP_0147",
        name: "Grupo Arga",
        group_id: "GROUP_0147",
        score: 70,
        delta_1m: 1.3,
        delta_3m: 4.5,
        regime: "improving",
        outlook_label: null,
        confidence: 0.86,
        alert: false,
      },
      41,
    ),
    item(
      {
        id: "GROUP_0288",
        name: "Grupo Ribalta",
        group_id: "GROUP_0288",
        score: 56,
        delta_1m: -0.1,
        delta_3m: -3.9,
        regime: "deteriorating",
        outlook_label: null,
        confidence: 0.72,
        alert: true,
      },
      43,
    ),
    item(
      {
        id: "GROUP_0391",
        name: "Grupo Belmar",
        group_id: "GROUP_0391",
        score: 46,
        delta_1m: -1.3,
        delta_3m: -2.3,
        regime: "blip",
        outlook_label: null,
        confidence: 0.65,
        alert: false,
      },
      47,
    ),
  ],
  total: 3,
  as_of: AS_OF,
  unit: "group",
  limit: 50,
  offset: 0,
  data_kind: "mock",
};
