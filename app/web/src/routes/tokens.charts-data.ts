/**
 * Datos fijos del catálogo de gráficas de `/tokens`.
 *
 * Son series inventadas y deterministas: el catálogo tiene que contar siempre
 * lo mismo para poder comparar variantes de un vistazo. Nada sale de la API.
 *
 * Desviación anotada: el plan pedía alimentar el catálogo desde
 * `docs/api/examples/`, que hoy no existe en el repo (`docs/api/` está vacío).
 *
 * Escalas del dominio: score de 0 a 100 sobre 24 meses `YYYY-MM`, nota de pilar
 * `u ∈ [0,1]` y contribuciones en puntos.
 */

import type {
  ChartTooltipRow,
  LineForecast,
  LineMarker,
  LineSeries,
  Regime,
  TreemapDatum,
  TreemapDatumGroup,
} from "@/charts";

/** `count` meses consecutivos desde `from`, en `YYYY-MM`. */
function monthsFrom(from: string, count: number): string[] {
  const [year, month] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** Eje de tiempo del catálogo: 24 meses cerrados. */
export const CATALOG_MONTHS: readonly string[] = monthsFrom("2024-01", 24);

/** Primer mes proyectado; la banda de outlook arranca en el último cerrado. */
const FORECAST_MONTHS: readonly string[] = monthsFrom("2026-01", 6);

/** Serie única de 24 meses con un solo régimen, ya lista para `series`. */
function regimeSeries(id: string, regime: Regime, values: readonly number[]): LineSeries[] {
  return [
    {
      id,
      points: values.map((value, index) => ({
        month: CATALOG_MONTHS[index],
        value,
        regime,
      })),
    },
  ];
}

/** Una línea de la fila de regímenes: la serie, su etiqueta y su token. */
export type RegimeLine = {
  regime: Regime;
  label: string;
  token: string;
  series: LineSeries[];
};

/**
 * Los seis regímenes con token propio (`docs/design/tokens.md`). `shock_pending`
 * no está: comparte color con `blip` y no añade nada que mirar.
 */
export const REGIME_LINES: readonly RegimeLine[] = [
  {
    regime: "improving",
    label: "Mejorando",
    token: "--regime-improving",
    series: regimeSeries("Score", "improving", [
      48.2, 49.0, 50.1, 50.8, 52.4, 53.1, 54.6, 55.9, 57.2, 58.0, 59.6, 60.4, 61.1, 62.8, 63.4,
      64.9, 66.2, 67.0, 68.3, 69.1, 70.4, 71.2, 72.6, 73.5,
    ]),
  },
  {
    regime: "deteriorating",
    label: "Deteriorándose",
    token: "--regime-deteriorating",
    series: regimeSeries("Score", "deteriorating", [
      78.4, 77.9, 77.1, 76.2, 75.0, 73.8, 72.9, 71.4, 70.2, 68.9, 67.5, 66.1, 64.8, 63.2, 62.0,
      60.7, 59.1, 57.8, 56.4, 55.0, 53.6, 52.1, 50.8, 49.3,
    ]),
  },
  {
    regime: "blip",
    label: "Bache",
    token: "--regime-blip",
    series: regimeSeries("Score", "blip", [
      66.0, 66.4, 65.8, 66.9, 67.2, 66.5, 67.1, 66.8, 58.3, 51.9, 55.6, 62.4, 66.1, 66.7, 67.0,
      66.3, 67.4, 66.9, 67.2, 66.6, 67.1, 66.8, 67.3, 67.0,
    ]),
  },
  {
    regime: "stable",
    label: "Estable",
    token: "--regime-stable",
    series: regimeSeries("Score", "stable", [
      61.2, 61.5, 60.9, 61.1, 61.4, 60.8, 61.0, 61.3, 60.7, 61.2, 61.6, 61.0, 60.9, 61.4, 61.1,
      60.8, 61.3, 61.5, 61.0, 61.2, 60.9, 61.4, 61.1, 61.3,
    ]),
  },
  {
    regime: "recovering",
    label: "Recuperando",
    token: "--regime-recovering",
    series: regimeSeries("Score", "recovering", [
      64.1, 62.0, 59.3, 55.8, 51.2, 47.6, 44.9, 43.1, 42.8, 44.2, 46.9, 49.3, 51.8, 53.6, 55.1,
      56.9, 58.2, 59.4, 60.1, 61.3, 62.0, 62.8, 63.5, 64.2,
    ]),
  },
  {
    regime: "warmup",
    label: "Calentamiento",
    token: "--regime-warmup",
    series: regimeSeries("Score", "warmup", [
      55.4, 62.1, 51.8, 58.9, 54.2, 60.3, 52.7, 59.6, 53.8, 61.0, 55.1, 57.4, 54.6, 60.8, 52.3,
      58.1, 56.7, 59.9, 53.2, 61.4, 54.9, 57.8, 55.6, 58.4,
    ]),
  },
];

/** Score de 24 meses que pasa por tres regímenes: la serie del outlook. */
const OUTLOOK_VALUES: readonly number[] = [
  62.1, 61.8, 62.4, 61.9, 62.2, 61.6, 62.0, 61.4, 59.8, 57.2, 55.1, 52.8, 50.4, 48.1, 46.6, 45.2,
  46.8, 48.9, 50.7, 52.4, 54.1, 55.8, 57.2, 58.6,
];

/** Régimen de cada tramo de `OUTLOOK_VALUES`, por posición en el eje. */
function outlookRegime(index: number): Regime {
  if (index < 8) return "stable";
  if (index < 16) return "deteriorating";
  return "recovering";
}

export const OUTLOOK_SERIES: LineSeries[] = [
  {
    id: "Score",
    points: OUTLOOK_VALUES.map((value, index) => ({
      month: CATALOG_MONTHS[index],
      value,
      regime: outlookRegime(index),
    })),
  },
];

/** Media del periodo cerrado, redondeada a la décima. */
export const OUTLOOK_BASELINE = { value: 55.4, label: "Media 24 m" };

/** Proyección a seis meses; `low`/`high` van índice a índice con `points`. */
export const OUTLOOK_FORECAST: LineForecast = {
  from: CATALOG_MONTHS[CATALOG_MONTHS.length - 1],
  points: [
    { month: CATALOG_MONTHS[CATALOG_MONTHS.length - 1], value: 58.6 },
    ...FORECAST_MONTHS.map((month, index) => ({
      month,
      value: 59.4 + index * 1.2,
    })),
  ],
  low: [58.6, 57.1, 57.0, 56.6, 56.1, 55.4, 54.6],
  high: [58.6, 61.7, 63.2, 64.9, 66.8, 68.9, 71.2],
};

export const OUTLOOK_MARKERS: LineMarker[] = [
  { month: CATALOG_MONTHS[1], kind: "warmup" },
  { month: CATALOG_MONTHS[8], kind: "alert" },
  { month: CATALOG_MONTHS[15], kind: "cap" },
];

/** Una serie de la gráfica normalizada, con el color que le toca en la leyenda. */
export type NormalizedLine = { id: string; token: string; color: string };

/**
 * Tres sociedades en escalas distintas: sin `normalize` la de 90 puntos aplasta
 * a las otras dos. La leyenda la pone el consumidor, nunca la primitiva.
 */
export const NORMALIZED_LEGEND: readonly NormalizedLine[] = [
  { id: "Sociedad A", token: "--chart-score", color: "var(--chart-score)" },
  { id: "Sociedad B", token: "--chart-positive", color: "var(--chart-positive)" },
  { id: "Sociedad C", token: "--chart-negative", color: "var(--chart-negative)" },
];

const NORMALIZED_VALUES: readonly (readonly number[])[] = [
  [
    88.4, 88.9, 89.6, 89.1, 90.2, 90.8, 91.3, 90.6, 91.9, 92.4, 92.0, 92.8, 93.1, 92.6, 93.4, 93.9,
    94.2, 93.8, 94.6, 95.1, 94.7, 95.4, 95.9, 96.3,
  ],
  [
    52.6, 53.4, 52.1, 54.8, 56.2, 55.4, 57.9, 59.3, 58.6, 60.4, 62.1, 61.3, 63.8, 65.2, 64.4, 66.9,
    68.1, 67.3, 69.6, 71.2, 70.4, 72.8, 74.1, 75.6,
  ],
  [
    31.2, 30.4, 32.1, 31.6, 30.8, 29.4, 28.7, 29.9, 28.2, 27.1, 26.4, 27.6, 26.1, 25.3, 24.8, 25.6,
    24.2, 23.4, 22.9, 23.8, 22.6, 21.9, 21.2, 20.6,
  ],
];

export const NORMALIZED_SERIES: LineSeries[] = NORMALIZED_LEGEND.map((line, index) => ({
  id: line.id,
  color: line.color,
  points: NORMALIZED_VALUES[index].map((value, month) => ({
    month: CATALOG_MONTHS[month],
    value,
  })),
}));

/** Una variante de la fila de `Sparkline`: la serie y lo que demuestra. */
export type SparkCase = {
  id: string;
  props: string;
  token: string;
  points: readonly number[];
  dot?: boolean;
};

/**
 * El color de las tres primeras sale del signo del Δ, que resuelve `fmtDelta`
 * con su umbral de neutro de 0,5 puntos.
 */
export const SPARK_CASES: readonly SparkCase[] = [
  {
    id: "Δ positivo",
    props: "points",
    token: "--content-positive",
    points: [58.2, 58.9, 59.4, 60.8, 61.2, 62.6, 63.1, 64.4],
  },
  {
    id: "Δ negativo",
    props: "points",
    token: "--content-negative",
    points: [64.4, 63.8, 62.1, 61.6, 60.2, 58.9, 57.4, 56.1],
  },
  {
    id: "Δ neutro (|Δ| < 0,5)",
    props: "points",
    token: "--content-secondary",
    points: [61.2, 61.5, 60.9, 61.1, 61.4, 60.8, 61.0, 61.3],
  },
  {
    id: "Último punto marcado",
    props: "points, dot",
    token: "--content-positive",
    dot: true,
    points: [44.9, 46.2, 45.8, 48.1, 49.6, 51.2, 52.8, 54.3],
  },
];

/** Rango de score de la cartera, con el valor de la sociedad dentro. */
export const RANGE_CASE = {
  min: 0,
  max: 100,
  value: 62.4,
  labels: { min: "0 pts", max: "100 pts" },
};

/** Los tres tramos de `pillarTone`: bueno, aviso y malo. */
export const PILLAR_CASES: readonly { label: string; u: number; token: string }[] = [
  { label: "Liquidez", u: 0.72, token: "--content-positive" },
  { label: "Cobros", u: 0.52, token: "--content-alert" },
  { label: "Deuda", u: 0.31, token: "--content-negative" },
];

/** Dos contribuciones de signo opuesto; la escala es el máximo absoluto. */
export const CONTRIBUTION_CASES: readonly { label: string; points: number; token: string }[] = [
  { label: "Pagos", points: 3.4, token: "--content-positive" },
  { label: "Actividad", points: -2.1, token: "--content-negative" },
];

export const CONTRIBUTION_MAX_ABS = 3.4;

/** Tiles deterministas de un grupo: ni aleatoriedad ni fecha de por medio. */
function treemapTiles(prefix: string, count: number, step: number): TreemapDatum[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, "0")}`,
    size: 40_000 + ((index * step) % 17) * 12_000,
    color_value: Number(((((index * step) % 9) - 4) * 1.4).toFixed(1)),
  }));
}

/** Lienzo del treemap del catálogo: el layout reparte sobre medidas explícitas. */
export const TREEMAP_SIZE = { width: 560, height: 220 };

/** Cuarenta clientes en dos carteras: el caso grande del treemap. */
export const TREEMAP_GROUPS: readonly TreemapDatumGroup[] = [
  { id: "Cartera nacional", items: treemapTiles("ES", 20, 5) },
  { id: "Cartera exterior", items: treemapTiles("XX", 20, 3) },
];

/** Tooltip abierto y estático: el del hover no se puede mirar con calma. */
export const TOOLTIP_MONTH = CATALOG_MONTHS[CATALOG_MONTHS.length - 1];

export const TOOLTIP_ROWS: ChartTooltipRow[] = [
  { label: "estable", value: "58,6 pts", color: "var(--regime-stable)" },
  { label: "Sociedad B", value: "75,6 pts", color: "var(--chart-positive)" },
  { label: "Sociedad C", value: "20,6 pts", color: "var(--chart-negative)" },
];
