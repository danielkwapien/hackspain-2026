import { describe, expect, it } from "vitest";
import type { LinePoint } from "@/charts/LineNoAxes";
import { peakLabels } from "@/charts/peak-labels";
import { monthsEndingAt } from "@/test/examples";

/** Serie de N meses con los valores dados, en orden. */
function series(values: readonly number[]): LinePoint[] {
  const months = monthsEndingAt("2026-08", values.length);
  return values.map((value, index) => ({ month: months[index], value }));
}

function months(points: readonly LinePoint[]): string[] {
  return points.map((point) => point.month);
}

/**
 * Trece meses con dos extremos claros: un valle profundo en el mes 4 (40,0) y una
 * cima en el mes 9 (86,0); termina en 70,0. Media ≈ 64,6.
 */
const SHAPE = series([66, 62, 55, 46, 40, 48, 61, 74, 82, 86, 78, 72, 70]);

describe("peakLabels", () => {
  it("con presupuesto 0 no devuelve nada, ni siquiera el valor actual", () => {
    // La Comparativa superpone dos series y no pasa `peaks`: cero burbujas, o la
    // cifra no diría a cuál de las dos líneas pertenece.
    expect(peakLabels(SHAPE, 0)).toEqual([]);
    expect(peakLabels(SHAPE, -1)).toEqual([]);
    expect(peakLabels([], 3)).toEqual([]);
  });

  it("elige los extremos más prominentes y los devuelve en orden de mes", () => {
    const labelled = peakLabels(SHAPE, 2);
    // El valle y la cima son lo que más se aleja de la media; el último punto entra
    // aparte del presupuesto porque es el valor de hoy.
    expect(months(labelled)).toEqual(["2025-12", "2026-05", "2026-08"]);
    expect(labelled.map((point) => point.value)).toEqual([40, 86, 70]);
  });

  it("el presupuesto cuenta picos: el valor de hoy va aparte", () => {
    // 3 picos + el corte, nunca más: con trece meses eso ya es una burbuja cada tres.
    const labelled = peakLabels(SHAPE, 3);
    expect(labelled).toHaveLength(4);
    expect(months(labelled).at(-1)).toBe("2026-08");
  });

  it("respeta el presupuesto: con 1 se queda el más prominente", () => {
    const labelled = peakLabels(SHAPE, 1);
    // 40,0 se aleja 24,6 de la media y 86,0 se aleja 21,4: gana el valle.
    expect(months(labelled)).toEqual(["2025-12", "2026-08"]);
  });

  it("descarta el punto medio que no es extremo local en su ventana de ±2 meses", () => {
    const labelled = peakLabels(SHAPE, 3);
    // 61 (mes 6) está entre el valle y la cima: sube, pero no es extremo de nada.
    expect(months(labelled)).not.toContain("2026-02");
  });

  it("no etiqueta dos puntos a menos de un 12 % del ancho", () => {
    // Dos valles pegados (índices 5 y 6 de 13 meses: 8 % del ancho) y una cima lejos.
    const tight = series([70, 68, 66, 64, 60, 30, 31, 60, 64, 90, 70, 68, 66]);
    const labelled = peakLabels(tight, 3);
    expect(months(labelled)).toContain("2026-01");
    expect(months(labelled)).not.toContain("2026-02");
    // El hueco liberado lo ocupa la cima, que sí está separada.
    expect(months(labelled)).toContain("2026-05");
  });

  it("el último punto entra aunque no sea un pico, y no se repite si ya lo era", () => {
    const rising = series([40, 45, 52, 58, 63, 69, 74, 80]);
    const labelled = peakLabels(rising, 2);
    expect(months(labelled).at(-1)).toBe("2026-08");
    // Una sola burbuja por mes: el máximo final ya estaba elegido.
    expect(new Set(months(labelled)).size).toBe(labelled.length);
  });

  it("un tramo llano no es un pico, por lejos que esté de la media", () => {
    // La Liquidez de COMP_0169: un año plana en 7 pts y luego un salto a 41,8. El
    // tramo llano está a 15 pts de la media de lo visible, así que por prominencia
    // ganaba; pero sus vaivenes son de 0,3 pts y tres burbujas seguidas diciendo
    // «7,2 · 7,5 · 6,8» no informan de nada.
    const flat = series([7.2, 7.0, 7.3, 7.5, 7.1, 6.8, 7.0, 7.2, 12.4, 22.1, 31.0, 37.6, 41.8]);
    const labelled = peakLabels(flat, 3);
    expect(months(labelled)).toEqual(["2026-08"]);
    expect(labelled[0].value).toBe(41.8);
  });

  it("el pico pegado al valor de hoy se cae, no al revés", () => {
    // 24 meses: la cima absoluta es el penúltimo, a un 4 % del ancho del final.
    const spike = series([
      60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 95,
      94,
    ]);
    const labelled = peakLabels(spike, 1);
    // 95,0 es más prominente que el corte, pero el corte es el valor de hoy y la
    // ficha no puede dejar de enseñarlo: el que sobra es el pico.
    expect(months(labelled)).toContain("2026-08");
    expect(months(labelled)).not.toContain("2026-07");
  });
});
