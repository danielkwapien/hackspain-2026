import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { fmtPoints, fmtSizeShort } from "@/charts";
import { getSelection, resetSelection } from "@/dashboard/selection";
import type { LayoutItem } from "@/dashboard/types";
import { PORTFOLIO } from "@/dashboard/watchlist";
import { companyFixtureFor } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { PortfolioWidget } from "@/widgets/portfolio/PortfolioWidget";

/** Texto exacto con espacio fino: Testing Library normaliza U+2009 en el nodo, no en el matcher. */
function thin(expected: string): RegExp {
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s");
  return new RegExp(`^${escaped}$`);
}

const ITEM: LayoutItem = { i: "w1", type: "portfolio", x: 0, y: 13, w: 8, h: 11, entity: null };

/** Las seis fichas de la cartera, con la forma de `/companies/:id`. */
const COMPANIES = PORTFOLIO.map((position) => companyFixtureFor(position.id));

const TOTAL = PORTFOLIO.reduce((sum, position) => sum + position.amount, 0);

/** Score medio ponderado por importe, calculado a mano sobre las fixtures. */
const WEIGHTED =
  PORTFOLIO.reduce(
    (sum, position, index) => sum + position.amount * COMPANIES[index].score,
    0,
  ) / TOTAL;

const STRESS = COMPANIES.filter((company) => company.band === "stress").length;
const WATCH = COMPANIES.filter((company) => company.band === "watch").length;

function renderWidget() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <PortfolioWidget item={ITEM} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockPortfolio() {
  return mockApi(
    COMPANIES.map((company) => ({
      match: `/api/v2/companies/${company.company.company_id}`,
      body: company,
    })),
  );
}

function rows(): HTMLElement[] {
  return within(screen.getByRole("listbox", { name: "Cartera" })).getAllByRole("option");
}

function rowNamed(name: string): HTMLElement {
  const found = rows().find((row) => within(row).queryByText(name));
  if (!found) throw new Error(`No hay fila para ${name}`);
  return found;
}

/** `dd` que sigue al `dt` con ese texto en la cabecera. */
function statValue(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "dt" });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement) || value.tagName !== "DD") {
    throw new Error(`«${label}» no va seguido de un dd`);
  }
  return value;
}

describe("widget Cartera", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("DADO las seis fichas CUANDO se monta ENTONCES cabecera Invertido EUR 3,6 M · Score medio ponderado · En riesgo, y seis filas de 28 px con importe, score, Δ1m y sparkline", async () => {
    const fetchMock = mockPortfolio();
    renderWidget();

    for (const company of COMPANIES) {
      expect(await screen.findByText(company.company.name)).toBeInTheDocument();
    }
    expect(fetchMock).toHaveBeenCalledTimes(COMPANIES.length);

    expect(statValue("Invertido")).toHaveTextContent(thin(fmtSizeShort(TOTAL, "EUR")));
    expect(statValue("Invertido")).toHaveTextContent(/3,6\sM/);
    expect(statValue("Score medio")).toHaveTextContent(thin(fmtPoints(WEIGHTED)));
    expect(statValue("En riesgo")).toHaveTextContent(
      new RegExp(`${STRESS} tensión\\s·\\s${WATCH} vigilancia`),
    );

    const items = rows();
    expect(items).toHaveLength(PORTFOLIO.length);
    PORTFOLIO.forEach((position, index) => {
      const row = items[index];
      const company = COMPANIES[index];
      expect(row).toHaveTextContent(company.company.name);
      expect(`${row.className} ${row.getAttribute("style") ?? ""}`).toMatch(/h-7\b|28px/);
      expect(within(row).getByText(thin(fmtSizeShort(position.amount, "EUR")))).toBeInTheDocument();
      expect(within(row).getByText(thin(fmtPoints(company.score)))).toBeInTheDocument();
      expect(within(row).getByRole("img")).toBeInTheDocument();
    });
    // La cartera no se edita: ni estrella ni botón de añadir.
    expect(screen.queryByRole("button", { name: /favoritos/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Añadir/ })).toBeNull();
  });

  it("DADO una fila CUANDO clic ENTONCES select(id) y selectedEntity company; la fila lleva aria-selected", async () => {
    mockPortfolio();
    const user = userEvent.setup();
    renderWidget();
    const target = COMPANIES[2];
    await screen.findByText(target.company.name);

    await user.click(within(rowNamed(target.company.name)).getByText(target.company.name));

    expect(getSelection().selected).toBe(target.company.company_id);
    expect(getSelection().selectedEntity).toEqual({
      kind: "company",
      id: target.company.company_id,
    });
    expect(rowNamed(target.company.name)).toHaveAttribute("aria-selected", "true");
    expect(rowNamed(COMPANIES[0].company.name)).toHaveAttribute("aria-selected", "false");
  });
});
