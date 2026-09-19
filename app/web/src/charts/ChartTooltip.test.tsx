import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartTooltip } from "@/charts/ChartTooltip";
import { fmtPoints } from "@/charts/format";

/** Espacio fino (U+2009) entre la cifra y su unidad. */
const THIN = "\u2009";

/**
 * `getByText` normaliza el espacio fino a un espacio normal, y el contrato
 * tipográfico es justo ese carácter: comparamos el `textContent` en crudo.
 */
function exactly(expected: string) {
  return (_content: string, element: Element | null) => element?.textContent === expected;
}

const SCORE_ROW = {
  label: "Score",
  value: fmtPoints(47.3),
  color: "var(--regime-deteriorating)",
};

describe("charts/ChartTooltip", () => {
  it("ChartTooltip: formats month as MM/YYYY and value with unit", () => {
    render(<ChartTooltip month="2026-06" x={50} rows={[SCORE_ROW]} />);

    const tip = screen.getByRole("tooltip");
    // La cabecera formatea el mes; el valor llega ya formateado con su unidad.
    expect(screen.getByText("06/2026")).toBeInTheDocument();
    expect(screen.getByText(exactly(`47,3${THIN}pts`))).toBeInTheDocument();

    // El valor manda: primario, peso 600 y cifras tabulares.
    const value = screen.getByText(exactly(`47,3${THIN}pts`));
    expect(value.style.color).toBe("var(--content-primary)");
    expect(value.style.fontWeight).toBe("600");
    expect(value).toHaveClass("num");

    // La etiqueta va detrás y en secundario.
    const label = screen.getByText("Score");
    expect(label.style.color).toBe("var(--content-secondary)");

    // Superficie de tooltip, radio de control y capa de tooltip; sin sombra difusa (§4).
    expect(tip.style.backgroundColor).toBe("var(--surface-tooltip)");
    expect(tip.style.borderRadius).toBe("var(--radius-control)");
    expect(tip.style.padding).toBe("8px");
    expect(tip.style.fontSize).toBe("var(--text-control)");
    expect(tip.style.zIndex).toBe("var(--z-tooltip)");
    expect(tip.style.boxShadow).toBe("");
  });

  it("ChartTooltip: renders one keyed row per series and flips at the right edge", () => {
    const rows = [
      SCORE_ROW,
      { label: "Sector <script>alert(1)</script>", value: `52,9${THIN}pts`, color: "var(--chart-2)" },
    ];

    const middle = render(<ChartTooltip month="2026-06" x={50} rows={rows} />);
    const tip = screen.getByRole("tooltip");

    // Una fila por serie, con la clave como trazo corto y nunca como caja rellena.
    const keys = tip.querySelectorAll<HTMLElement>('[data-slot="chart-tooltip-key"]');
    expect(keys).toHaveLength(2);
    expect(keys[0].style.width).toBe("8px");
    expect(keys[0].style.height).toBe("2px");
    expect(keys[0].style.backgroundColor).toBe("var(--regime-deteriorating)");
    expect(keys[1].style.backgroundColor).toBe("var(--chart-2)");

    // El valor va delante de la etiqueta en el orden de lectura.
    const row = tip.querySelectorAll<HTMLElement>('[data-slot="chart-tooltip-row"]')[0];
    expect(row.textContent).toBe(`47,3${THIN}ptsScore`);

    // Los nombres de serie vienen de datos: entran como texto, nunca como HTML.
    expect(tip.querySelector("script")).toBeNull();
    expect(screen.getByText("Sector <script>alert(1)</script>")).toBeInTheDocument();

    // En el centro se ancla a la izquierda y se centra sobre la X.
    expect(tip.style.left).toBe("50%");
    expect(tip.style.transform).toBe("translateX(-50%)");
    middle.unmount();

    // Cerca del borde izquierdo no se centra: se queda pegado a su X.
    const left = render(<ChartTooltip month="2026-06" x={10} rows={rows} />);
    expect(screen.getByRole("tooltip").style.left).toBe("10%");
    expect(screen.getByRole("tooltip").style.transform).toBe("");
    left.unmount();

    // Cerca del borde derecho vuelca: se ancla por la derecha y no por la izquierda.
    render(<ChartTooltip month="2026-06" x={90} rows={rows} />);
    const flipped = screen.getByRole("tooltip");
    expect(flipped.style.left).toBe("");
    // jsdom normaliza `calc(100% - 90%)` a `calc(10%)`.
    expect(flipped.style.right).toBe("calc(10%)");
    expect(flipped.style.transform).toBe("");
  });
});
