import { describe, expect, it } from "vitest";
import { showsLabel, tileFontSize, truncateLabel } from "@/charts/treemap-label";

/** Ancho medio de un carácter de Inter en em: el mismo que usa `truncateLabel` por defecto. */
const AVG_CHAR_EM = 0.56;

describe("charts/treemap-label", () => {
  it("DADO el área de un tile CUANDO se pide el cuerpo ENTONCES 16 desde 20 000 px², 13 desde 8 000 y 11 por debajo", () => {
    // Trade Republic: ticker 700 en 16/13/11 px según el área del tile.
    expect(tileFontSize(108_000)).toBe(16);
    expect(tileFontSize(20_000)).toBe(16);
    expect(tileFontSize(19_999)).toBe(13);
    expect(tileFontSize(8_000)).toBe(13);
    expect(tileFontSize(7_999)).toBe(11);
    expect(tileFontSize(120)).toBe(11);
    expect(tileFontSize(0)).toBe(11);
  });

  it("DADO un nombre y un ancho CUANDO no cabe ENTONCES se corta con «…» sin pasarse del ancho", () => {
    expect(truncateLabel("Alpha", 100, 13)).toBe("Alpha");
    expect(truncateLabel("", 100, 13)).toBe("");

    const name = "Comercial Navarro y Cia. S.L.";
    const cut = truncateLabel(name, 100, 13);
    expect(cut).not.toBe(name);
    expect(cut.endsWith("…")).toBe(true);
    // Estimación: 13 px × 0,56 em = 7,28 px por carácter → caben 13 con la elipsis.
    expect(cut.length * 13 * AVG_CHAR_EM).toBeLessThanOrEqual(100);
    expect(cut).toBe("Comercial Na…");
    // Con más sitio, más nombre; sin recortar por debajo de lo que cabe.
    expect(truncateLabel(name, 400, 13)).toBe(name);
    expect(truncateLabel(name, 100, 13).length).toBeLessThan(truncateLabel(name, 150, 13).length);

    // El ancho medio por carácter es un parámetro: con 1 em caben `width / fontSize` caracteres.
    expect(truncateLabel("Alpha", 20, 10, 1)).toBe("A…");
  });

  it("DADO un rect y un cuerpo CUANDO se decide la etiqueta ENTONCES nombre y valor desde 2,4·fontSize, solo nombre desde 1,3·fontSize y nada por debajo", () => {
    // Alto sobrado y ancho sobrado: nombre y valor.
    expect(showsLabel({ width: 200, height: 40 }, 16)).toEqual({ name: true, value: true });
    expect(showsLabel({ width: 200, height: 2.4 * 13 }, 13)).toEqual({ name: true, value: true });
    // Entre 1,3 y 2,4 cuerpos de alto: solo el nombre.
    expect(showsLabel({ width: 200, height: 2.4 * 13 - 0.5 }, 13)).toEqual({ name: true, value: false });
    expect(showsLabel({ width: 200, height: 1.3 * 11 }, 11)).toEqual({ name: true, value: false });
    // Por debajo de 1,3 cuerpos no cabe nada: el tile va sin texto (nunca recortado).
    expect(showsLabel({ width: 200, height: 1.3 * 11 - 0.5 }, 11)).toEqual({ name: false, value: false });
    // Un tile de 4 px de ancho tampoco lleva texto aunque sea alto.
    expect(showsLabel({ width: 4, height: 30 }, 11)).toEqual({ name: false, value: false });
  });
});
