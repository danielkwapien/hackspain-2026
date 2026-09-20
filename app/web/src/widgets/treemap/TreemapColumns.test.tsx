import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { COLUMN_SPLIT, fmtSize, fmtSizeShort, splitColumns } from "@/charts";
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

/** Lo que el pie dice que se queda fuera: «y 474 más» → 474. Sin pie, 0. */
function restOf(column: HTMLElement): number {
  const footer = column.lastElementChild as HTMLElement;
  const match = /y\s([\d.]+)\smás/.exec(footer.textContent ?? "");
  return match === null ? 0 : Number(match[1].replaceAll(".", ""));
}

/** PRNG determinista: la propiedad se barre con semillas, no con azar de verdad. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

  it("DADO la cabecera de columna CUANDO se lee ENTONCES el nombre a --text-body peso 600 en blanco y la cifra en micro secundario", () => {
    // XR-038 (W3.3): lo que hay que poder leer de un vistazo es la palabra
    // —«Mejorando», «Deteriorando»—, no el recuento ni el importe.
    const items = [...companies(1, 6, 2.5), ...companies(100, 4, 0.2), ...companies(200, 2, -3)];
    const { container } = render(
      <TreemapColumns
        items={withSize(items, 1_000_000)}
        metric="delta_3m"
        sizeBy="pending_eur"
        width={WIDTH}
        height={HEIGHT}
      />,
    );

    const title = screen.getByText("Mejorando");
    expect(title.className).toContain("text-[length:var(--text-body)]");
    expect(title.className).toContain("font-semibold");
    expect(title.className).toContain("text-content-primary");

    // El renglón sigue siendo de apoyo: censo e importe no suben de escalón.
    const header = title.parentElement;
    expect(header?.className).toContain("text-[length:var(--text-micro)]");
    expect(header?.className).toContain("text-content-secondary");
    const census = within(columnsOf(container)[0]).getAllByText(/^\d+$/)[0];
    expect(census.className).not.toContain("text-[length:var(--text-body)]");
    expect(census.className).not.toContain("font-semibold");
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
  it("DADO la mayor de una columna con magnitud 0 CUANDO se pinta ENTONCES la columna lo dice y no cuela una ficha de 0 \u00d7 0", () => {
    // El caso real: universo \u00abESPA\u00d1A\u00bb con `size_by=pending_eur`. La \u00fanica
    // empresa con score > 60 es `COMP_0786` (99,63) y su pendiente es 0 \u2014642
    // de las 1.286 empresas est\u00e1n as\u00ed\u2014, as\u00ed que el squarified solo puede
    // darle un rect\u00e1ngulo de 0 \u00d7 0. La columna sal\u00eda EN BLANCO, con el pie
    // vac\u00edo, la cabecera diciendo que hay una empresa y un `role="button"` de
    // 0 px en el orden de tabulaci\u00f3n.
    const items: ColumnDatum[] = [
      { id: "COMP_0786", name: NAMES[0], size: 0, value: 99.63 },
      ...withSize(companies(100, 3, 52), 1_000_000),
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
    const [sanas, vigilancia] = columnsOf(container);

    expect(tilesOf(sanas)).toHaveLength(0);
    expect(within(sanas).getByText("Ninguna con pendiente de cobro que dibujar")).toBeInTheDocument();
    // Las hay: no es «sin empresas», y el pie las cuenta enteras.
    expect(sanas.textContent).not.toContain("Sin empresas");
    // Su censo arriba y su cuenta abajo, las dos tabulares: la que no se
    // puede pintar se cuenta entera.
    const [censo, fuera] = within(sanas).getAllByText("1");
    expect(censo).toHaveClass("num");
    expect(fuera).toHaveClass("num");
    expect(sanas.textContent).toContain("y 1 más");
    // Y la columna que sí tiene magnitud se sigue pintando igual.
    expect(tilesOf(vigilancia)).toHaveLength(3);

    // Ni una ficha invisible en el DOM, y por tanto ninguna en el tabulador.
    for (const tile of screen.getAllByRole("button")) {
      expect(parseFloat(tile.style.width)).toBeGreaterThan(0);
      expect(parseFloat(tile.style.height)).toBeGreaterThan(0);
    }
  });

  it("DADO cualquier universo y cualquier caja CUANDO se pinta ENTONCES pintadas + «y N más» = censo, siempre", () => {
    // La invariante del widget, como propiedad y no como caso suelto: lo que
    // no se puede pintar se CUENTA. Se rompió con el suelo de `fitCount`, que
    // daba por pintada una ficha de área 0.
    const split = COLUMN_SPLIT.score;
    const breaks: string[] = [];

    for (let seed = 1; seed <= 24; seed += 1) {
      const random = mulberry32(seed);
      const count = 1 + Math.floor(random() * 40);
      // Mitad del dataset con magnitud 0: es la proporción real de
      // `pending_eur` (642 de 1.286).
      const items: ColumnDatum[] = Array.from({ length: count }, (_, index) => ({
        id: `COMP_${String(index + 1).padStart(4, "0")}`,
        name: NAMES[index % NAMES.length],
        size: random() < 0.5 ? 0 : Math.round(random() * 80_000_000),
        value: Math.round(random() * 100),
      }));
      const width = [120, 320, 432, 700, 900][seed % 5];
      const height = [90, 180, 338, 520][seed % 4];

      const { container, unmount } = render(
        <TreemapColumns
          items={items}
          metric="score"
          sizeBy="pending_eur"
          width={width}
          height={height}
        />,
      );
      const census = splitColumns(items, split, items.length).map((column) => column.total);

      columnsOf(container).forEach((column, index) => {
        const tiles = tilesOf(column);
        // Pintada es la que SE VE: una ficha de 0 px no cuenta como pintada
        // por estar en el DOM, y de hecho no debería ni estar en él.
        const drawn = tiles.filter(
          (tile) => parseFloat(tile.style.width) > 0 && parseFloat(tile.style.height) > 0,
        ).length;
        const rest = restOf(column);
        if (drawn + rest !== census[index]) {
          breaks.push(
            `semilla ${seed} (${width}×${height}), columna ${index}: ${drawn} pintadas + ${rest} más ≠ ${census[index]} del censo`,
          );
        }
        if (drawn !== tiles.length) {
          breaks.push(
            `semilla ${seed} (${width}×${height}), columna ${index}: ${tiles.length - drawn} fichas de 0 px en el DOM y en el tabulador`,
          );
        }
      });
      unmount();
    }

    expect(breaks).toEqual([]);
  });

  it("DADO la tabla accesible CUANDO la magnitud es dinero ENTONCES el tamaño lleva su moneda, y con un recuento no", () => {
    // La cabecera visible dice «EUR 1,5 M» y la tabla decía «1.536.174,39»
    // pelado: quien la lee no sabe si son euros, facturas o kilos.
    const items = withSize(companies(1, 2, 72), 1_536_174.39);
    const { container, rerender } = render(
      <TreemapColumns
        items={items}
        metric="score"
        sizeBy="pending_eur"
        width={WIDTH}
        height={HEIGHT}
      />,
    );
    const table = () => container.querySelector("table.sr-only") as HTMLElement;

    expect(within(table()).getAllByText(fmtSize(1_536_174.39, "EUR"))).toHaveLength(2);

    // Con un recuento no se inventa un EUR.
    rerender(
      <TreemapColumns
        items={withSize(companies(1, 2, 72), 12)}
        metric="score"
        sizeBy="n_invoices"
        width={WIDTH}
        height={HEIGHT}
      />,
    );
    expect(table().textContent).not.toContain("EUR");
    expect(within(table()).getAllByText("12,00")).toHaveLength(2);
  });
});
