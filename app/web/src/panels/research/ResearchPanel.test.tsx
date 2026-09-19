import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { fmtDelta, fmtPoints } from "@/charts";
import { getSelection, resetSelection, select } from "@/dashboard/selection";
import { ResearchPanel } from "@/panels/research/ResearchPanel";
import { AS_OF, companyExample, timelineOf } from "@/test/examples";
import { mockApi } from "@/test/helpers";

const ID = companyExample.company.company_id; // COMP_1267
const ROUTE = `/api/v2/companies/${ID}`;

/**
 * Los 21 meses activos de `company.json` (`_truncated.timeline: 21`): sus tres
 * primeros puntos tal cual, una rampa hasta `alert.score_after` y el score de
 * `as_of` al final, para que `delta_1m` (1,11) salga de la propia serie.
 */
function exampleTimeline() {
  const known = companyExample.timeline.map((point) => point.score);
  const penultimate = companyExample.alert.score_after;
  const ramp = Array.from({ length: 16 }, (_, index) => {
    const t = (index + 1) / 17;
    return known[known.length - 1] + (penultimate - known[known.length - 1]) * t;
  });
  return timelineOf([...known, ...ramp, penultimate, companyExample.score], AS_OF);
}

const company = { ...companyExample, timeline: exampleTimeline() };

const PILLARS = ["Liquidez", "Pago propio", "Cobros", "Deuda", "Actividad"];

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

describe("panel Investigación", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("without a selection asks to pick a company", () => {
    mockApi([{ match: ROUTE, body: company }]);
    renderPanel();

    expect(screen.getByText("Selecciona una empresa")).toBeInTheDocument();
    expect(screen.queryByText(company.company.name)).toBeNull();
  });

  it("header: name, id, score, delta with glyph, regime and band", async () => {
    select(ID);
    mockApi([{ match: ROUTE, body: company }]);
    renderPanel();

    expect(await screen.findByText("Agricola Duero S.L.U.")).toBeInTheDocument();
    expect(screen.getByText(ID)).toBeInTheDocument();

    const score = fmtPoints(company.score);
    expect(score).toContain("57,4");
    // El normalizador de Testing Library colapsa el espacio fino (U+2009) del
    // texto del nodo, pero no el del matcher string: se compara con un regex.
    const scoreMatcher = new RegExp(
      score.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s"),
    );
    expect(screen.getAllByText(scoreMatcher).length).toBeGreaterThan(0);

    const delta = fmtDelta(company.delta_1m);
    expect(delta.glyph).toBe("▲");
    expect(screen.getAllByText(/▲/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+1,1/).length).toBeGreaterThan(0);

    expect(screen.getAllByText("Deteriorándose").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vigilancia").length).toBeGreaterThan(0);
  });

  it("LineNoAxes with the timeline and a forecast six months past as_of", async () => {
    select(ID);
    mockApi([{ match: ROUTE, body: company }]);
    renderPanel();

    const table = await screen.findByRole("table");
    expect(screen.getAllByRole("img").some((img) => img.getAttribute("aria-label"))).toBe(true);
    expect(within(table).getByRole("rowheader", { name: "agosto de 2026" })).toBeInTheDocument();
    // `outlook.h6` cae en as_of+6: 2027-02.
    expect(within(table).getByRole("rowheader", { name: "febrero de 2027" })).toBeInTheDocument();
  });

  it("five PillarBar meters, drivers with value_fmt and contribution, alert and headline", async () => {
    select(ID);
    mockApi([{ match: ROUTE, body: company }]);
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    const meters = screen.getAllByRole("meter");
    expect(meters).toHaveLength(5);
    for (const label of PILLARS) {
      expect(screen.getByRole("meter", { name: label })).toBeInTheDocument();
    }

    expect(screen.getByText("8 dias de colchon de caja")).toBeInTheDocument();
    // contribution -2.95 → «−3,0» con el menos tipográfico de `@/charts/format`.
    expect(screen.getAllByText(/−3,0/).length).toBeGreaterThan(0);

    expect(screen.getAllByText(/deterioro confirmado dos meses seguidos/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/revisar|review/i).length).toBeGreaterThan(0);

    expect(screen.getByText("Sube 1,1 puntos hasta 57 (a vigilar)")).toBeInTheDocument();
  });

  it("content lives in a data-company container that cross-fades", async () => {
    select(ID);
    mockApi([{ match: ROUTE, body: company }]);
    const { container } = renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    const box = container.querySelector(`[data-company="${ID}"]`);
    expect(box).not.toBeNull();
    expect(box).toHaveClass("animate-crossfade", "motion-reduce:animate-none");
    expect(getSelection().selected).toBe(ID);
  });

  it("with fewer than 3 timeline points shows Historia insuficiente", async () => {
    select(ID);
    mockApi([{ match: ROUTE, body: { ...company, timeline: timelineOf([56.3, 57.4]) } }]);
    renderPanel();

    expect(await screen.findByText("Historia insuficiente")).toBeInTheDocument();
  });

  it("404 shows an error with Reintentar", async () => {
    select(ID);
    mockApi([
      { match: ROUTE, body: { status: "not_found", message: "company_not_found" }, status: 404 },
    ]);
    renderPanel();

    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
