/**
 * Medidas de la rejilla del tablero, en un solo sitio, y las conversiones puras
 * entre pixeles y celdas que necesita el lienzo.
 *
 * La fuente de verdad son los tokens de `index.css` (`--grid-cols`, `--grid-gap`,
 * `--grid-row`): el lienzo los pinta con `var()` y aqui se leen una sola vez con
 * `getComputedStyle` para traducir pixeles a celdas. Asi el CSS y el JS no pueden
 * discrepar. Los numeros de `FALLBACK` cubren el entorno sin hoja (jsdom), no son
 * una segunda fuente de verdad.
 */

/** Lo que dice `index.css` hoy. Solo se usa cuando no hay hoja que leer. */
const FALLBACK = { cols: 24, gap: 8, row: 31 };

/**
 * Padding del lienzo. Sigue en px: el sistema publica `--widget-padding` (relleno
 * del widget), pero ningun token para el margen interior del lienzo.
 */
export const GRID_PADDING = 16;

type Metrics = { cols: number; gap: number; row: number };

let metrics: Metrics | null = null;

function readNumber(styles: CSSStyleDeclaration | null, token: string, fallback: number): number {
  const value = Number.parseFloat(styles?.getPropertyValue(token) ?? "");
  return Number.isFinite(value) ? value : fallback;
}

/** Los tokens de la rejilla, resueltos una sola vez. */
export function gridMetrics(): Metrics {
  if (metrics) return metrics;
  const styles =
    typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  metrics = {
    cols: readNumber(styles, "--grid-cols", FALLBACK.cols),
    gap: readNumber(styles, "--grid-gap", FALLBACK.gap),
    row: readNumber(styles, "--grid-row", FALLBACK.row),
  };
  return metrics;
}

export type Cells = { x: number; y: number };

/** Ancho de una columna dado el ancho del lienzo (incluido su propio padding). */
export function columnWidth(containerWidth: number): number {
  const { cols, gap } = gridMetrics();
  const usable = containerWidth - GRID_PADDING * 2 - gap * (cols - 1);
  return Math.max(1, usable / cols);
}

/** Desplazamiento en celdas de un arrastre de `dx`/`dy` pixeles. */
export function pixelsToCells(dx: number, dy: number, colWidth: number): Cells {
  const { gap, row } = gridMetrics();
  return {
    x: Math.round(dx / (colWidth + gap)),
    y: Math.round(dy / (row + gap)),
  };
}

/** Colocacion de un item en la rejilla CSS (`grid-column` / `grid-row`). */
export function cellStyle(item: { x: number; y: number; w: number; h: number }): {
  gridColumn: string;
  gridRow: string;
} {
  return {
    gridColumn: `${item.x + 1} / span ${item.w}`,
    gridRow: `${item.y + 1} / span ${item.h}`,
  };
}
