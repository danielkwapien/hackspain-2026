/**
 * Medidas de la rejilla del tablero, en un solo sitio, y las conversiones puras
 * entre píxeles y celdas que necesita el lienzo.
 *
 * Columnas y hueco salen de los tokens de `index.css` (`--grid-cols`, `--grid-gap`):
 * el lienzo los pinta con `var()` y aquí se leen una sola vez con `getComputedStyle`,
 * así el CSS y el JS no pueden discrepar. La altura de fila NO es un token: se
 * calcula desde el alto del lienzo para que las 24 filas llenen la página, como en
 * Trade Republic, y el lienzo la escribe inline en `--grid-row`. Los números de
 * `FALLBACK` cubren el entorno sin hoja (jsdom), no son una segunda fuente de verdad.
 */

import { GRID_COLUMNS, GRID_ROWS } from "./types";

/** Lo que dice `index.css` hoy. Solo se usa cuando no hay hoja que leer. */
const FALLBACK = { cols: GRID_COLUMNS, gap: 8 };

/**
 * Padding del lienzo. Sigue en px: el sistema publica `--widget-padding` (relleno
 * del widget), pero ningún token para el margen interior del lienzo.
 */
export const GRID_PADDING = 16;

/** Por debajo de esto la fila no cabe ni una línea de texto: el lienzo scrollea. */
export const MIN_ROW_HEIGHT = 20;

type Metrics = { cols: number; gap: number };

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

/** Alto de una fila para que las 24 quepan en el alto del lienzo, nunca bajo el mínimo. */
export function rowHeight(containerHeight: number): number {
  const { gap } = gridMetrics();
  const usable = containerHeight - GRID_PADDING * 2 - gap * (GRID_ROWS - 1);
  return Math.max(MIN_ROW_HEIGHT, Math.floor(usable / GRID_ROWS));
}

/** Desplazamiento en celdas de un arrastre de `dx`/`dy` píxeles (celda = medida + hueco). */
export function pixelsToCells(dx: number, dy: number, colWidth: number, rowPx: number): Cells {
  const { gap } = gridMetrics();
  return {
    x: Math.round(dx / (colWidth + gap)),
    y: Math.round(dy / (rowPx + gap)),
  };
}

/** Colocación de un item en la rejilla CSS (`grid-column` / `grid-row`). */
export function cellStyle(item: { x: number; y: number; w: number; h: number }): {
  gridColumn: string;
  gridRow: string;
} {
  return {
    gridColumn: `${item.x + 1} / span ${item.w}`,
    gridRow: `${item.y + 1} / span ${item.h}`,
  };
}
