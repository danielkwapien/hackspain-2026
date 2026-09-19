import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { getState, resetStore } from "@/dashboard/store";
import type { LayoutItem } from "@/dashboard/types";
import { universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { Screener } from "./Screener";

function layout(): LayoutItem[] {
  const state = getState();
  const workspace = state.workspaces.find((candidate) => candidate.id === state.active);
  if (!workspace) throw new Error("No hay espacio activo");
  return workspace.layout;
}

/** El preset por defecto trae un buscador y una tarjeta de score, ambos en verde. */
function widgetOfType(type: string): LayoutItem {
  const found = layout().find((candidate) => candidate.type === type);
  if (!found) throw new Error(`No existe un widget de tipo ${type}`);
  return found;
}

function CompanyStub() {
  const { id } = useParams();
  return <p>{`Ficha de ${id}`}</p>;
}

function renderScreener() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Screener item={widgetOfType("screener")} />} />
          <Route path="/company/:id" element={<CompanyStub />} />
        </Routes>
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

describe("Buscador de empresas", () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders rows from /api/v2/universe with tabular numbers and sorts by score', async () => {
    const fetchMock = mockApi([{ match: "/api/v2/universe", body: universeFixture }]);
    const user = userEvent.setup();
    renderScreener();

    expect(await screen.findByText("Distribuciones Arga S.L.")).toBeInTheDocument();
    // Las 12 filas de la fixture caben en el alto simulado: la virtualización las pinta todas.
    expect(screen.getByText("Herrajes Zubiri S.A.")).toBeInTheDocument();

    const row = rowOf("COMP_0001");
    expect(within(row).getByText("74")).toHaveClass("font-mono", "tabular-nums");
    expect(within(row).getByText("+2,4")).toHaveClass("text-content-positive");
    expect(within(row).getByText("Mejorando")).toBeInTheDocument();
    expect(within(row).getByText("Sana")).toBeInTheDocument();

    const scoreHeader = () => screen.getByRole("columnheader", { name: "Score" });
    expect(scoreHeader()).toHaveAttribute("aria-sort", "none");

    await user.click(within(scoreHeader()).getByRole("button", { name: "Score" }));
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("sort=score"));
    expect(lastUrl(fetchMock)).toContain("order=desc");
    expect(scoreHeader()).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: "Δ1m" })).toHaveAttribute("aria-sort", "none");

    // Segundo clic en la misma columna: invierte el orden, no lo repite.
    await user.click(within(scoreHeader()).getByRole("button", { name: "Score" }));
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("order=asc"));
    expect(scoreHeader()).toHaveAttribute("aria-sort", "ascending");
  });

  it('filter pills change the query and reset pagination', async () => {
    const fetchMock = mockApi([{ match: "/api/v2/universe", body: universeFixture }]);
    const user = userEvent.setup();
    renderScreener();

    await screen.findByText("Distribuciones Arga S.L.");

    await user.click(screen.getByRole("button", { name: /^Banda/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sólida" }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain("band=solid"));
    expect(lastUrl(fetchMock)).toContain("offset=0");
    expect(screen.getByRole("button", { name: /Banda: Sólida/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Régimen/ }));
    await user.click(screen.getByRole("menuitem", { name: "Deteriorándose" }));
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("regime=deteriorating"));
    expect(lastUrl(fetchMock)).toContain("offset=0");

    // Dos botones se llaman "Grupo": la pill (que despliega) y la unidad (que se pulsa).
    await user.click(screen.getByRole("button", { name: "Grupo", expanded: false }));
    await user.click(screen.getByRole("menuitem", { name: "GROUP_0288" }));
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("group_id=GROUP_0288"));

    // Quitar un filtro es otra reescritura de la consulta, también desde la primera página.
    await user.click(screen.getByRole("button", { name: "Quitar filtro de banda" }));
    await waitFor(() => expect(lastUrl(fetchMock)).not.toContain("band=solid"));
    expect(lastUrl(fetchMock)).toContain("offset=0");

    await user.click(screen.getByRole("button", { name: "Grupo", pressed: false }));
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("unit=group"));
    expect(lastUrl(fetchMock)).toContain("offset=0");

    await user.type(screen.getByRole("searchbox", { name: "Buscar empresa" }), "Arga");
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("q=Arga"));
    expect(lastUrl(fetchMock)).toContain("offset=0");
  });

  it('row click sets entity in link group; "Abrir" navigates to /company/:id', async () => {
    mockApi([{ match: "/api/v2/universe", body: universeFixture }]);
    const user = userEvent.setup();
    renderScreener();

    await screen.findByText("Distribuciones Arga S.L.");

    await user.click(rowOf("COMP_0001"));

    // El buscador y la tarjeta de score comparten vínculo verde: los dos reciben la entidad.
    const entities = layout().map((widget) => widget.entities[0]?.id);
    expect(entities).toEqual(["COMP_0001", "COMP_0001"]);
    expect(widgetOfType("score-card").entities[0]).toEqual({
      kind: "company",
      id: "COMP_0001",
      name: "Distribuciones Arga S.L.",
    });

    await user.click(within(rowOf("COMP_0001")).getByRole("button", { name: "Abrir" }));

    expect(await screen.findByText("Ficha de COMP_0001")).toBeInTheDocument();
  });
});
