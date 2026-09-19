import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { getSelection, resetSelection } from "@/dashboard/selection";
import type { LayoutItem } from "@/dashboard/types";
import { treemapExample } from "@/test/examples";
import { mockApi } from "@/test/helpers";
import { TreemapWidget } from "@/widgets/treemap/TreemapWidget";

const ITEM: LayoutItem = { i: "w1", type: "treemap", x: 0, y: 0, w: 12, h: 12, entity: null };

/** El tile más grande del primer grupo del ejemplo (`Bierzo Holding`). */
const BIG_TILE = "COMP_1185";

const tileCount = treemapExample.groups.reduce((sum, group) => sum + group.items.length, 0);

function renderWidget() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <TreemapWidget item={ITEM} />
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

function tiles(): HTMLElement[] {
  return within(screen.getByRole("group", { name: /Mapa de empresas por grupo/ })).getAllByRole("button");
}

describe("widget Mapa", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("DADO /treemap CUANDO se monta ENTONCES un Treemap con un grupo por bucket y el tile COMP_1185", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();

    expect(await screen.findByRole("button", { name: new RegExp(BIG_TILE) })).toBeInTheDocument();
    expect(lastUrl(fetchMock)).toContain("/api/v2/treemap");
    expect(lastUrl(fetchMock)).toContain("group_by=group");
    expect(lastUrl(fetchMock)).toContain("metric=delta_3m");

    // `FakeResizeObserver` mide 800 × 600: el mapa tiene tamaño y pinta todos los tiles.
    expect(tiles()).toHaveLength(tileCount);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(tileCount);
    for (const group of treemapExample.groups) {
      expect(screen.getByText(group.key)).toBeInTheDocument();
    }
    expect(screen.queryByText(/sin Δ en este corte/)).toBeNull();
  });

  it("DADO un tile CUANDO clic ENTONCES select(id)", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderWidget();

    const tile = await screen.findByRole("button", { name: new RegExp(BIG_TILE) });
    await user.click(tile);

    expect(getSelection().selected).toBe(BIG_TILE);
  });

  it("DADO un item con color_value null CUANDO se monta ENTONCES no se pinta y el pie dice «1 empresa sin Δ»", async () => {
    const [first, ...rest] = treemapExample.groups;
    const [big, ...others] = first.items;
    const withNull = {
      ...treemapExample,
      groups: [{ ...first, items: [{ ...big, color_value: null }, ...others] }, ...rest],
    };
    mockApi([{ match: "/api/v2/treemap", body: withNull }]);
    renderWidget();

    expect(await screen.findByText("1 empresa sin Δ3m en este corte")).toBeInTheDocument();
    // El treemap se pinta tras medir el contenedor: se espera a que exista antes de contar.
    await screen.findByRole("group", { name: /Mapa de empresas por grupo/ });
    expect(screen.queryByRole("button", { name: new RegExp(BIG_TILE) })).toBeNull();
    expect(tiles()).toHaveLength(tileCount - 1);
    // Nunca se imputa 0 a quien no tiene Δ.
    expect(screen.queryByRole("button", { name: new RegExp(`${BIG_TILE}, 0`) })).toBeNull();
  });

  it("DADO la pill Δ1m CUANDO se elige ENTONCES la consulta se reescribe con metric=delta_1m", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: new RegExp(BIG_TILE) });

    const metrics = screen.getByRole("radiogroup");
    expect(within(metrics).getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Δ3m",
      "Δ1m",
      "Score",
    ]);
    expect(within(metrics).getByRole("radio", { name: "Δ3m" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(within(metrics).getByRole("radio", { name: "Δ1m" }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain("metric=delta_1m"));
    expect(within(metrics).getByRole("radio", { name: "Δ1m" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
