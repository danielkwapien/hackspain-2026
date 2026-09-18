/**
 * Medidas de la rejilla del tablero, en un solo sitio, y las conversiones puras
 * entre pixeles y celdas que necesita el lienzo.
 *
 * Los valores viven aqui en px porque todavia no son token: XR-002 publicara
 * `--grid-cols`, `--grid-gap`, `--grid-row`, `--widget-padding` y `--size-topbar`
 * y entonces este fichero pasa a leerlos y nadie mas cambia.
 */

export const GRID_COLS = 24;
export const GRID_GAP = 8;
export const GRID_ROW_HEIGHT = 31;
export const GRID_PADDING = 16;
export const TOPBAR_HEIGHT = 60;

export type Cells = { x: number; y: number };

/** Ancho de una columna dado el ancho del lienzo (incluido su propio padding). */
export function columnWidth(containerWidth: number): number {
  const usable = containerWidth - GRID_PADDING * 2 - GRID_GAP * (GRID_COLS - 1);
  return Math.max(1, usable / GRID_COLS);
}

/** Desplazamiento en celdas de un arrastre de `dx`/`dy` pixeles. */
export function pixelsToCells(dx: number, dy: number, colWidth: number): Cells {
  return {
    x: Math.round(dx / (colWidth + GRID_GAP)),
    y: Math.round(dy / (GRID_ROW_HEIGHT + GRID_GAP)),
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
