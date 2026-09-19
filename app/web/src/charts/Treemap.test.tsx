import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formatAmount } from "@/lib/format";
import { Treemap, intensityStep } from "@/charts/Treemap";
import { fmtPct, fmtPoints, fmtSize } from "@/charts/format";
import { treemapToken } from "@/charts/palette";

const WIDTH = 400;
const HEIGHT = 300;

/**
 * Con 400x300 el layout squarified da `alpha` 360x300, `beta` 40x270,
 * `gamma` 36x30 y `delta` 4x30: los tres umbrales de etiqueta en un solo
 * fixture. El máximo absoluto de `color_value` es 8, así que los cuartiles
 * caen en 2 / 4 / 6.
 */
const ITEMS = [
  { id: "alpha", size: 90, color_value: 8 },
  { id: "beta", size: 9, color_value: -3.5 },
  { id: "gamma", size: 0.9, color_value: 1.5 },
  { id: "delta", size: 0.1, color_value: -6 },
];

describe("charts/Treemap", () => {
  it("Treemap: intensity uses four steps and hides the label below the size threshold", () => {
    // Cuartiles sobre el máximo absoluto, con el 0 en el escalón más tenue.
    expect(intensityStep(0, 8)).toBe(1);
    expect(intensityStep(2, 8)).toBe(1);
    expect(intensityStep(2.01, 8)).toBe(2);
    expect(intensityStep(4, 8)).toBe(2);
    expect(intensityStep(4.01, 8)).toBe(3);
    expect(intensityStep(6, 8)).toBe(3);
    expect(intensityStep(6.01, 8)).toBe(4);
    expect(intensityStep(8, 8)).toBe(4);
    // Sin magnitud que comparar, todo al escalón 1.
    expect(intensityStep(0, 0)).toBe(1);

    render(<Treemap items={ITEMS} width={WIDTH} height={HEIGHT} unit="pct" label="Exposición" />);

    const tiles = screen.getAllByRole("button");
    expect(tiles).toHaveLength(ITEMS.length);

    // Cuatro escalones, y el signo sale de `color_value >= 0`.
    expect(tiles[0].style.backgroundColor).toBe(treemapToken("pos", 4));
    expect(tiles[1].style.backgroundColor).toBe(treemapToken("neg", 2));
    expect(tiles[2].style.backgroundColor).toBe(treemapToken("pos", 1));
    expect(tiles[3].style.backgroundColor).toBe(treemapToken("neg", 3));

    // Separación de 1 px en color de superficie: sin ella el escalón 1 no se
    // distingue del fondo (1,16:1, spec §6).
    for (const tile of tiles) {
      expect(tile.style.outline).toContain("var(--bg)");
      expect(tile.style.outline).toContain("1px");
    }

    // 360x300: cabe el id y el valor.
    expect(tiles[0].textContent).toContain("alpha");
    expect(tiles[0].textContent).toContain(fmtPct(8));

    // 40x270 y 36x30: por debajo de 44x28, solo el valor.
    expect(tiles[1].textContent).not.toContain("beta");
    expect(tiles[1].textContent).toContain(fmtPct(-3.5));
    expect(tiles[2].textContent).not.toContain("gamma");
    expect(tiles[2].textContent).toContain(fmtPct(1.5));

    // 4x30: por debajo de 28x20 no se pinta texto, nunca se recorta.
    expect(tiles[3].textContent).toBe("");
    for (const tile of tiles) {
      expect(tile.style.overflow).not.toBe("hidden");
    }

    // El valor que no cabe sigue estando en el nombre accesible.
    expect(tiles[3]).toHaveAccessibleName(`delta, ${fmtPct(-6)}`);
  });

  it("Treemap: tiles are focusable by descending size and expose a visually hidden table", async () => {
    const onSelect = vi.fn();
    const onHover = vi.fn();

    render(
      <Treemap
        items={[ITEMS[2], ITEMS[0], ITEMS[3], ITEMS[1]]}
        width={WIDTH}
        height={HEIGHT}
        unit="pct"
        label="Exposición"
        onSelect={onSelect}
        onHover={onHover}
      />,
    );

    // El recorrido de teclado va por tamaño descendente, no por el orden de entrada.
    const tiles = screen.getAllByRole("button");
    expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual([
      `alpha, ${fmtPct(8)}`,
      `beta, ${fmtPct(-3.5)}`,
      `gamma, ${fmtPct(1.5)}`,
      `delta, ${fmtPct(-6)}`,
    ]);
    for (const tile of tiles) expect(tile).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(tiles[1], { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);

    fireEvent.keyDown(tiles[2], { key: " " });
    expect(onSelect).toHaveBeenLastCalledWith(ITEMS[2]);

    await userEvent.hover(tiles[0]);
    expect(onHover).toHaveBeenCalledWith(ITEMS[0]);

    // Tabla visualmente oculta: `dataviz` prohíbe escala continua sin vista de tabla.
    const table = screen.getByRole("table");
    expect(table).toHaveClass("sr-only");

    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(ITEMS.length + 1);
    // Sin `currency` el tamano sale como cifra pelada: un treemap cuyo tamano es
    // un recuento no puede inventarse una moneda.
    for (const item of ITEMS) {
      const row = rows.find((candidate) => candidate.textContent?.includes(item.id));
      expect(row?.textContent).toContain(formatAmount(item.size));
      expect(row?.textContent).not.toContain("EUR");
      expect(row?.textContent).toContain(fmtPct(item.color_value));
    }
  });

  it("Treemap: labels the size with the currency only when one is given", () => {
    render(<Treemap items={ITEMS} width={400} height={240} unit="pct" label="Mapa" currency="EUR" />);

    const row = within(screen.getByRole("table"))
      .getAllByRole("row")
      .find((candidate) => candidate.textContent?.includes(ITEMS[0].id));

    expect(row?.textContent).toContain(fmtSize(ITEMS[0].size, "EUR"));
  });

  it("Treemap: a focused tile shows a focus ring that the separator does not hide", () => {
    render(<Treemap items={ITEMS} width={400} height={240} unit="pct" label="Mapa" />);

    // El separador entre tiles es un `outline` de 1 px en --bg puesto en el
    // `style` inline. Un inline gana a cualquier clase, asi que el anillo de
    // foco NO puede ser otro `outline`: tiene que ir por una propiedad que el
    // inline no ocupe. Si alguien lo cambia a `outline`, esto falla.
    const tile = screen.getAllByRole("button")[0];
    expect(tile.getAttribute("style")).toContain("outline");
    expect(tile.getAttribute("style")).not.toContain("box-shadow");
    expect(tile.className).toContain("focus-visible:[box-shadow:inset_0_0_0_2px_var(--border-focus)]");
  });

  it("Treemap: groups render their title band above their tiles", () => {
    render(
      <Treemap
        groups={[
          { id: "Norte", items: [ITEMS[0], ITEMS[2]] },
          { id: "Sur", items: [ITEMS[1], ITEMS[3]] },
        ]}
        width={WIDTH}
        height={HEIGHT}
        unit="pts"
        label="Exposición por zona"
      />,
    );

    expect(screen.getByText("Norte")).toBeInTheDocument();
    expect(screen.getByText("Sur")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(ITEMS.length);
  });

  it("DADO items con name CUANDO se pintan ENTONCES el nombre sustituye al id, con cuerpo por área y el valor debajo", () => {
    const named = [
      { ...ITEMS[0], name: "Alpha" },
      { ...ITEMS[1], name: "Beta" },
      { ...ITEMS[2], name: "Gamma" },
      { ...ITEMS[3], name: "Delta" },
    ];
    render(<Treemap items={named} width={WIDTH} height={HEIGHT} unit="pts" label="Mapa" />);

    const tiles = screen.getAllByRole("button");

    // alpha 360×300 = 108 000 px² → 16 px (`--text-tile`), en negrita, arriba a la izquierda.
    const alphaName = within(tiles[0]).getByText("Alpha");
    expect(alphaName.style.fontSize).toBe("var(--text-tile)");
    expect(alphaName.className).toMatch(/font-bold/);
    expect(tiles[0].textContent).not.toContain("alpha");
    expect(tiles[0]).toHaveAccessibleName(`Alpha, ${fmtPoints(8)}`);
    // El valor va debajo del nombre, tabular.
    const alphaValue = tiles[0].querySelector<HTMLElement>(".num")!;
    expect(alphaValue.textContent).toContain("8,0");
    expect(alphaName.compareDocumentPosition(alphaValue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // beta 40×270 = 10 800 px² → 13 px (`--text-body`).
    const betaName = within(tiles[1]).getByText("Beta");
    expect(betaName.style.fontSize).toBe("var(--text-body)");
    expect(tiles[1]).toHaveAccessibleName(`Beta, ${fmtPoints(-3.5)}`);

    // La tabla oculta lista nombres, no ids.
    const table = screen.getByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Alpha" })).toBeInTheDocument();
    expect(within(table).queryByRole("rowheader", { name: "alpha" })).toBeNull();
  });

  it("DADO grupos con label y delta CUANDO se pintan ENTONCES la cabecera lleva el nombre y ▲/▼ Δ, o «Sin Δ»", () => {
    // Tres grupos del mismo tamaño: cada banda mide al menos un tercio del mapa y la
    // etiqueta corta cabe entera con su Δ.
    const groups = [
      { id: "GROUP_0126", label: "Bierzo", delta: 1.32, items: [{ id: "a", size: 30, color_value: 2 }] },
      { id: "GROUP_0116", label: "Pinilla", delta: -0.82, items: [{ id: "b", size: 30, color_value: -2 }] },
      { id: "GROUP_0132", label: "Beltran", delta: null, items: [{ id: "c", size: 30, color_value: 1 }] },
    ];
    const { container } = render(
      <Treemap groups={groups} width={WIDTH} height={HEIGHT} unit="pts" label="Mapa por grupo" />,
    );

    /** Elemento que contiene `expected` en un nodo de texto propio (no en descendientes). */
    function ownText(expected: string) {
      return (_content: string, element: Element | null) =>
        [...(element?.childNodes ?? [])].some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").includes(expected),
        );
    }

    for (const group of groups) expect(screen.queryByText(ownText(group.id))).toBeNull();

    const bierzo = screen.getByText(ownText("Bierzo")).closest("div")!;
    const up = bierzo.querySelector<HTMLElement>(".num")!;
    expect(up.textContent).toContain("▲");
    expect(up.textContent).toMatch(/\+1,3/);
    expect(up.style.color).toBe("var(--content-positive)");
    expect(up.style.fontSize).toBe("var(--text-micro)");

    const pinilla = screen.getByText(ownText("Pinilla")).closest("div")!;
    const down = pinilla.querySelector<HTMLElement>(".num")!;
    expect(down.textContent).toContain("▼");
    expect(down.textContent).toMatch(/−0,8/);
    expect(down.style.color).toBe("var(--content-negative)");

    // Sin Δ consolidada: se dice, no se imputa 0.
    const beltran = screen.getByText(ownText("Beltran")).closest("div")!;
    expect(beltran.textContent).toContain("Sin Δ");
    expect(beltran.textContent).not.toMatch(/0,0/);

    expect(container.querySelectorAll('[role="button"]')).toHaveLength(3);
  });

  it("DADO un tile pequeño con name CUANDO se pinta ENTONCES no lleva texto pero el nombre va en aria-label", () => {
    const named = ITEMS.map((item, index) => ({ ...item, name: ["Alpha", "Beta", "Gamma", "Delta"][index] }));
    render(<Treemap items={named} width={WIDTH} height={HEIGHT} unit="pts" label="Mapa" />);

    // delta 4×30: por debajo del umbral no se pinta texto, nunca se recorta.
    const small = screen.getAllByRole("button")[3];
    expect(small.textContent).toBe("");
    expect(small.style.overflow).not.toBe("hidden");
    expect(small).toHaveAccessibleName(`Delta, ${fmtPoints(-6)}`);
    expect(small.getAttribute("aria-label")).not.toContain("delta,");

    expect(within(screen.getByRole("table")).getByRole("rowheader", { name: "Delta" })).toBeInTheDocument();
  });
});
