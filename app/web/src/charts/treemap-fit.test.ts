import { describe, expect, it } from "vitest";
import { fmtPoints } from "@/charts/format";
import { MAX_PER_COLUMN, columnWidths } from "@/charts/treemap-columns";
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

/**
 * Anchos de panel que el Mapa recorre de verdad: 400 px es el hueco del
 * tablero fijo (432 × 338, redondeando a la baja) y 900 px el del panel
 * maximizado en un portátil. El widget apila por debajo de 500 px, así que el
 * barrido cruza los dos modos.
 */
const PANEL_WIDTHS = Array.from({ length: 21 }, (_, index) => 400 + index * 25);

/** Proporción medida del hueco del Mapa en el tablero fijo (432 × 338). */
const PANEL_RATIO = 338 / 432;

/** Hueco entre columnas (`gap-2`), cabecera y pie de columna, en px. */
const COLUMN_GAP = 8;
const COLUMN_CHROME = 36;

/** Por debajo de este ancho el widget apila y baja el tope a cinco. */
const STACK_WIDTH = 500;

/** Censo real del corte por empresa: 207 sanas, 446 en vigilancia, 177 en tensión. */
const CENSUS = [207, 446, 177];

/**
 * Pendiente de cobro real dentro de UNA columna, en euros: de 75,7 M la mayor a
 * 7,8 M la décima. Las magnitudes del Mapa son MUY desiguales y eso es lo que
 * hace que el squarified reparta fichas de tamaños muy distintos en la misma
 * caja; con áreas iguales el bug no se ve.
 */
const PENDING_EUR = [
  75_700_000, 48_200_000, 31_400_000, 22_900_000, 18_100_000, 14_600_000, 12_300_000, 10_500_000,
  9_100_000, 7_800_000,
];

/** Nombres comerciales como los del dataset: largos, que el tile trunca sobre el código. */
const NAMES = [
  "Comercial Navarro y Cía. S.L.U.",
  "Distribuciones Peninsulares S.A.",
  "Logística Integral del Ebro S.L.",
  "Suministros Industriales Vega",
  "Talleres Mecánicos Arrieta S.L.",
  "Agroalimentaria del Sur S.A.U.",
  "Construcciones Bahía Norte S.L.",
  "Editorial Castellana Unida S.A.",
  "Servicios Portuarios Levante",
  "Química Aplicada Ibérica S.L.U.",
];

/** El top-10 de una columna: código del dataset, nombre largo y pendiente desigual. */
function pendingColumn() {
  return PENDING_EUR.slice(0, MAX_PER_COLUMN).map((size, index) => ({
    id: `COMP_${String(index + 1).padStart(4, "0")}`,
    name: NAMES[index],
    size,
    valueText: VALUE,
  }));
}

/**
 * Las tres cajas de columna que el widget calcula para un panel de ese ancho.
 * El panel crece en las dos dimensiones, que es lo que hace de verdad al
 * agrandarlo o maximizarlo: el hueco del Mapa guarda su proporción.
 */
function columnBoxes(panel: number) {
  const panelHeight = Math.round(panel * PANEL_RATIO);
  const stacked = panel < STACK_WIDTH;
  const block = stacked ? Math.floor((panelHeight - COLUMN_GAP * 2) / 3) : panelHeight;
  const height = block - COLUMN_CHROME;
  const widths = stacked ? CENSUS.map(() => panel) : columnWidths(CENSUS, panel - COLUMN_GAP * 2);
  return widths.map((width) => ({ width, height }));
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

  it("DADO una caja que crece CUANDO se mide el barrido de anchos del widget ENTONCES nunca caben MENOS fichas", () => {
    // La propiedad que se rompió: agrandar el Mapa hacía DESAPARECER fichas.
    // Medido en el navegador con `pending_eur`, un panel de 537 px daba
    // 3 + 6 + 3 = 12 fichas y uno de 571 px, más ancho, solo 2 + 5 + 2 = 9. El
    // culpable era el cuerpo por área: al bajar `n` las fichas crecen,
    // `tileFontSize` sube el cuerpo a 13 o 16 px, un cuerpo mayor pide más
    // ancho por carácter, el código deja de caber y el candidato se rechaza.
    // Si la caja crece, `fitCount` NO puede devolver menos: quien agranda el
    // panel no pierde información.
    //
    // El barrido crece en las DOS dimensiones (el panel guarda su proporción),
    // que es el caso del usuario que agranda o maximiza. Ensanchar SOLO a lo
    // ancho sigue sin ser monótono y no es el cuerpo: con el alto clavado, la
    // caja de la columna pasa de estrecha y alta a cuadrada, el squarified
    // gira las últimas filas y saca fichas estrechas y altas (69 × 114 en vez
    // de 111 × 69) donde el código ya no entra. Eso vive en `TreemapLayout`,
    // que esta feature no toca.
    // Una columna a lo largo del barrido: la misma, con el panel más grande.
    const sweep = CENSUS.map((_, column) =>
      PANEL_WIDTHS.map((panel) => {
        const box = columnBoxes(panel)[column];
        return { panel, box, count: fitCount(pendingColumn(), box) };
      }),
    );

    const breaks = sweep.flatMap((column) =>
      column.flatMap((grown, after) =>
        column.slice(0, after).flatMap((before) =>
          // Al apilarse, la caja se ensancha pero pierde alto: esas dos no son
          // comparables y la propiedad no dice nada de ellas.
          grown.box.width >= before.box.width &&
          grown.box.height >= before.box.height &&
          grown.count < before.count
            ? [
                `panel ${before.panel} da ${before.count} fichas en ${before.box.width}×${before.box.height} y panel ${grown.panel}, más grande (${grown.box.width}×${grown.box.height}), solo ${grown.count}`,
              ]
            : [],
        ),
      ),
    );

    expect(breaks).toEqual([]);
    // Y el barrido sirve de algo: en algún punto el Mapa gana fichas.
    expect(Math.max(...sweep[1].map((step) => step.count))).toBeGreaterThan(
      sweep[1][0].count,
    );
  });

  it("DADO una caja degenerada o una columna vacía CUANDO se mide ENTONCES 0 sin items y nunca menos de 1 con ellos", () => {
    expect(fitCount([], ROW_BOX)).toBe(0);
    expect(fitCount([], { width: 0, height: 0 })).toBe(0);
    expect(fitCount(companies(10), { width: 0, height: 0 })).toBe(1);
    expect(fitCount(companies(1), { width: 4, height: 4 })).toBe(1);
  });
});
