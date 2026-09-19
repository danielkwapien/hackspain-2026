import { describe, expect, it } from "vitest";
import {
  COLUMN_SPLIT,
  MAX_PER_COLUMN,
  MIN_COLUMN_SHARE,
  STACKED_PER_COLUMN,
  columnWidths,
  splitColumns,
  type ColumnDatum,
} from "@/charts/treemap-columns";

/** Universo pequeño con `score`: 62 y 61 arriba, 60 y 40 en el borde, 39 abajo. */
const SCORES: ColumnDatum[] = [
  { id: "d", size: 4, value: 39 },
  { id: "b", size: 2, value: 60 },
  { id: "a", size: 1, value: 62 },
  { id: "e", size: 5, value: 12 },
  { id: "c", size: 3, value: 40 },
  { id: "f", size: 6, value: 61 },
];

function idsOf(column: { items: readonly ColumnDatum[] }): string[] {
  return column.items.map((item) => item.id);
}

describe("charts/treemap-columns", () => {
  it("DADO una métrica CUANDO se pide su corte ENTONCES `score` reproduce la banda de vigilancia 40/60 y un Δ vale 0 ± 1 punto", () => {
    expect(COLUMN_SPLIT.score).toEqual({ neutral: 50, threshold: 10 });
    // 50 ± 10 = 40/60: los mismos cortes que `BANDS` en el motor.
    expect(COLUMN_SPLIT.score.neutral - COLUMN_SPLIT.score.threshold).toBe(40);
    expect(COLUMN_SPLIT.score.neutral + COLUMN_SPLIT.score.threshold).toBe(60);
    expect(COLUMN_SPLIT.delta_1m).toEqual({ neutral: 0, threshold: 1 });
    expect(COLUMN_SPLIT.delta_3m).toEqual({ neutral: 0, threshold: 1 });
    expect(MAX_PER_COLUMN).toBe(10);
    expect(STACKED_PER_COLUMN).toBe(5);
    expect(MIN_COLUMN_SHARE).toBe(0.2);
  });

  it("DADO un universo CUANDO se reparte por el corte ENTONCES cada item va a mejor/medio/peor y los límites exactos caen en el medio", () => {
    const [better, middle, worse] = splitColumns(SCORES, COLUMN_SPLIT.score);

    expect(better.key).toBe("better");
    expect(middle.key).toBe("middle");
    expect(worse.key).toBe("worse");

    expect(idsOf(better).sort()).toEqual(["a", "f"]);
    // 60 y 40 son los bordes exactos: vigilancia, no mejor ni peor.
    expect(idsOf(middle).sort()).toEqual(["b", "c"]);
    expect(idsOf(worse).sort()).toEqual(["d", "e"]);
  });

  it("DADO un item sin métrica CUANDO se reparte ENTONCES no entra en ninguna columna ni cuenta en ningún censo", () => {
    const items: ColumnDatum[] = [
      ...SCORES,
      { id: "nan", size: 9, value: Number.NaN },
      { id: "inf", size: 9, value: Number.POSITIVE_INFINITY },
      { id: "neginf", size: 9, value: Number.NEGATIVE_INFINITY },
    ];
    const columns = splitColumns(items, COLUMN_SPLIT.score);

    const placed = columns.flatMap((column) => idsOf(column));
    expect(placed).not.toContain("nan");
    expect(placed).not.toContain("inf");
    expect(placed).not.toContain("neginf");
    // El censo sigue siendo el de las seis con métrica: las otras las cuenta el widget.
    expect(columns.reduce((sum, column) => sum + column.total, 0)).toBe(SCORES.length);
  });

  it("DADO items en cualquier orden CUANDO se ordena la columna ENTONCES manda el tamaño, desempata la distancia al neutro y luego el `id`", () => {
    // `size_by=n_companies` da 1 a todo el mundo: el desempate es todo el orden.
    const flat: ColumnDatum[] = [
      { id: "z", size: 1, value: 70 },
      { id: "y", size: 1, value: 95 },
      { id: "x", size: 1, value: 70 },
      { id: "w", size: 2, value: 61 },
    ];
    const [better] = splitColumns(flat, COLUMN_SPLIT.score);
    // `w` es la mayor por tamaño pese a ser la más cercana al neutro; entre las
    // tres de tamaño 1, primero la más lejos del 50 y el empate lo rompe el id.
    expect(idsOf(better)).toEqual(["w", "y", "x", "z"]);

    // El orden de entrada no influye: mismo resultado con la lista invertida.
    const [reversed] = splitColumns([...flat].reverse(), COLUMN_SPLIT.score);
    expect(idsOf(reversed)).toEqual(idsOf(better));
  });

  it("DADO más items que sitio CUANDO se recorta ENTONCES `items` baja al límite y `total` sigue siendo el censo completo", () => {
    const many: ColumnDatum[] = Array.from({ length: 14 }, (_, i) => ({
      id: `COMP_${String(i).padStart(4, "0")}`,
      size: 14 - i,
      value: 80,
    }));

    const [porDefecto] = splitColumns(many, COLUMN_SPLIT.score);
    expect(porDefecto.items).toHaveLength(MAX_PER_COLUMN);
    expect(porDefecto.total).toBe(14);
    // El «y N más» del widget sale de esta resta, no de un campo publicado.
    expect(porDefecto.total - porDefecto.items.length).toBe(4);

    const [apilada] = splitColumns(many, COLUMN_SPLIT.score, STACKED_PER_COLUMN);
    expect(apilada.items).toHaveLength(STACKED_PER_COLUMN);
    expect(apilada.total).toBe(14);
    // Se recortan las menores: las cinco primeras son las de mayor tamaño.
    expect(idsOf(apilada)).toEqual(many.slice(0, 5).map((item) => item.id));
  });

  it("DADO un universo que no llena las tres columnas CUANDO se reparte ENTONCES salen las tres igual, en orden, y la vacía sin items ni censo", () => {
    const columns = splitColumns([{ id: "solo", size: 1, value: 3 }], COLUMN_SPLIT.delta_1m);

    expect(columns).toHaveLength(3);
    expect(columns.map((column) => column.key)).toEqual(["better", "middle", "worse"]);
    expect(idsOf(columns[0])).toEqual(["solo"]);
    expect(columns[1]).toMatchObject({ items: [], total: 0 });
    expect(columns[2]).toMatchObject({ items: [], total: 0 });

    // Sin items tampoco desaparece ninguna columna.
    expect(splitColumns([], COLUMN_SPLIT.score).map((column) => column.total)).toEqual([0, 0, 0]);
  });

  it("DADO tres censos desiguales CUANDO se reparte el ancho ENTONCES es proporcional, ninguna baja del suelo y la suma es exacta", () => {
    const width = 431;
    // El censo real del corte por empresa: 173 sanas, 480 en vigilancia, 177
    // en tensión (830 con score, umbral estricto sobre 60 y sobre 40).
    const widths = columnWidths([173, 480, 177], width);

    expect(widths.reduce((sum, value) => sum + value, 0)).toBe(width);
    for (const value of widths) {
      expect(value).toBeGreaterThanOrEqual(MIN_COLUMN_SHARE * width);
    }
    // Proporcional: la del censo mayor se lleva el ancho mayor.
    expect(widths[1]).toBeGreaterThan(widths[2]);
    expect(widths[2]).toBeGreaterThan(widths[0]);

    // Sin suelo, la columna pequeña se quedaría por debajo del 20 %.
    const sinSuelo = columnWidths([500, 1, 0], width, 0);
    expect(sinSuelo.reduce((sum, value) => sum + value, 0)).toBe(width);
    expect(sinSuelo[2]).toBeLessThan(MIN_COLUMN_SHARE * width);
    expect(columnWidths([500, 1, 0], width)[2]).toBeGreaterThanOrEqual(MIN_COLUMN_SHARE * width);
  });

  it("DADO un ancho o un censo degenerados CUANDO se reparte ENTONCES partes iguales sin censo y ceros sin ancho", () => {
    const iguales = columnWidths([0, 0, 0], 431);
    expect(iguales.reduce((sum, value) => sum + value, 0)).toBe(431);
    expect(Math.max(...iguales) - Math.min(...iguales)).toBeLessThanOrEqual(1);

    expect(columnWidths([1, 2, 3], 0)).toEqual([0, 0, 0]);
    expect(columnWidths([1, 2, 3], -50)).toEqual([0, 0, 0]);
    expect(columnWidths([], 431)).toEqual([]);

    // Más columnas que píxeles: reparto a partes iguales sin que ninguna salga
    // negativa. Antes la última absorbía el redondeo de las otras y daba -1.
    const apretadas = columnWidths([1, 1, 1, 1, 1], 3);
    expect(apretadas.reduce((sum, value) => sum + value, 0)).toBe(3);
    expect(Math.min(...apretadas)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...columnWidths([0, 0, 0, 0, 0, 0, 0], 4))).toBeGreaterThanOrEqual(0);
  });
});
