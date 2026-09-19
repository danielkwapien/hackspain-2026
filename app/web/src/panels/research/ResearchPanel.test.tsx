import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { resetSelection, select } from "@/dashboard/selection";
import { ResearchPanel } from "@/panels/research/ResearchPanel";
import {
  AS_OF,
  catalogExample,
  companyExample,
  metaExample,
  monthsEndingAt,
  signalsExample,
  timelineExample,
  timelineOf,
} from "@/test/examples";
import { mockApi } from "@/test/helpers";

const ID = companyExample.company.company_id; // COMP_1267
const ROUTE = `/api/v2/companies/${ID}`;

/** Los 24 meses del contrato, de `2024-09` a `AS_OF`. */
const MONTHS = monthsEndingAt(AS_OF, 24);

/**
 * Score de los 24 meses: termina en 57,4 con Δ1m +1,1 (56,3 → 57,4). El primer mes
 * visible a 1A es `2025-08` (índice 11): 56,6 con Δ1m −0,6 respecto a 57,2.
 */
const SCORES = [
  65.2, 64.0, 62.7, 61.5, 60.8, 60.1, 59.6, 59.0, 58.4, 57.9, 57.2, 56.6, 56.0, 55.4, 55.1, 54.8,
  54.3, 60.2, 61.9, 61.0, 59.7, 58.1, 56.3, 57.4,
];

/** Identidad de la metodología: 70,0 + (−3,1) − 9,5 − 0,0 = 57,4. */
const BASE = 70;
const PENALTY = 9.5;
const SCORE = 57.4;

/** Contribuciones de Liquidez: suman −3,1; la cuarta señal no aplica. */
const L_SIGNALS = [
  { id: "L1", name: "Dias de colchon de caja", unit: "dias", contribution: -1.2, value: 8 },
  { id: "L2", name: "Minimo de caja sobre salidas", unit: "ratio", contribution: -0.6, value: 0.76 },
  { id: "L3", name: "Dias en negativo", unit: "dias", contribution: -1.3, value: 4 },
];

const company = {
  ...companyExample,
  base: BASE,
  score: SCORE,
  delta_1m: 1.1,
  confidence: 1,
  cap: null,
  penalty: { ...companyExample.penalty, points: PENALTY, weakest_pillar: "L" },
  timeline: timelineOf(SCORES, AS_OF),
};

/** `/timeline`: una fila por mes con la forma del ejemplo; confianza 0,7 salvo el corte. */
const timeline = MONTHS.map((month, index) => ({
  ...timelineExample[0],
  month,
  score: SCORES[index],
  delta_1m: index === 0 ? null : Math.round((SCORES[index] - SCORES[index - 1]) * 10) / 10,
  confidence: index === MONTHS.length - 1 ? 1 : 0.7,
  base: BASE,
  penalty: PENALTY,
  cap: null,
}));

/** Plantillas con la forma real de `/signals`. */
const SIGNAL_TEMPLATE = signalsExample.pillars[0].signals[0];
const POINT_TEMPLATE = SIGNAL_TEMPLATE.series_24m[0];

/** `value_fmt` de L1 en cada mes: `8` en el corte, `20` en `2025-08`. */
function dias(value: number): string {
  return `${value} dias de colchon de caja`;
}

function liquiditySignal({
  id,
  name,
  unit,
  contribution,
  value,
}: (typeof L_SIGNALS)[number]) {
  const fmt = (v: number, month: string) =>
    id === "L1" ? dias(v) : `${name.toLowerCase()} ${v} (${month})`;
  return {
    ...SIGNAL_TEMPLATE,
    signal_id: id,
    name,
    unit,
    is_available: true,
    quality_flag: null,
    value,
    value_fmt: fmt(value, AS_OF),
    u: 0.41,
    u_smooth: 0.42,
    weight: 0.1,
    contribution,
    delta_vs_prev: 0.12,
    series_24m: MONTHS.map((month, index) => {
      const v = id === "L1" ? value + (MONTHS.length - 1 - index) : value;
      return {
        ...POINT_TEMPLATE,
        month,
        value: v,
        value_fmt: fmt(v, month),
        u: 0.41,
        u_smooth: 0.42,
        weight: 0.1,
        contribution,
        delta_vs_prev: 0.12,
        is_available: true,
      };
    }),
  };
}

/** Señal sin dato: `is_available=false` con un valor crudo a 0 que NUNCA debe pintarse. */
const UNAVAILABLE = {
  ...liquiditySignal({ id: "L4", name: "Cobertura de deuda a corto", unit: "meses", contribution: 0, value: 0 }),
  is_available: false,
  value_fmt: "0 meses de cobertura",
  contribution: 0,
  u: 0,
  u_smooth: 0,
};

const signals = {
  ...signalsExample,
  company_id: ID,
  pillars: [
    { pillar: "L", pillar_name: "Liquidez", signals: [...L_SIGNALS.map(liquiditySignal), UNAVAILABLE] },
    ...signalsExample.pillars
      .filter((pillar) => pillar.pillar !== "L")
      .map((pillar) => ({
        ...pillar,
        signals: pillar.signals.map((signal) => ({ ...signal, contribution: 0 })),
      })),
  ],
};

/** Las rutas más específicas (`/signals`, `/timeline`) van antes que la ficha. */
function mockSheet(signalsRoute: { body: unknown; status?: number } = { body: signals }) {
  return mockApi([
    { match: `${ROUTE}/signals`, ...signalsRoute },
    { match: `${ROUTE}/timeline`, body: timeline },
    { match: ROUTE, body: company },
    { match: "/api/v2/meta", body: metaExample },
    { match: "/api/v2/catalog/signals", body: catalogExample },
  ]);
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ResearchPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Regex tolerante al espacio fino (U+2009): el normalizador de Testing Library lo
 * colapsa en el nodo pero no en un matcher string.
 */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

/** El trío de KPIs de la cabecera: `dl` con Score, Δ 1 m y Confianza. */
function kpis(): HTMLElement {
  const dl = screen.getByText("Score").closest("dl");
  if (!dl) throw new Error("La cabecera no tiene el dl de KPIs");
  return dl;
}

function mockLayout() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 600,
    bottom: 168,
    width: 600,
    height: 168,
    toJSON: () => ({}),
  } as DOMRect);
}

function chartSurface(container: HTMLElement): HTMLElement {
  const surface = container.querySelector<HTMLElement>('[data-slot="line-no-axes"]');
  if (!surface) throw new Error("No hay gráfica");
  return surface;
}

describe("panel Investigación", () => {
  beforeEach(() => {
    resetSelection();
    select(ID);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("header shows only name, score, Δ1m and confidence (no regime, band or outlook words)", async () => {
    mockSheet();
    renderPanel();

    expect(await screen.findByText("Agricola Duero S.L.U.")).toBeInTheDocument();

    const dl = kpis();
    expect(within(dl).getByText("Score")).toBeInTheDocument();
    expect(within(dl).getByText("Δ 1 m")).toBeInTheDocument();
    expect(within(dl).getByText("Confianza")).toBeInTheDocument();
    expect(dl).toHaveTextContent(loose("57,4 pts"));
    expect(dl).toHaveTextContent(loose("▲ +1,1 pts"));
    expect(dl).toHaveTextContent(/100\s?%/);

    // La metodología nombra regímenes y bandas más abajo: lo que se prohíbe es en la cabecera.
    const header = dl.parentElement;
    if (!header) throw new Error("El dl de KPIs no tiene cabecera");
    expect(within(header).getByText("Agricola Duero S.L.U.")).toBeInTheDocument();
    expect(within(header).queryByText(/Deteriorándose|Vigilancia|Outlook|COMP_1267/)).toBeNull();
    expect(screen.queryByText("Outlook 6 m")).toBeNull();
    expect(screen.queryByText(/Pilares del score|Qué se movió|vs mes ant\./)).toBeNull();
  });

  it("range and family toggles are radiogroups; 1A and Liquidez by default; ArrowRight moves the family", async () => {
    mockSheet();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    const range = screen.getByRole("radiogroup", { name: "Rango" });
    for (const name of ["3M", "6M", "1A", "Máx"]) {
      expect(within(range).getByRole("radio", { name })).toHaveAttribute(
        "aria-checked",
        name === "1A" ? "true" : "false",
      );
    }

    const family = screen.getByRole("radiogroup", { name: "Familia" });
    for (const name of ["Liquidez", "Pago", "Cobros", "Deuda", "Actividad"]) {
      expect(within(family).getByRole("radio", { name })).toHaveAttribute(
        "aria-checked",
        name === "Liquidez" ? "true" : "false",
      );
    }

    within(family).getByRole("radio", { name: "Liquidez" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(family).getByRole("radio", { name: "Pago" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(family).getByRole("radio", { name: "Pago" })).toHaveFocus();
    expect(within(family).getByRole("radio", { name: "Liquidez" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("family grid lists the pillar's signals with value_fmt, contribution in pts, a meter and No aplica for unavailable ones (never 0)", async () => {
    mockSheet();
    renderPanel();

    expect(await screen.findByText(dias(8))).toBeInTheDocument();
    expect(screen.getByText("minimo de caja sobre salidas 0.76 (2026-08)")).toBeInTheDocument();
    expect(screen.getByText("dias en negativo 4 (2026-08)")).toBeInTheDocument();

    expect(screen.getByText(loose("−1,2 pts"))).toBeInTheDocument();
    expect(screen.getByText(loose("−0,6 pts"))).toBeInTheDocument();
    expect(screen.getByText(loose("−1,3 pts"))).toBeInTheDocument();
    expect(screen.getAllByRole("meter").length).toBeGreaterThanOrEqual(3);

    expect(screen.getAllByText("No aplica").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 meses de cobertura")).toBeNull();
  });

  it("hovering the chart swaps the header KPIs and the family values to the hovered month and shows no tooltip", async () => {
    mockSheet();
    const { container } = renderPanel();
    await screen.findByText(dias(8));
    mockLayout();

    // A 1A la gráfica arranca en `2025-08`: el borde izquierdo apunta a ese mes.
    fireEvent.pointerMove(chartSurface(container), { clientX: 0 });

    const dl = kpis();
    await waitFor(() => expect(dl).toHaveTextContent(loose("56,6 pts")));
    expect(dl).toHaveTextContent(loose("▼ −0,6 pts"));
    expect(dl).toHaveTextContent(/70\s?%/);
    expect(dl).toHaveTextContent("08/2025");
    expect(dl).toHaveAttribute("aria-live", "polite");

    // La familia lee el punto de `series_24m` del mes apuntado.
    expect(screen.getByText(dias(20))).toBeInTheDocument();
    expect(screen.queryByText(dias(8))).toBeNull();

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(container.querySelector('[data-slot="crosshair"]')).not.toBeNull();
  });

  it("leaving the chart restores the as_of figures", async () => {
    mockSheet();
    const { container } = renderPanel();
    await screen.findByText(dias(8));
    mockLayout();

    const surface = chartSurface(container);
    fireEvent.pointerMove(surface, { clientX: 0 });
    await waitFor(() => expect(kpis()).toHaveTextContent("08/2025"));

    fireEvent.pointerLeave(surface);

    await waitFor(() => expect(kpis()).not.toHaveTextContent("08/2025"));
    expect(kpis()).toHaveTextContent(loose("57,4 pts"));
    expect(kpis()).toHaveTextContent(loose("▲ +1,1 pts"));
    expect(kpis()).toHaveTextContent(/100\s?%/);
    expect(screen.getByText(dias(8))).toBeInTheDocument();
    expect(screen.queryByText(dias(20))).toBeNull();
  });

  it("methodology is always visible and prints λ, τ, caps, φ and the additive identity with the company's numbers", async () => {
    mockSheet();
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    const section = await screen.findByRole("region", { name: "Cómo se calcula" });
    expect(within(section).getByText("Cómo se calcula")).toBeInTheDocument();
    // Sin desplegar nada: está en el flujo del panel.
    expect(screen.queryByRole("button", { name: /Cómo se calcula|Metodolog/ })).toBeNull();

    await waitFor(() => expect(section).toHaveTextContent(loose("λ = 0,5")));
    expect(section).toHaveTextContent(loose("τ = 0,45"));
    expect(section).toHaveTextContent(/φ/);
    expect(section).toHaveTextContent(/0,85/);
    expect(section).toHaveTextContent(/techo/i);
    expect(section).toHaveTextContent(/sin techo/i);
    expect(section).toHaveTextContent(loose("70,0 + (−3,1) − 9,5 − 0,0 = 57,4"));
  });

  it("signals error shows an error with Reintentar while the header stays", async () => {
    mockSheet({ body: { status: "error", message: "Sin señales" }, status: 500 });
    renderPanel();

    expect(await screen.findByText("Agricola Duero S.L.U.")).toBeInTheDocument();
    expect((await screen.findAllByRole("button", { name: "Reintentar" })).length).toBeGreaterThan(0);
    expect(kpis()).toHaveTextContent(loose("57,4 pts"));
    expect(screen.queryByText(dias(8))).toBeNull();
  });
});
