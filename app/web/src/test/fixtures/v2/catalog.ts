import type { CatalogSignal, CatalogSignals, Pillar } from "@/lib/api-v2";

/** Pesos de pilar del manifest (`reference.pillar_weights`), en puntos sobre 100. */
export const PILLAR_WEIGHTS: Record<Pillar, number> = { L: 25, P: 20, C: 15, D: 20, A: 20 };

export const PILLAR_NAMES: Record<Pillar, string> = {
  L: "Liquidez",
  P: "Disciplina de pago propia",
  C: "Cobros y clientes",
  D: "Deuda y coste de financiacion",
  A: "Actividad y estabilidad",
};

type CatalogSeed = [
  signalId: string,
  name: string,
  unit: string,
  direction: CatalogSignal["direction"],
  weightInPillar: number,
  norm: CatalogSignal["norm"],
  window: string,
  ewma: CatalogSignal["ewma"],
  requires: string | null,
  anchors: number[][] | null,
];

/**
 * Las 29 filas de `signal_catalog.csv` (fixture `--seed 7 --limit 50` de la API),
 * en el orden del fichero. `A6` no puntua (`scores: false`): `/signals` sirve 28.
 */
const CATALOG: CatalogSeed[] = [
  ["L1", "Dias de colchon de caja", "dias", "higher_better", 30, "anchor", "3m", "flow", null, [[0, 0], [10, 0.3], [27, 0.6], [60, 0.9], [120, 1]]],
  ["L2", "Minimo de caja sobre salidas", "ratio", "higher_better", 20, "percentile", "1m+3m", "flow", null, null],
  ["L3", "Dias en negativo", "dias", "lower_better", 25, "anchor", "3m", "stock", null, [[0, 1], [1, 0.6], [3, 0.6], [4, 0.3], [9, 0.3], [10, 0]]],
  ["L4", "Meses de runway", "meses", "higher_better", 15, "anchor", "3m", "stock", null, [[0, 0], [0.5, 0.25], [1, 0.45], [3, 0.8], [6, 1]]],
  ["L5", "Colchon invertido", "ratio", "higher_better", 10, "anchor", "12m", "stock", null, [[0, 0.5], [1, 1]]],
  ["P1", "Facturas propias pagadas tarde", "fraccion", "lower_better", 30, "anchor", "3m", "stock", "invoices", [[0, 1], [0.25, 0.7], [0.5, 0.4], [0.75, 0.15], [1, 0]]],
  ["P2", "Retraso propio ponderado", "dias", "lower_better", 20, "anchor", "3m", "stock", "invoices", [[0, 1], [7, 0.8], [15, 0.6], [30, 0.3], [60, 0]]],
  ["P3", "Deuda comercial vencida sobre recibido", "ratio", "lower_better", 15, "percentile", "stock+3m", "stock", "invoices", null],
  ["P4", "Regularidad de Seguridad Social", "fraccion", "higher_better", 15, "anchor", "6m", "stock", "ss", [[0.5, 0], [0.67, 0.4], [0.83, 0.7], [1, 1]]],
  ["P5", "Regularidad de impuestos", "fraccion", "higher_better", 10, "anchor", "12m", "stock", "tax", [[0, 0], [0.5, 0.3], [0.75, 0.6], [1, 1]]],
  ["P6", "Regularidad de nomina", "fraccion", "higher_better", 10, "anchor", "6m", "stock", "salary", [[0, 0], [0.5, 0.3], [0.75, 0.6], [0.9, 1]]],
  ["C1", "Facturas de cliente cobradas tarde", "fraccion", "lower_better", 25, "anchor", "3m", "stock", "invoices", [[0, 1], [0.25, 0.7], [0.5, 0.4], [0.75, 0.15], [1, 0]]],
  ["C2", "Mora de clientes ponderada", "dias", "lower_better", 15, "anchor", "3m", "stock", "invoices", [[0, 1], [10, 0.8], [20, 0.6], [40, 0.3], [80, 0]]],
  ["C3", "Cartera vencida sobre emitido", "ratio", "lower_better", 20, "percentile", "stock+3m", "stock", "invoices", null],
  ["C4", "Ratio de cobro", "ratio", "higher_better", 15, "anchor", "3m", "flow", "invoices", [[0.6, 0], [0.85, 0.5], [1, 0.8], [1.1, 1]]],
  ["C5", "Diversificacion de clientes", "indice", "higher_better", 15, "percentile", "12m", "stock", "invoices", null],
  ["C6", "Rotacion de clientes relativa", "indice", "lower_better", 10, "percentile", "24m", "stock", "invoices", null],
  ["D1", "Utilizacion de lineas", "fraccion", "lower_better", 25, "anchor", "foto+3m", "stock", "loc", [[0, 1], [0.3, 0.9], [0.6, 0.6], [0.9, 0.2], [1, 0]]],
  ["D2", "Regularidad de amortizacion", "ratio", "higher_better", 25, "anchor", "6m/12m", "stock", "debt", [[0, 0], [0.5, 0.2], [0.8, 0.6], [1, 1]]],
  ["D3", "Servicio de deuda sobre cobros", "ratio", "lower_better", 20, "anchor", "3m", "stock", "debt", [[0, 1], [0.1, 0.8], [0.25, 0.5], [0.5, 0.2], [1, 0]]],
  ["D4", "Peso de comisiones e intereses", "ratio", "lower_better", 15, "percentile", "3m", "stock", null, null],
  ["D5", "Deuda no bancaria", "fraccion", "lower_better", 10, "anchor", "foto", "stock", "debt", [[0, 1], [0.25, 0.6], [0.5, 0.3], [0.75, 0]]],
  ["D6", "Apalancamiento por flujo", "ratio", "lower_better", 5, "percentile", "12m", "stock", "debt", null],
  ["A1", "Crecimiento de cobros", "variacion", "higher_better", 25, "percentile", "3m/12m", "flow", null, null],
  ["A2", "Volatilidad de cobros", "cv", "lower_better", 25, "percentile", "3m", "flow", null, null],
  ["A3", "Flujo operativo neto", "ratio", "higher_better", 20, "anchor", "3m", "flow", null, [[-0.3, 0], [-0.1, 0.35], [0, 0.5], [0.1, 0.7], [0.3, 1]]],
  ["A4", "Tendencia de actividad", "ratio", "higher_better", 10, "percentile", "3m/12m", "flow", null, null],
  ["A5", "Dependencia intragrupo", "fraccion", "lower_better", 10, "anchor", "6m", "stock", "intercompany", [[0, 1], [0.2, 0.7], [0.5, 0.3], [0.8, 0]]],
  ["A6", "Movimientos sin clasificar", "fraccion", "lower_better", 0, "percentile", "3m", "stock", null, null],
];

/** 21 cortes de percentil (0 … 1 en pasos de 0,05) para las señales `percentile`. */
function breakpointsFor(index: number): number[] {
  return Array.from({ length: 21 }, (_, step) => Math.round((step / 20) ** (1 + (index % 3) * 0.25) * 1e6) / 1e6);
}

/** `u_ref` determinista por señal, en el rango del manifest (0,45 … 0,73). */
export function uRefOf(index: number): number {
  return Math.round((0.45 + ((index * 7) % 29) / 100) * 1e6) / 1e6;
}

export const catalogItems: CatalogSignal[] = CATALOG.map(
  ([signalId, name, unit, direction, weightInPillar, norm, window, ewma, requires, anchors], index) => {
    const pillar = signalId[0] as Pillar;
    return {
      signal_id: signalId,
      pillar,
      pillar_name: PILLAR_NAMES[pillar],
      name,
      unit,
      direction,
      weight_in_pillar: weightInPillar,
      pillar_weight: PILLAR_WEIGHTS[pillar],
      norm,
      anchors,
      breakpoints: norm === "percentile" ? breakpointsFor(index) : null,
      window,
      ewma,
      requires,
      scores: weightInPillar > 0,
      u_ref: uRefOf(index),
    };
  },
);

/** `/api/v2/catalog/signals`: las 29 señales y los pesos de pilar del manifest. */
export const catalogFixture: CatalogSignals = {
  items: catalogItems,
  total: catalogItems.length,
  pillar_weights: PILLAR_WEIGHTS,
};
