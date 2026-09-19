/**
 * «Contexto» (XR-037, E14). Las cifras son las que publica el motor para COMP_0169 al
 * corte 2026-08, leídas de `/api/v2/companies/COMP_0169`.
 */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { StrategicSignal } from "@/lib/api-v2";
import { StrategicCards } from "@/panels/research/StrategicCards";

function signal(overrides: Partial<StrategicSignal> & { name: string }): StrategicSignal {
  return {
    label: null,
    value: 50,
    confidence: 1,
    coverage: 1,
    direction: "stable",
    modifier_delta: null,
    modifier_applied: false,
    evidence: null,
    ...overrides,
  };
}

const SIGNALS: StrategicSignal[] = [
  signal({
    name: "current_health",
    value: 72.35,
    evidence: { activity: 83.96, collections: 69.88, debt: 90.37, liquidity: 41.79, payment: 90.81 },
  }),
  signal({
    name: "data_driven_peer_learning",
    label: "Trayectorias comparables de la cartera",
    value: 58.36,
    confidence: 0.815,
    direction: "deteriorating",
    // Publica delta sin aplicarlo: no mueve el score en ninguna sociedad.
    modifier_delta: 3.1,
    modifier_applied: false,
    evidence: {
      current_health: 72.35,
      expected_health_3m: 58.36,
      mean_similarity: 0.815,
      neighbour_count: 7,
    },
  }),
  signal({
    name: "network_counterparty_health",
    value: 81.34,
    direction: "improving",
    modifier_delta: 4.25,
    modifier_applied: true,
    evidence: {
      collection_continuity: 0.981,
      customer_late_rate: 0.038,
      customer_overdue_rate: 0.419,
    },
  }),
  signal({
    name: "sector_benchmark_rank",
    value: 89.74,
    direction: "improving",
    evidence: { cohort_size: 151, financial_sector: "EUR_size_1e6_financed", health_percentile: 89.74 },
  }),
  signal({
    name: "trajectory_pressure",
    value: 65.86,
    direction: "improving",
    modifier_delta: 4.49,
    modifier_applied: true,
    evidence: { health_change_3m: 27.83, momentum: 100, obligation_coverage: 0.29, pressure: 14.65 },
  }),
];

/** Regex tolerante al espacio fino (U+2009) y a los saltos entre nodos. */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

function cards(): HTMLElement[] {
  return within(screen.getByRole("region", { name: "Contexto" })).getAllByRole("listitem");
}

describe("Contexto (perspectivas)", () => {
  it("DADO las cinco perspectivas CUANDO se pintan ENTONCES cuatro tarjetas en español, en el orden del catálogo y sin current_health", () => {
    render(<StrategicCards signals={SIGNALS} />);

    const section = screen.getByRole("region", { name: "Contexto" });
    expect(within(section).getByRole("heading", { name: "Contexto" })).toBeInTheDocument();
    expect(cards()).toHaveLength(4);
    expect(cards().map((card) => card.textContent)).toEqual([
      expect.stringContaining("Trayectoria y presión"),
      expect.stringContaining("Salud de la red de cobro"),
      expect.stringContaining("Posición en su sector"),
      expect.stringContaining("Empresas parecidas"),
    ]);

    // `current_health` es la fila de pilares otra vez: ni su etiqueta ni su cifra.
    expect(within(section).queryByText(/current health/i)).toBeNull();
    expect(within(section).queryByText(loose("72,3"))).toBeNull();
    // Y nada de `humanizeCode`: ni el `label` sin acentos del motor ni el código.
    expect(within(section).queryByText(/data driven peer learning/i)).toBeNull();
    expect(within(section).queryByText(/Trayectorias comparables/)).toBeNull();
  });

  it("DADO una perspectiva CUANDO se pinta su tarjeta ENTONCES cifra, dirección con tono, barra 0-100 y DOS claves de evidencia traducidas", () => {
    render(<StrategicCards signals={SIGNALS} />);

    const card = cards()[0];
    expect(card).toHaveTextContent(loose("65,9"));
    expect(card).toHaveTextContent("Mejora");
    expect(within(card).getByRole("meter")).toHaveAttribute("aria-valuenow", "0.6586");

    // Las dos claves fijadas para `trajectory_pressure`, no las cuatro del JSON.
    expect(card).toHaveTextContent(loose("Momento 100"));
    expect(card).toHaveTextContent(loose("Obligaciones 29 %"));
    expect(card).not.toHaveTextContent("Presión 14");
    expect(card).not.toHaveTextContent("Cambio 3 m");
    expect(card).not.toHaveTextContent(/health change|obligation coverage/i);

    // Confianza y cobertura son metadato de ingeniería: al `title`, no al cuerpo.
    expect(card).not.toHaveTextContent(/confianza|cobertura/i);
    expect(card.getAttribute("title")).toMatch(loose("Confianza 100 % · cobertura 100 %"));
  });

  it("DADO modifier_applied CUANDO se decide el ajuste ENTONCES solo lo pinta quien mueve el score, no quien trae delta", () => {
    render(<StrategicCards signals={SIGNALS} />);

    const [trajectory, network, sector, peers] = cards();
    expect(trajectory).toHaveTextContent(loose("ajuste +4,5 pts"));
    expect(network).toHaveTextContent(loose("ajuste +4,3 pts"));
    // `data_driven_peer_learning` publica `modifier_delta` con `modifier_applied: false`.
    expect(peers).not.toHaveTextContent("ajuste");
    expect(sector).not.toHaveTextContent("ajuste");
  });

  it("DADO claves y nombres que el front no conoce CUANDO llegan ENTONCES se ignoran en vez de tumbar la tarjeta", () => {
    render(
      <StrategicCards
        signals={[
          signal({ name: "brand_new_perspective", value: 10 }),
          signal({
            name: "sector_benchmark_rank",
            value: 89.74,
            evidence: { health_percentile: 89.74, financial_sector: "EUR_size_1e6_financed" },
          }),
        ]}
      />,
    );

    expect(cards()).toHaveLength(1);
    const card = cards()[0];
    expect(card).toHaveTextContent(loose("Percentil 89,7"));
    // `financial_sector` no está en el diccionario: no se pinta ni humanizado.
    expect(card).not.toHaveTextContent(/EUR_size_1e6_financed|financial sector/i);
    // `cohort_size` está traducida pero esta evidencia no la trae: tampoco inventa un 0.
    expect(card).not.toHaveTextContent("Cohorte");
  });

  it("DADO una fuente sin perspectivas CUANDO se pinta ENTONCES el bloque desaparece", () => {
    const { container } = render(<StrategicCards signals={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("region", { name: "Contexto" })).toBeNull();
  });
});
