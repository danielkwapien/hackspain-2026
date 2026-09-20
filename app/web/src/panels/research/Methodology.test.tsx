import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Methodology } from "@/panels/research/Methodology";
import type { Pillars, TemporalCompanyV2 } from "@/lib/api-v2";
import { companyExample } from "@/test/examples";

const SCORE = 57.4;
const MONTHS_HIST = 24;

const PILLARS: Pillars = {
  L: { value: 0.42, weight: 0.25 },
  P: { value: 0.91, weight: 0.2 },
  C: { value: 0.7, weight: 0.15 },
  D: { value: 0.9, weight: 0.2 },
  A: { value: 0.84, weight: 0.2 },
};

function makeCompany(overrides: Record<string, unknown> = {}): TemporalCompanyV2 {
  return {
    ...companyExample,
    score: SCORE,
    confidence: 1,
    pillars: PILLARS,
    company: { ...companyExample.company, months_hist: MONTHS_HIST },
    ...overrides,
  } as unknown as TemporalCompanyV2;
}

/** Regex tolerante al espacio fino (U+2009) y a los saltos entre nodos. */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

function renderMethodology(company: TemporalCompanyV2 = makeCompany()): HTMLElement {
  render(<Methodology company={company} />);
  return screen.getByRole("region", { name: "Cómo se calcula" });
}

describe("panels/research/Methodology", () => {
  it("DADO el pop-up CUANDO se pinta ENTONCES cuatro apartados en prosa, uno por tarjeta", () => {
    const section = renderMethodology();

    expect(section.querySelectorAll('[data-slot="methodology-card"]')).toHaveLength(4);

    for (const heading of [
      "Qué mide el Health Score",
      "Cómo se comporta en el tiempo",
      "Qué puede limitar la cifra",
      "Qué significa la confianza",
    ]) {
      expect(within(section).getByRole("heading", { name: heading })).toBeInTheDocument();
    }

    // Prosa de verdad: cada tarjeta lleva su párrafo, no una lista de términos.
    expect(section).toHaveTextContent(loose("cede su peso a las que sí los tienen"));
    expect(section).toHaveTextContent(loose("un pico puntual no mueve la cifra"));
    expect(section).toHaveTextContent(loose("el eslabón más frágil, no la media"));
    expect(section).toHaveTextContent(loose("una lectura provisional, no un veredicto"));
  });

  it("DADO el pop-up CUANDO se pinta ENTONCES ni una fórmula ni un «…» de parámetro ausente", () => {
    const section = renderMethodology();

    // Las nueve fórmulas vivían en un `code`; ya no queda ninguno.
    expect(section.querySelectorAll("code")).toHaveLength(0);

    const text = section.textContent ?? "";
    for (const symbol of ["…", "Σ", "λ", "τ", "φ", "γ", "√", "≥", "≤", "=", "EWMA", "u_ref"]) {
      expect(text, `el pop-up sigue enseñando «${symbol}»`).not.toContain(symbol);
    }
    // Y los títulos numerados del modelo se han ido con ellas.
    expect(section).not.toHaveTextContent(/\d\s·\s(Pilares|Bandas|Reg)/);
  });

  it("DADO el pop-up CUANDO se pinta ENTONCES conserva la escala de bandas y la fila de pesos", () => {
    const section = renderMethodology();

    const scale = within(section).getByRole("meter", { name: "Valor entre 0 y 100" });
    expect(scale).toHaveAttribute("aria-valuemin", "0");
    expect(scale).toHaveAttribute("aria-valuemax", "100");
    expect(scale).toHaveAttribute("aria-valuenow", String(SCORE));
    expect(scale.querySelectorAll('[data-slot="range-bar-segment"]')).toHaveLength(4);
    expect(scale.querySelector<HTMLElement>('[data-slot="range-bar-dot"]')?.style.left).toBe(
      "57.4%",
    );
    expect(section).toHaveTextContent("Sólida");

    // Cinco pesos efectivos, uno por pilar, más la escala: seis meters.
    expect(within(section).getAllByRole("meter")).toHaveLength(6);
    for (const pillar of [/Liquidez/, /Pago/, /Cobros/, /Deuda/, /Actividad/]) {
      expect(within(section).getByRole("meter", { name: pillar })).toBeInTheDocument();
    }
  });

  it("DADO una empresa con las cinco familias CUANDO se pinta ENTONCES confianza, historia y cobertura reales", () => {
    const section = renderMethodology();

    expect(section).toHaveTextContent(loose("Confianza 100 %"));
    expect(section).toHaveTextContent(loose("Historia 24 meses"));
    expect(section).toHaveTextContent(loose("Cobertura completa"));
  });

  it("DADO una familia sin datos ENTONCES la cobertura lo dice y no se inventa «completa»", () => {
    const section = renderMethodology(
      makeCompany({
        confidence: 0.7,
        pillars: { ...PILLARS, D: { value: null, weight: 0 } },
        company: { ...companyExample.company, months_hist: 9 },
      }),
    );

    expect(section).toHaveTextContent(loose("Confianza 70 %"));
    expect(section).toHaveTextContent(loose("Historia 9 meses"));
    expect(section).toHaveTextContent(loose("Cobertura 4 de 5 familias"));
    expect(section).not.toHaveTextContent("completa");
  });

  it("DADO un corte sin score ENTONCES la escala lo dice y las tarjetas siguen en pie", () => {
    const section = renderMethodology(makeCompany({ score: null, confidence: null }));

    expect(section).toHaveTextContent("Sin score en este corte");
    expect(section.querySelectorAll('[data-slot="methodology-card"]')).toHaveLength(4);
    expect(section.textContent ?? "").not.toContain("…");
  });

  it("DADO la rejilla ENTONCES dos por dos y sin scroll: el texto se recorta, no se desplaza", () => {
    const section = renderMethodology();

    const grid = section.querySelector<HTMLElement>('[data-slot="methodology-grid"]');
    expect(grid).not.toBeNull();
    for (const token of ["grid-cols-2", "grid-rows-2", "overflow-hidden", "min-h-0"]) {
      expect(grid?.className, `la rejilla no lleva ${token}`).toContain(token);
    }
    for (const card of section.querySelectorAll<HTMLElement>('[data-slot="methodology-card"]')) {
      expect(card.className).toContain("min-h-0");
      expect(card.className).toContain("overflow-hidden");
    }
  });
});
