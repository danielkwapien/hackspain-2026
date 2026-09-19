import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { getSelection, resetSelection } from "@/dashboard/selection";
import { CompaniesPanel } from "@/panels/companies/CompaniesPanel";
import { universeExample } from "@/test/examples";
import { mockApi } from "@/test/helpers";

const [DUERO, LACALLE, BIERZO] = universeExample.items;

/** Una cuarta fila que baja: la única con `▼`, banda `watch` y régimen `deteriorating`. */
const CAIDA = {
  ...BIERZO,
  id: "COMP_0056",
  name: "Conservas Bierzo S.L.",
  band: "watch",
  regime: "deteriorating",
  delta_1m: -2.3,
  delta_3m: -4.4,
};

const universe = { ...universeExample, items: [DUERO, LACALLE, BIERZO, CAIDA], total: 4 };

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <CompaniesPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Última URL que recibió el `fetch` simulado: la consulta que sale de verdad. */
function lastUrl(fetchMock: ReturnType<typeof mockApi>): string {
  const calls = fetchMock.mock.calls;
  const last = calls[calls.length - 1]?.[0];
  return typeof last === "string" ? last : "";
}

function rowOf(id: string): HTMLElement {
  const rows = screen.getAllByRole("row");
  const found = rows.find((row) => within(row).queryByText(id));
  if (!found) throw new Error(`No hay fila para ${id}`);
  return found;
}

describe("panel Empresas", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("paints name, id, group, score, deltas with glyph, regime, sparkline and band", async () => {
    mockApi([{ match: "/api/v2/universe", body: universe }]);
    renderPanel();

    expect(await screen.findByText("Transportes Duero S.L.U.")).toBeInTheDocument();

    const duero = rowOf("COMP_0999");
    expect(within(duero).getByText("GROUP_0222")).toBeInTheDocument();
    expect(within(duero).getByText(/97,4/)).toBeInTheDocument();
    expect(within(duero).getAllByText(/▲/).length).toBeGreaterThan(0);
    expect(within(duero).getByText(/\+1,6/)).toBeInTheDocument();
    expect(within(duero).getByText(/\+9,2/)).toBeInTheDocument();
    expect(within(duero).getByText("Estable")).toBeInTheDocument();
    expect(within(duero).getByText("Sólida")).toBeInTheDocument();
    expect(within(duero).getByRole("img", { name: /Sparkline/ })).toBeInTheDocument();

    const caida = rowOf("COMP_0056");
    expect(within(caida).getAllByText(/▼/).length).toBeGreaterThan(0);
    expect(within(caida).getByText(/−2,3/)).toBeInTheDocument();
    expect(within(caida).getByText("Deteriorándose")).toBeInTheDocument();
    expect(within(caida).getByText("Vigilancia")).toBeInTheDocument();
  });

  it("sorting by a column and filtering by band rewrite the query from offset 0", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/universe", body: universe }]);
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Transportes Duero S.L.U.");

    const header = screen.getByRole("columnheader", { name: "Δ1m" });
    await user.click(within(header).getByRole("button", { name: "Δ1m" }));
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("sort=delta_1m&order=desc"));
    expect(lastUrl(fetchMock)).toContain("offset=0");
    expect(header).toHaveAttribute("aria-sort", "descending");

    await user.click(screen.getByRole("button", { name: /^Banda/ }));
    await user.click(screen.getByRole("menuitem", { name: "Vigilancia" }));
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("band=watch"));
    expect(lastUrl(fetchMock)).toContain("offset=0");
  });

  it("arrow keys move focus between rows and Enter selects", async () => {
    mockApi([{ match: "/api/v2/universe", body: universe }]);
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Transportes Duero S.L.U.");

    rowOf("COMP_0999").focus();
    expect(rowOf("COMP_0999")).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rowOf("COMP_0885"));

    await user.keyboard("{Enter}");
    expect(getSelection().selected).toBe("COMP_0885");
    expect(rowOf("COMP_0885")).toHaveAttribute("aria-selected", "true");
    expect(rowOf("COMP_0999")).not.toHaveAttribute("aria-selected", "true");
  });

  it("click selects and the row's Comparar button adds to compare", async () => {
    mockApi([{ match: "/api/v2/universe", body: universe }]);
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Transportes Duero S.L.U.");

    await user.click(within(rowOf("COMP_0885")).getByText("Logistica Lacalle S.A."));
    expect(getSelection().selected).toBe("COMP_0885");
    expect(getSelection().compare).toEqual([]);

    const compare = within(rowOf("COMP_0999")).getByRole("button", { name: /^Comparar/ });
    expect(compare).toHaveAttribute("aria-pressed", "false");
    await user.click(compare);
    expect(getSelection().compare).toContain("COMP_0999");
    expect(within(rowOf("COMP_0999")).getByRole("button", { name: /^Comparar/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("loading, empty and error states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const pending = renderPanel();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    pending.unmount();

    mockApi([{ match: "/api/v2/universe", body: { ...universe, items: [], total: 0 } }]);
    const empty = renderPanel();
    expect(await screen.findByText("Ninguna empresa cumple los filtros")).toBeInTheDocument();
    empty.unmount();

    mockApi([
      {
        match: "/api/v2/universe",
        body: { status: "error", message: "Sin tablas" },
        status: 500,
      },
    ]);
    renderPanel();
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("paginates: 1-200 de N", async () => {
    const items = Array.from({ length: 200 }, (_, index) => {
      const base = universe.items[index % universe.items.length];
      return { ...base, id: `COMP_${String(1000 + index).padStart(4, "0")}` };
    });
    mockApi([{ match: "/api/v2/universe", body: { ...universe, items, total: 1286 } }]);
    renderPanel();

    expect(await screen.findByText("1-200 de 1286")).toBeInTheDocument();
  });
});
