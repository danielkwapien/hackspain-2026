/**
 * Partición del universo del Mapa en tres columnas semánticas.
 *
 * Aritmética pura, sin React: es la capa PREVIA al squarified. Decide a qué
 * columna va cada entidad, en qué orden se enseña dentro de la columna y qué
 * ancho recibe cada columna; `TreemapLayout` sigue repartiendo los tiles dentro
 * de cada caja, una llamada por columna.
 *
 * La columna se nombra por lo que significa —mejor, medio, peor sobre la
 * métrica elegida— y nunca por su color: el color lo pone el widget.
 */

export type ColumnKey = "better" | "middle" | "worse";

/** Centro de la métrica y semiancho de la banda que se considera «sin cambio». */
export type ColumnSplit = { neutral: number; threshold: number };

/** Entidad a repartir: `size` da el área, `value` decide la columna. */
export type ColumnDatum = { id: string; name?: string; size: number; value: number };

export type TreemapColumn = {
  key: ColumnKey;
  /** Ya recortada a `limit`, en el orden en que se pinta. */
  items: readonly ColumnDatum[];
  /** Censo COMPLETO de la columna, antes del recorte: de aquí sale el «y N más». */
  total: number;
};

/** Tope de entidades por columna con las tres columnas en fila. */
export const MAX_PER_COLUMN = 10;

/** Tope de entidades por columna cuando el widget apila las columnas. */
export const STACKED_PER_COLUMN = 5;

/** Suelo de ancho por columna: ninguna baja del 20 % del ancho disponible. */
export const MIN_COLUMN_SHARE = 0.2;

/**
 * Corte por métrica. Ninguno de los dos números es un gusto estético:
 *
 * - `score`: 50 ± 10 reproduce EXACTAMENTE la banda `watch` del motor, que va
 *   de 40 a 60 (`core/engine/config.py`, `BANDS`). La columna del medio es la
 *   vigilancia; por encima quedan `healthy`/`solid` y por debajo `stress`.
 * - `delta_1m` / `delta_3m`: 0 ± 1 punto. El neutro de un Δ es el 0, y 1 punto
 *   es el umbral a partir del cual un Δ ya significa algo: por debajo es ruido
 *   de redondeo del score y no merece cambiar de columna.
 */
export const COLUMN_SPLIT: Record<"delta_1m" | "delta_3m" | "score", ColumnSplit> = {
  delta_1m: { neutral: 0, threshold: 1 },
  delta_3m: { neutral: 0, threshold: 1 },
  score: { neutral: 50, threshold: 10 },
};

/**
 * Magnitud utilizable, con la misma regla que `TreemapLayout`: negativos, `NaN`
 * e infinitos cuentan como 0. Aquí además hace el orden total, y por tanto
 * determinista, aunque llegue un `size` sucio.
 */
function usableSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * Orden canónico dentro de la columna: `size` descendente, empate a distancia
 * del neutro descendente y empate final por `id`. El desempate explícito es lo
 * que hace la columna independiente del orden de entrada.
 */
function sortColumn(items: readonly ColumnDatum[], neutral: number): ColumnDatum[] {
  return [...items].sort((a, b) => {
    const bySize = usableSize(b.size) - usableSize(a.size);
    if (bySize !== 0) return bySize;
    const byDistance = Math.abs(b.value - neutral) - Math.abs(a.value - neutral);
    if (byDistance !== 0) return byDistance;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Reparte `items` en mejor / medio / peor por `split` y recorta cada columna a
 * `limit`, dejando su censo completo en `total`.
 *
 * Los límites exactos (`neutral ± threshold`) caen en el medio, y una entidad
 * sin métrica utilizable (`NaN`, `Infinity`) NO entra en ninguna columna ni
 * cuenta en ningún `total`: el widget las cuenta aparte y lo dice en su
 * subtítulo, que para eso el mapa no imputa valores que no tiene.
 */
export function splitColumns(
  items: readonly ColumnDatum[],
  split: ColumnSplit,
  limit = MAX_PER_COLUMN,
): readonly [TreemapColumn, TreemapColumn, TreemapColumn] {
  const buckets: Record<ColumnKey, ColumnDatum[]> = { better: [], middle: [], worse: [] };
  const upper = split.neutral + split.threshold;
  const lower = split.neutral - split.threshold;

  for (const item of items) {
    if (!Number.isFinite(item.value)) continue;
    if (item.value > upper) buckets.better.push(item);
    else if (item.value < lower) buckets.worse.push(item);
    else buckets.middle.push(item);
  }

  const take = Math.max(0, limit);
  const column = (key: ColumnKey): TreemapColumn => {
    const sorted = sortColumn(buckets[key], split.neutral);
    return { key, items: sorted.slice(0, take), total: sorted.length };
  };
  // Siempre las tres, en este orden, aunque alguna quede vacía.
  return [column("better"), column("middle"), column("worse")];
}

/**
 * Reparto a partes iguales que suma exactamente `width` y NUNCA devuelve un
 * ancho negativo: el píxel sobrante va a las primeras columnas, en vez de
 * repartir un redondeo por arriba y dejarle a la última la deuda (con cinco
 * columnas en 3 px eso daba `[1, 1, 1, 1, -1]`).
 */
function evenWidths(count: number, width: number): number[] {
  const base = Math.floor(width / count);
  const spare = width - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < spare ? 1 : 0));
}

/**
 * Ancho de cada columna: proporcional a su censo, nunca por debajo de
 * `minShare` del ancho total, nunca negativo y sumando EXACTAMENTE `width` (la
 * última absorbe el redondeo).
 *
 * El suelo existe porque una columna con dos entidades sigue teniendo que ser
 * legible: sin él, el 5 % del ancho deja tiles sin nombre. Se reserva primero el
 * suelo de todas y solo se reparte el sobrante, así que ninguna columna puede
 * bajar de él por mucho que otra concentre el censo.
 */
export function columnWidths(
  counts: readonly number[],
  width: number,
  minShare = MIN_COLUMN_SHARE,
): number[] {
  if (counts.length === 0) return [];
  if (!Number.isFinite(width) || width <= 0) return counts.map(() => 0);

  const base = Math.ceil(Math.max(0, minShare) * width);
  const spare = width - base * counts.length;
  const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
  // Ni cabe el suelo de todas, ni hay censo que repartir: partes iguales.
  if (spare < 0 || total <= 0) return evenWidths(counts.length, width);

  const widths = counts
    .slice(0, -1)
    .map((count) => base + Math.floor((spare * Math.max(0, count)) / total));
  const used = widths.reduce((sum, value) => sum + value, 0);
  // La última se queda con el resto: por construcción nunca baja del suelo,
  // porque los `floor` de las demás solo pueden dejarle de más.
  return [...widths, width - used];
}
