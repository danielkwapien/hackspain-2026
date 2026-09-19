import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fmtSizeShort } from "@/charts";
import type { ColumnDatum } from "@/charts";
import { TreemapColumns } from "@/widgets/treemap/TreemapColumns";

/** El hueco real del Mapa en el tablero: 432 × 338 px medidos. */
const WIDTH = 432;
const HEIGHT = 338;

/**
 * Nombres con la longitud REAL del dataset: de 15 a 35 caracteres, mediana 23.
 * Ninguna empresa se llama «E1»: con nombres de dos letras cabe todo y el test
 * no mide nada.
 */
const NAMES = [
  "Comercial Navarro y Cia. S.L.U.",
  "Industrias Olmedo y Cia. S.L.",
  "Alimentaria Zubiri S.A.",
  "Talleres Iranzo y Cia. S.L.",
  "Hermanos Arga y Cia. S.L.",
  "Construcciones Fuentes S.A.",
  "Suministros Arga S.A.",
  "Distribuciones Arga S.A.",
  "Construcciones Ulzama S.A.",
  "Transportes Ribera del Ebro",
];

/** Empresas de igual tamaño (el corte de hoy es `n_companies`) con la métrica dada. */
function companies(base: number, count: number, value: number): ColumnDatum[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `COMP_${String(base + index).padStart(4, "0")}`,
    name: NAMES[(base + index) % NAMES.length],
    size: 1,
    value,
  }));
}

/**
 * Texto con el espacio fino del contrato visual: `getByText` compara contra el
 * texto ya normalizado, donde U+2009 se ha vuelto un espacio normal.
 */
function thin(expected: string): RegExp {
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s/g, "\\s");
  return new RegExp(`^${escaped}$`);
}

/** Las mismas empresas con una magnitud de verdad en el área. */
function withSize(items: ColumnDatum[], size: number): ColumnDatum[] {
  return items.map((item) => ({ ...item, size }));
}

/** Las tres columnas, en el orden en que se pintan. */
function columnsOf(container: HTMLElement): HTMLElement[] {
  return [...(container.firstElementChild?.children ?? [])] as HTMLElement[];
}

function tilesOf(column: HTMLElement): HTMLElement[] {
  return within(column).queryAllByRole("button");
}

describe("widgets/treemap/TreemapColumns", () => {
  it("DADO el score CUANDO se pinta ENTONCES las columnas se titulan por banda, y con un Δ por dirección", () => {
    const items = [...companies(1, 6, 72), ...companies(100, 4, 52), ...companies(200, 2, 31)];
    const { container, rerender } = render(
      <TreemapColumns items={items} metric="score" width={WIDTH} height={HEIGHT} />,
    );

    // Un score es un nivel, no una dirección: el vocabulario es el de la banda.
    expect(columnsOf(container).map((column) => column.textContent)).toEqual([
      expect.stringContaining("Sanas"),
      expect.stringContaining("Vigilancia"),
      expect.stringContaining("Tensión"),
    ]);
    // El censo de cada columna, tabular y junto a su título.
    expect(
      columnsOf(container).map((column) => within(column).getAllByText(/^\d+$/)[0].textContent),
    ).toEqual(["6", "4", "2"]);
    // Nunca se nombra una columna por su color, y el panel no lleva leyenda.
    for (const banned of ["Verde", "Rojo", "verde", "rojo"]) {
      expect(container.textContent).not.toContain(banned);
    }

    const deltas = [...companies(1, 3, 2.5), ...companies(100, 2, 0.2), ...companies(200, 4, -3)];
    rerender(<TreemapColumns items={deltas} metric="delta_3m" width={WIDTH} height={HEIGHT} />);

    expect(columnsOf(container).map((column) => column.textContent)).toEqual([
      expect.stringContaining("Mejorando"),
      expect.stringContaining("Estable"),
      expect.stringContaining("Deteriorando"),
    ]);
  });

  it("DADO más empresas de las que caben legibles CUANDO se pinta ENTONCES el pie dice cuántas quedan fuera", () => {
    const items = [...companies(1, 24, 72), ...companies(100, 3, 52)];
    const { container } = render(
      <TreemapColumns items={items} metric="score" width={WIDTH} height={HEIGHT} />,
    );
    const [sanas, vigilancia] = columnsOf(container);

    // El tope es diez por columna, y `fitCount` puede bajarlo: lo que no cabe
    // legible no se pinta diminuto, se cuenta.
    const shown = tilesOf(sanas).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(10);
    expect(sanas.textContent).toContain(`y ${24 - shown} más`);
    expect(within(sanas).getByText(String(24 - shown))).toHaveClass("num");

    // Si no sobra nadie no hay pie, pero las tres columnas siguen midiendo lo mismo.
    expect(tilesOf(vigilancia)).toHaveLength(3);
    expect(vigilancia.textContent).not.toContain("más");
    expect(sanas.getBoundingClientRect().height).toBe(vigilancia.getBoundingClientRect().height);
  });

  it("DADO una columna sin empresas CUANDO se pinta ENTONCES sigue en su sitio con su título y su texto de vacío", () => {
    const items = companies(1, 5, 72);
    const { container } = render(
      <TreemapColumns items={items} metric="score" width={WIDTH} height={HEIGHT} />,
    );
    const [sanas, vigilancia, tension] = columnsOf(container);

    expect(tilesOf(sanas)).toHaveLength(5);
    for (const empty of [vigilancia, tension]) {
      expect(tilesOf(empty)).toHaveLength(0);
      expect(within(empty).getByText("Sin empresas")).toBeInTheDocument();
    }
    // Las tres posiciones no bailan: sin esto, «Tensión» ocuparía el sitio de «Vigilancia».
    expect(vigilancia.textContent).toContain("Vigilancia");
    expect(tension.textContent).toContain("Tensión");
  });

  it("DADO la caja real y nombres reales CUANDO se pinta ENTONCES cada columna enseña cinco fichas y todas llevan nombre y cifra", () => {
    // El test que faltaba: 432 × 338 es el hueco REAL del Mapa en el tablero
    // fijo y estos nombres miden lo que miden los del dataset. Con el suelo
    // puesto en el nombre entero, aquí caía una sola ficha por columna.
    const items = [...companies(1, 14, 72), ...companies(100, 9, 47), ...companies(200, 6, 28)];
    const { container } = render(
      <TreemapColumns items={items} metric="score" width={WIDTH} height={HEIGHT} />,
    );

    const columns = columnsOf(container);
    expect(columns).toHaveLength(3);
    for (const column of columns) {
      expect(tilesOf(column).length).toBeGreaterThanOrEqual(5);
      expect(tilesOf(column).length).toBeLessThanOrEqual(10);
    }

    const tiles = screen.getAllByRole("button");
    expect(tiles.length).toBeGreaterThanOrEqual(15);
    for (const tile of tiles) {
      const shown = tile.querySelector<HTMLElement>(".font-bold")?.textContent ?? "";
      const value = tile.querySelector<HTMLElement>(".num")?.textContent ?? "";
      // Ni ficha muda ni ficha sin cifra: eso es lo que decide `fitCount`.
      expect(shown).not.toBe("");
      expect(value).not.toBe("");
      // El nombre puede salir truncado —el suelo garantizado es el código—,
      // pero el trozo que se lee es el principio del nombre de verdad.
      const full = tile.getAttribute("aria-label") ?? "";
      expect(full.startsWith(shown.replace("\u2026", ""))).toBe(true);
    }
  });

  it("DADO poco ancho CUANDO se pinta ENTONCES las columnas se apilan y ninguna pasa de cinco fichas", () => {
    const items = [...companies(1, 14, 72), ...companies(100, 9, 47)];
    const { container } = render(
      <TreemapColumns items={items} metric="score" width={320} height={520} />,
    );

    const columns = columnsOf(container);
    expect(columns).toHaveLength(3);
    for (const column of columns) {
      expect(tilesOf(column).length).toBeLessThanOrEqual(5);
      // Apiladas, cada columna ocupa el ancho entero.
      expect(column.style.width).toBe("320px");
    }
    // Lo que no cabe se cuenta, y la cuenta cuadra con lo que se enseña.
    const shown = tilesOf(columns[0]).length;
    expect(shown).toBeGreaterThan(0);
    expect(columns[0].textContent).toContain(`y ${14 - shown} más`);
  });

  it("DADO una magnitud en euros CUANDO se pinta ENTONCES cada cabecera dice el total de SU CENSO, no el de las fichas que caben", () => {
    const items = [
      ...withSize(companies(1, 24, 72), 1_000_000),
      ...withSize(companies(100, 3, 52), 500_000),
    ];
    const { container } = render(
      <TreemapColumns
        items={items}
        metric="score"
        sizeBy="pending_eur"
        width={WIDTH}
        height={HEIGHT}
      />,
    );
    const [sanas, vigilancia, tension] = columnsOf(container);

    // «24 M € pendientes con empresas sanas» es la frase; el censo dice
    // cuántas y esto dice cuánto. Una magnitud en euros lleva su moneda.
    expect(within(sanas).getByText(thin(fmtSizeShort(24_000_000, "EUR")))).toHaveClass("num");
    expect(within(vigilancia).getByText(thin(fmtSizeShort(1_500_000, "EUR")))).toBeInTheDocument();

    // El total NO es el de las diez que se pintan: eso sería responder a una
    // pregunta que nadie ha hecho.
    const shown = tilesOf(sanas).length;
    expect(shown).toBeLessThan(24);
    expect(container.textContent).not.toContain(fmtSizeShort(shown * 1_000_000, "EUR"));

    // Una columna sin nadie no tiene total que decir.
    expect(tension.textContent).not.toContain("EUR");
  });

  it("DADO empresas que no caben CUANDO hay magnitud ENTONCES el pie dice cuánto dinero se queda fuera", () => {
    const items = withSize(companies(1, 24, 72), 1_000_000);
    const { container } = render(
      <TreemapColumns
        items={items}
        metric="score"
        sizeBy="pending_eur"
        width={WIDTH}
        height={HEIGHT}
      />,
    );
    const [sanas] = columnsOf(container);
    const shown = tilesOf(sanas).length;
    const rest = 24 - shown;
    expect(rest).toBeGreaterThan(0);

    // «y 19 más» no dice si lo que no se pinta son cuatro euros o 19 millones.
    // Con la magnitud ya calculada, el pie cierra la promesa del widget: lo
    // que no se pinta se cuenta, en empresas Y en dinero.
    const footer = sanas.lastElementChild as HTMLElement;
    expect(footer.textContent).toContain(`y ${rest} más`);
    const money = within(footer).getByText(thin(fmtSizeShort(rest * 1_000_000, "EUR")));
    expect(money).toHaveClass("num");
    expect(within(footer).getByText(String(rest))).toHaveClass("num");
  });

  it("DADO un renglón que no da para todo CUANDO se pinta la cabecera ENTONCES cae el total, luego el censo, y el título entero nunca", () => {
    // El título es lo que da sentido al widget: «Tensi… 177 · EUR 406,…» no
    // nombra nada. A poco ancho lo que se cae es el total, después el censo.
    const items = withSize(companies(1, 1286, -3), 1_000_000);
    const { container, rerender } = render(
      <TreemapColumns
        items={items}
        metric="delta_3m"
        sizeBy="pending_eur"
        width={100}
        height={520}
      />,
    );
    const worse = () => columnsOf(container)[2];
    const header = () => worse().firstElementChild as HTMLElement;

    expect(within(header()).getByText("Deteriorando")).toBeInTheDocument();
    expect(header().textContent).not.toContain("…");
    expect(header().textContent).not.toContain("1.286");
    expect(header().textContent).not.toContain("EUR");

    // Con el ancho real del tablero caben las tres cosas, en su orden.
    rerender(
      <TreemapColumns
        items={items}
        metric="delta_3m"
        sizeBy="pending_eur"
        width={WIDTH}
        height={HEIGHT}
      />,
    );
    expect(within(header()).getByText("Deteriorando")).toBeInTheDocument();
    expect(within(header()).getByText("1.286")).toHaveClass("num");
    expect(within(header()).getByText(thin(fmtSizeShort(1_286_000_000, "EUR")))).toHaveClass("num");
  });

  it("DADO un recuento CUANDO se pinta ENTONCES el total lleva su palabra y nunca una moneda", () => {
    const items = withSize(companies(1, 6, 72), 10);
    const { container, rerender } = render(
      <TreemapColumns
        items={items}
        metric="score"
        sizeBy="n_invoices"
        width={WIDTH}
        height={HEIGHT}
      />,
    );
    const [sanas] = columnsOf(container);

    expect(within(sanas).getByText("60 facturas")).toBeInTheDocument();
    expect(container.textContent).not.toContain("EUR");
    expect(container.textContent).not.toContain("€");

    rerender(
      <TreemapColumns
        items={items}
        metric="score"
        sizeBy="n_transactions"
        width={WIDTH}
        height={HEIGHT}
      />,
    );
    expect(within(columnsOf(container)[0]).getByText("60 movimientos")).toBeInTheDocument();
  });

  it("DADO una magnitud que suma 0 en todo el universo CUANDO se pinta ENTONCES las áreas quedan iguales y no se inventa un total", () => {
    // `pending_eur` con el origen local: la columna no existe y llega a 0. El
    // mapa no se rompe ni se queda en blanco.
    const items = withSize(companies(1, 6, 72), 0);
    const { container } = render(
      <TreemapColumns
        items={items}
        metric="score"
        sizeBy="pending_eur"
        width={WIDTH}
        height={HEIGHT}
      />,
    );
    const [sanas] = columnsOf(container);

    expect(tilesOf(sanas).length).toBeGreaterThan(0);
    // Con áreas de 0 el squarified daría rectángulos vacíos: aquí todas tienen
    // la misma área, aunque el reparto les dé formas distintas.
    const areas = tilesOf(sanas).map(
      (tile) => Math.round(parseFloat(tile.style.width) * parseFloat(tile.style.height)),
    );
    expect(Math.min(...areas)).toBeGreaterThan(0);
    expect(Math.max(...areas) - Math.min(...areas)).toBeLessThanOrEqual(2);
    expect(sanas.textContent).not.toContain("EUR");
  });
});
