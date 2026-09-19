import { describe, expect, it } from "vitest";
import {
  GRID_PADDING,
  MIN_ROW_HEIGHT,
  cellStyle,
  columnWidth,
  pixelsToCells,
  rowHeight,
} from "./grid-math";

describe("grid", () => {
  it("rowHeight fills 24 rows in the height: 840 → 26, 600 → floor 20", () => {
    expect(GRID_PADDING).toBe(16);
    expect(MIN_ROW_HEIGHT).toBe(20);
    // (840 − 32 − 8·23) / 24 = 26: lo que mide Trade Republic a 900 px de alto.
    expect(rowHeight(840)).toBe(26);
    // (600 − 32 − 184) / 24 = 16: por debajo del mínimo, se queda en 20.
    expect(rowHeight(600)).toBe(20);
    expect(rowHeight(0)).toBe(20);
  });

  it("columnWidth(800) is (800 − 32 − 8·23) / 24 ≈ 24,33", () => {
    expect(columnWidth(800)).toBeCloseTo(24.33, 2);
    // Nunca 0: en jsdom el lienzo mide 0 px y aun así hay una columna de 1 px.
    expect(columnWidth(0)).toBe(1);
  });

  it("pixelsToCells rounds a drag to whole cells using the measured column and row", () => {
    const col = columnWidth(800);
    const row = rowHeight(600);
    // 5 columnas exactas y 2 filas exactas (celda = medida + gap 8).
    expect(pixelsToCells(5 * (col + 8), 2 * (row + 8), col, row)).toEqual({ x: 5, y: 2 });
    // Menos de media celda no mueve; más de media, sí.
    expect(pixelsToCells(10, 10, col, row)).toEqual({ x: 0, y: 0 });
    expect(pixelsToCells(20, 20, col, row)).toEqual({ x: 1, y: 1 });
    // Hacia atrás, con signo.
    expect(pixelsToCells(-3 * (col + 8), -(row + 8), col, row)).toEqual({ x: -3, y: -1 });
  });

  it("cellStyle maps cells to grid-column / grid-row, 1-based with span", () => {
    expect(cellStyle({ x: 0, y: 0, w: 12, h: 24 })).toEqual({
      gridColumn: "1 / span 12",
      gridRow: "1 / span 24",
    });
    expect(cellStyle({ x: 12, y: 14, w: 12, h: 10 })).toEqual({
      gridColumn: "13 / span 12",
      gridRow: "15 / span 10",
    });
  });
});
