import { describe, expect, it } from "vitest";
import { fitCount } from "@/charts/treemap-fit";

/** Caja real de una columna del Mapa: 432 px de ancho repartidos en tres. */
const COLUMN_BOX = { width: 140, height: 300 };

/** Diez entidades con el nombre que hoy da el dataset y área igual por empresa. */
function companies(count: number, name?: (index: number) => string) {
  return Array.from({ length: count }, (_, index) => ({
    id: `COMP_${String(index + 1).padStart(4, "0")}`,
    name: name?.(index),
    size: 1,
  }));
}

describe("charts/treemap-fit", () => {
  it("DADO una columna real de 140 × 300 con diez entidades iguales CUANDO se mide ENTONCES caben las diez", () => {
    expect(fitCount(companies(10), COLUMN_BOX)).toBe(10);
  });

  it("DADO la misma columna a la mitad de alto CUANDO se mide ENTONCES bajan las que caben, no el nombre de ninguna", () => {
    expect(fitCount(companies(10), { width: 140, height: 150 })).toBe(6);
    // Menos sitio, nunca más fichas.
    expect(fitCount(companies(10), { width: 140, height: 120 })).toBeLessThan(6);
  });

  it("DADO nombres largos CUANDO no caben enteros en ningún tile ENTONCES queda una sola ficha, el suelo honesto", () => {
    const largas = companies(10, (index) => `Comercial Navarro y Cía. ${index}`);
    expect(fitCount(largas, COLUMN_BOX)).toBe(1);
    // Es el `name` lo que se mide: con el id corto en su lugar caben las diez.
    expect(fitCount(companies(10), COLUMN_BOX)).toBe(10);
  });

  it("DADO tamaños desiguales CUANDO la ficha menor se queda sin nombre ENTONCES caben menos que con tamaños iguales", () => {
    const desiguales = companies(10).map((item, index) => ({ ...item, size: 10 - index }));
    const cabenDesiguales = fitCount(desiguales, COLUMN_BOX);

    expect(cabenDesiguales).toBeLessThan(10);
    expect(cabenDesiguales).toBeGreaterThan(1);
  });

  it("DADO una caja degenerada o una columna vacía CUANDO se mide ENTONCES 0 sin items y nunca menos de 1 con ellos", () => {
    expect(fitCount([], COLUMN_BOX)).toBe(0);
    expect(fitCount([], { width: 0, height: 0 })).toBe(0);
    expect(fitCount(companies(10), { width: 0, height: 0 })).toBe(1);
    expect(fitCount(companies(1), { width: 4, height: 4 })).toBe(1);
  });
});
