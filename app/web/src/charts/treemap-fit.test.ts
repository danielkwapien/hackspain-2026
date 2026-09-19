import { describe, expect, it } from "vitest";
import { fmtPoints } from "@/charts/format";
import { fitCount } from "@/charts/treemap-fit";

/**
 * Caja REAL de una columna del Mapa en el tablero fijo: el widget mide 432 × 338
 * (`w: 8` de 24 a 1440), a ese ancho las tres columnas se apilan y cada bloque
 * se queda con 432 × 71 (un tercio del alto menos cabecera y pie).
 */
const STACKED_BOX = { width: 432, height: 71 };

/** Caja de una columna en fila, con el panel ancho: 500 px de panel en tres. */
const ROW_BOX = { width: 161, height: 302 };

/** La cifra tal como la pinta el tile con la métrica `score`. */
const VALUE = fmtPoints(62.5);

/** Fichas con el código que da el dataset (`COMP_0001`, 9 caracteres) y área igual. */
function companies(count: number, id?: (index: number) => string) {
  return Array.from({ length: count }, (_, index) => ({
    id: id?.(index) ?? `COMP_${String(index + 1).padStart(4, "0")}`,
    size: 1,
    valueText: VALUE,
  }));
}

describe("charts/treemap-fit", () => {
  it("DADO la caja real de una columna apilada CUANDO se mide ENTONCES caben las cinco del tope", () => {
    expect(fitCount(companies(5), STACKED_BOX)).toBe(5);
  });

  it("DADO una columna en fila de un panel ancho CUANDO se mide ENTONCES caben las diez", () => {
    expect(fitCount(companies(10), ROW_BOX)).toBe(10);
  });

  it("DADO el suelo de legibilidad CUANDO es el código y no el nombre comercial ENTONCES la columna se llena", () => {
    // Exigir el nombre entero era imposible y por eso el mapa enseñaba tres
    // fichas de 830: «Comercial Navarro y Cía. S.L.U.» (31 caracteres) a 11 px
    // en negrita pide 239 px de ficha y la columna entera mide 161. El código
    // (9 caracteres, 69 px) sí entra, y es lo que se garantiza; el nombre se
    // pinta truncado encima de ese suelo.
    expect(fitCount(companies(10), ROW_BOX)).toBe(10);

    // Un código que NO entra entero sí recorta: el suelo se sigue respetando.
    expect(fitCount(companies(10, (index) => `COMP_CONSOLIDADO_${index}`), ROW_BOX)).toBeLessThan(10);

    // Y una columna demasiado estrecha para dos fichas por fila con su código
    // baja sola: a 138 px el squarified reparte fichas de 69 y no caben diez.
    expect(fitCount(companies(10), { width: 138, height: 302 })).toBeLessThan(10);
  });

  it("DADO una ficha donde la cifra no cabe de ancho CUANDO se mide ENTONCES no se declara legible", () => {
    // 40 × 56 en dos fichas deja 40 × 28: el código «X0» entra y el alto da para
    // dos líneas, pero «62,5 pts» mide 49,3 px y el hueco útil son 32. El tile
    // la escondería, así que este reparto no es legible y se baja a una.
    const estrechas = companies(2, (index) => `X${index}`);
    expect(fitCount(estrechas, { width: 40, height: 56 })).toBe(1);

    // Sin cifra que pintar, el mismo reparto sí cabe: lo que estorba es su ancho.
    const sinCifra = estrechas.map((item) => ({ ...item, valueText: "" }));
    expect(fitCount(sinCifra, { width: 40, height: 56 })).toBe(2);
  });

  it("DADO tamaños desiguales CUANDO la ficha menor se queda sin sitio ENTONCES caben menos que con tamaños iguales", () => {
    const desiguales = companies(10).map((item, index) => ({ ...item, size: 10 - index }));
    const cabenDesiguales = fitCount(desiguales, ROW_BOX);

    expect(cabenDesiguales).toBeLessThan(10);
    expect(cabenDesiguales).toBeGreaterThan(1);
  });

  it("DADO una caja degenerada o una columna vacía CUANDO se mide ENTONCES 0 sin items y nunca menos de 1 con ellos", () => {
    expect(fitCount([], ROW_BOX)).toBe(0);
    expect(fitCount([], { width: 0, height: 0 })).toBe(0);
    expect(fitCount(companies(10), { width: 0, height: 0 })).toBe(1);
    expect(fitCount(companies(1), { width: 4, height: 4 })).toBe(1);
  });
});
