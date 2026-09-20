/**
 * La fila de KPIs con su columna «Conclusión» (XR-037, E15): las fortalezas del mes
 * bajan aquí desde la línea de contexto de la cabecera, y la fila pasa de cinco
 * columnas a seis.
 */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  ConclusionCell,
  ConclusionNote,
  KpiRow,
  pillarCells,
} from "@/panels/research/KpiRow";

const PILLARS = {
  L: { value: 0.412, weight: 0.25 },
  P: { value: 0.552, weight: 0.2 },
  C: { value: 0.832, weight: 0.15 },
  D: { value: 0.722, weight: 0.2 },
  A: { value: null, weight: 0 },
};

function cells() {
  return pillarCells({ pillars: PILLARS, firstPillars: null });
}

/** Regex tolerante al espacio fino (U+2009) y a los saltos entre nodos. */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

function row(): HTMLElement {
  const dl = screen.getByText("Liquidez").closest("dl");
  if (dl === null) throw new Error("la fila no es un dl");
  return dl;
}

describe("KpiRow · Conclusión", () => {
  it("DADO fortalezas CUANDO se pinta la fila ENTONCES seis columnas: «Conclusión» delante de los cinco pilares", () => {
    render(
      <KpiRow
        cells={cells()}
        leading={<ConclusionCell flags={["PAYS_ON_TIME", "GROWTH_NO_DSO"]} />}
      />,
    );

    expect(row().className).toContain("grid-cols-6");
    const terms = within(row())
      .getAllByRole("term")
      .map((term) => term.textContent?.trim());
    expect(terms).toEqual([
      "Conclusión",
      "Liquidez",
      "Pago",
      "Cobros",
      "Deuda",
      "Actividad",
    ]);

    // El vocabulario de `strength_flags`, en español y en burbujas.
    expect(screen.getByText("Paga a tiempo")).toBeInTheDocument();
    expect(screen.getByText("Crece sin mora")).toBeInTheDocument();
    expect(screen.queryByText(/PAYS_ON_TIME|GROWTH_NO_DSO/)).toBeNull();
  });

  it("DADO una fortaleza que el front no conoce CUANDO se pinta ENTONCES cae al código humanizado y no rompe la fila", () => {
    render(<KpiRow cells={cells()} leading={<ConclusionCell flags={["BRAND_NEW_FLAG"]} />} />);

    expect(screen.getByText("brand new flag")).toBeInTheDocument();
    expect(row().className).toContain("grid-cols-6");
  });

  it("DADO ninguna fortaleza CUANDO se pinta ENTONCES «Sin señales destacadas» y la fila vuelve a cinco columnas", () => {
    render(
      <>
        <ConclusionNote />
        <KpiRow cells={cells()} />
      </>,
    );

    expect(screen.getByText(/Sin señales destacadas/)).toBeInTheDocument();
    expect(screen.getByText("Conclusión")).toBeInTheDocument();
    // Sin hueco a la izquierda de Liquidez: los cinco pilares, cinco columnas.
    expect(row().className).toContain("grid-cols-5");
    expect(within(row()).getAllByRole("term")).toHaveLength(5);
  });

  it("DADO la celda de un pilar CUANDO se pinta ENTONCES tarjeta glass con la cifra a --text-figure y el delta a --text-control", () => {
    render(<KpiRow cells={pillarCells({ pillars: PILLARS, firstPillars: null })} />);

    const cell = screen.getByText("Liquidez").closest("div");
    expect(cell?.className).toContain("bg-surface-glass");
    expect(cell?.className).toContain("rounded-[var(--radius-card)]");

    const figure = screen.getByText(loose("41,2 pts"));
    expect(figure.className).toContain("text-[length:var(--text-figure)]");
    expect(figure.className).toContain("font-semibold");

    // Sin peso no hay cifra: «No aplica» se queda en el cuerpo, no sube a 20 px.
    const empty = screen.getByText("No aplica");
    expect(empty.className).toContain("text-[length:var(--text-body)]");
  });
});
