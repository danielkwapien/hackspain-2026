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

function cards(section: HTMLElement): HTMLElement[] {
  return [...section.querySelectorAll<HTMLElement>('[data-slot="methodology-card"]')];
}

function visualRows(section: HTMLElement): HTMLElement[] {
  const visuals = section.querySelector<HTMLElement>('[data-slot="methodology-visuals"]');
  return [...(visuals?.children ?? [])] as HTMLElement[];
}

describe("panels/research/Methodology", () => {
  it("DADO el pop-up CUANDO se pinta ENTONCES cinco bloques de prosa de dos o tres párrafos", () => {
    const section = renderMethodology();

    const prose = cards(section);
    expect(prose).toHaveLength(5);

    for (const heading of [
      "Qué mide el Health Score",
      "Cómo se lee cada señal",
      "Cómo se compone la cifra",
      "Qué limita la cifra",
      "Qué significa la confianza",
    ]) {
      expect(within(section).getByRole("heading", { name: heading })).toBeInTheDocument();
    }

    // Dos o tres párrafos por bloque: ni un titular suelto ni un muro de texto.
    for (const card of prose) {
      const paragraphs = card.querySelectorAll("p").length;
      const title = card.querySelector("h4")?.textContent ?? "";
      expect(paragraphs, `«${title}» tiene ${paragraphs} párrafos`).toBeGreaterThanOrEqual(2);
      expect(paragraphs, `«${title}» tiene ${paragraphs} párrafos`).toBeLessThanOrEqual(3);
    }

    // Prosa de verdad: el motor se explica, no se enumera.
    expect(section).toHaveTextContent(loose("cede su peso a las que sí los tienen"));
    expect(section).toHaveTextContent(loose("un pico aislado no mueve el score"));
    expect(section).toHaveTextContent(loose("modificadores acotados"));
    expect(section).toHaveTextContent(loose("el eslabón más débil"));
    expect(section).toHaveTextContent(loose("una lectura provisional, no un veredicto"));
  });

  it("DADO las fórmulas ENTONCES dos como máximo, en su card y como elemento visual", () => {
    const section = renderMethodology();

    const formulas = section.querySelector<HTMLElement>('[data-slot="methodology-formulas"]');
    expect(formulas).not.toBeNull();

    // «Dos como máximo»: la composición por familias y la identidad del score.
    const code = section.querySelectorAll("code");
    expect(code).toHaveLength(2);
    for (const line of code) expect(formulas?.contains(line)).toBe(true);
    expect(formulas).toHaveTextContent(loose("nivel = Σ peso_familia × nota_familia"));
    expect(formulas).toHaveTextContent(loose("score = nivel − penalización − techo"));

    // La monoespaciada la da `.num` (tabular-nums): `design/tokens.test.ts`
    // prohíbe una segunda familia, en todo el producto se escribe en Inter.
    for (const line of code) expect(line.className).toContain("num");
  });

  it("DADO el pop-up ENTONCES se nota el motor pero NO se publica el modelo", () => {
    const section = renderMethodology();

    // Ni los pesos por señal, ni las anclas, ni los umbrales de régimen: la
    // prosa y las fórmulas no llevan una sola cifra del modelo.
    const model = [...cards(section), section.querySelector('[data-slot="methodology-formulas"]')]
      .map((node) => node?.textContent ?? "")
      .join(" ")
      // La confianza, la historia y la cobertura sí son cifras de la empresa.
      .replace(/Confianza[\s\S]*$/, "");
    expect(model, "el pop-up publica una cifra del modelo").not.toMatch(/\d/);

    const text = section.textContent ?? "";
    for (const symbol of ["…", "λ", "τ", "φ", "γ", "√", "≥", "≤", "EWMA", "u_ref"]) {
      expect(text, `el pop-up sigue enseñando «${symbol}»`).not.toContain(symbol);
    }
    expect(section).not.toHaveTextContent(/\d\s·\s(Pilares|Bandas|Reg)/);
  });

  it("DADO las dos filas de cabecera ENTONCES BandScale y WeightsRow, cada uno a ancho completo", () => {
    const section = renderMethodology();

    const visuals = section.querySelector<HTMLElement>('[data-slot="methodology-visuals"]');
    expect(visuals).not.toBeNull();
    // Una columna: las dos barras dejaron de compartir fila.
    expect(visuals?.className).toContain("flex-col");
    expect(visuals?.className).not.toContain("grid-cols-2");

    const rows = visualRows(section);
    expect(rows).toHaveLength(2);
    // Fila 1 la escala de bandas; fila 2 los cinco pesos.
    const scale = within(rows[0]).getByRole("meter", { name: "Valor entre 0 y 100" });
    expect(scale).toHaveAttribute("aria-valuemin", "0");
    expect(scale).toHaveAttribute("aria-valuemax", "100");
    expect(scale).toHaveAttribute("aria-valuenow", String(SCORE));
    expect(scale.querySelectorAll('[data-slot="range-bar-segment"]')).toHaveLength(4);
    expect(scale.querySelector<HTMLElement>('[data-slot="range-bar-dot"]')?.style.left).toBe(
      "57.4%",
    );

    expect(within(rows[1]).getAllByRole("meter")).toHaveLength(5);
    for (const pillar of [/Liquidez/, /Pago/, /Cobros/, /Deuda/, /Actividad/]) {
      expect(within(rows[1]).getByRole("meter", { name: pillar })).toBeInTheDocument();
    }
  });

  it("DADO las dos barras ENTONCES 10 px, textos a --text-body y etiquetas en blanco", () => {
    const section = renderMethodology();
    const rows = visualRows(section);

    // 10 px, no los 6 del primitivo: el grosor se sube desde aquí, porque
    // `RangeBar` y `PillarBar` los comparte media aplicación.
    for (const row of rows) {
      expect(row.className, "las barras del pop-up no suben a 10 px").toContain("h-[10px]");
    }

    // Etiquetas de banda: las cuatro, a --text-body y en blanco.
    for (const band of ["Tensión", "Vigilancia", "Sana", "Sólida"]) {
      const label = within(rows[0]).getByText(band);
      expect(label.className).toContain("text-[length:var(--text-body)]");
      expect(label.className).toContain("text-content-primary");
    }

    // Etiquetas de familia: las cinco, igual.
    for (const family of ["Liquidez", "Pago", "Cobros", "Deuda", "Actividad"]) {
      const label = within(rows[1]).getByText(family);
      expect(label.className).toContain("text-[length:var(--text-body)]");
      expect(label.className).toContain("text-content-primary");
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

  it("DADO un corte sin score ENTONCES la escala lo dice y los bloques siguen en pie", () => {
    const section = renderMethodology(makeCompany({ score: null, confidence: null }));

    expect(section).toHaveTextContent("Sin score en este corte");
    expect(cards(section)).toHaveLength(5);
    expect(section.textContent ?? "").not.toContain("…");
  });

  it("DADO la rejilla ENTONCES sin scroll: el texto se recorta, no se desplaza", () => {
    const section = renderMethodology();

    expect(section.className).toContain("overflow-hidden");

    const grid = section.querySelector<HTMLElement>('[data-slot="methodology-grid"]');
    expect(grid).not.toBeNull();
    for (const token of ["grid-cols-3", "grid-rows-2", "overflow-hidden", "min-h-0"]) {
      expect(grid?.className, `la rejilla no lleva ${token}`).toContain(token);
    }

    // Criterio 11 de §8: el pop-up no scrollea a 1440×900 ni a 1280×800. Aquí
    // se fija lo estructural; la medida en pantalla va en la verificación.
    for (const node of section.querySelectorAll<HTMLElement>("*")) {
      const className = node.className.toString();
      expect(className).not.toContain("overflow-y-auto");
      expect(className).not.toContain("overflow-auto");
    }
    for (const card of section.querySelectorAll<HTMLElement>("article")) {
      expect(card.className).toContain("min-h-0");
      expect(card.className).toContain("overflow-hidden");
    }
  });
});
