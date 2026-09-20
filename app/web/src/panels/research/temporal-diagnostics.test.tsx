import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { resetSelection, select } from "@/dashboard/selection";
import { companyExample, monthsEndingAt, timelineExample } from "@/test/examples";
import { mockApi } from "@/test/helpers";
import { ResearchPanel } from "@/panels/research/ResearchPanel";

const ID = "COMP_XR033";
const ROUTE = `/api/v2/companies/${ID}`;
const AS_OF = "2026-08";

const TEMPORAL_TIMELINE = monthsEndingAt(AS_OF, 24).map((month, index) => ({
  ...timelineExample[0],
  month,
  base: null,
  score: 50 + index * 0.4,
  delta_1m: null,
  delta_3m: null,
  delta_6m: null,
  outlook_3m: null,
  outlook_6m: null,
  outlook_low: null,
  outlook_high: null,
  confidence: null,
  regime: index < 6 ? null : "stable",
  pillars: {
    L: { value: index < 6 ? null : 0.4, weight: index < 6 ? 0 : 0.25 },
    P: { value: 0.55, weight: 0.2 },
    C: { value: null, weight: 0 },
    D: { value: 0.7, weight: 0.2 },
    A: { value: null, weight: 0 },
  },
}));

const temporalCompany = {
  ...companyExample,
  company: { ...companyExample.company, company_id: ID, name: "Temporal XR033" },
  as_of: AS_OF,
  snapshot: null,
  base: null,
  score: TEMPORAL_TIMELINE.at(-1)?.score ?? null,
  band: "watch",
  delta_1m: null,
  delta_3m: null,
  delta_6m: null,
  regime: null,
  confidence: null,
  outlook: null,
  pillars: null,
  penalty: null,
  timeline: [],
};

const staticCompany = {
  ...temporalCompany,
  score: null,
  band: null,
  snapshot: {
    status: "insufficient_data",
    score: null,
    band: null,
    cutoff_date: "2026-09-01",
    model_version: "static-baseline-v1",
    data_version: "embat-v2",
    quality: {
      coverage_ratio: 0,
      reasons: [],
      warnings: [],
      excluded_currency_rows: 0,
      invalid_date_rows: 0,
    },
    factors: {},
    drivers: [],
  },
};

function renderPanel(company: unknown = temporalCompany, timeline: unknown = TEMPORAL_TIMELINE) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  mockApi([
    { match: `${ROUTE}/timeline`, body: timeline },
    { match: ROUTE, body: company },
  ]);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ResearchPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Cifra de un término de la cabecera (`dt` → su `dd`), p. ej. «Confianza» → «—». */
function termValue(term: string): string {
  return screen.getByText(term).parentElement?.querySelector("dd")?.textContent ?? "";
}

describe("temporal rendering diagnostics", () => {
  beforeEach(() => {
    resetSelection();
    select(ID);
  });

  it("renders real temporal history when nullable current fields are absent", async () => {
    const { container } = renderPanel();

    expect(await screen.findByText("Temporal XR033")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="line-no-axes"]')).not.toBeNull();
    expect(screen.queryByText("Esta empresa forma parte del dataset.")).toBeNull();
    // La historia se pinta con el score real; una confianza nula va en «—», no en 0.
    // XR-038 (W1.2): la cifra abre la celda CON su unidad, y el delta va detrás
    // entre paréntesis con la suya.
    expect(termValue("Score")).toMatch(/^\d+,\d\s*pts\s*\(/);
    expect(termValue("Confianza")).toBe("—");
    // La perspectiva, en cambio, desaparece de la cabecera cuando no existe: un
    // hueco en el sitio mas visible de la ficha promete algo que no se cumple.
    expect(screen.queryByText("Outlook 6 m")).toBeNull();
  });

  it("keeps a company with a static snapshot on SnapshotSheet", async () => {
    const { container } = renderPanel(staticCompany, []);

    expect(await screen.findByText(/Evaluación al/)).toBeInTheDocument();
    expect(screen.getByText("Sin score")).toBeInTheDocument();
    expect(screen.getAllByText("Cobertura insuficiente").length).toBeGreaterThan(0);
    expect(screen.queryByText("Historia insuficiente: hacen falta tres meses de score")).toBeNull();
    expect(container.querySelector('[data-slot="line-no-axes"]')).toBeNull();
  });

  it("renders an empty temporal dataset without crashing or imputing zero", async () => {
    const emptyTimeline = TEMPORAL_TIMELINE.map((row) => ({ ...row, score: null, pillars: null }));
    const { container } = renderPanel({ ...temporalCompany, score: null }, emptyTimeline);

    expect(await screen.findByText("Temporal XR033")).toBeInTheDocument();
    expect(screen.getByText("Historia insuficiente: hacen falta tres meses de score")).toBeInTheDocument();
    // Sin score no hay cifra ni delta: «—» pelado, y el rótulo «Δ 1A» ya no existe.
    expect(termValue("Score")).toBe("—");
    expect(screen.queryByText("Δ 1A")).toBeNull();
    expect(container.querySelector('[data-slot="line-no-axes"]')).toBeNull();
  });
});
