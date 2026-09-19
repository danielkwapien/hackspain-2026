import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { getSelection, resetSelection } from "@/dashboard/selection";
import { isFavorite, resetWatchlist } from "@/dashboard/watchlist";
import { CompaniesPanel } from "@/panels/companies/CompaniesPanel";
import { universeExample } from "@/test/examples";
import { groupFixture, groupUniverseFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";

/** Grupo Arga (GROUP_0147): score 70 → banda `healthy`, Δ1m +1,3, Δ3m +4,5, confianza 0,86. */
const ARGA = groupUniverseFixture.items[0];

/** Filiales de Arga tal y como las publica `/groups/GROUP_0147`, ya ordenadas por score. */
const ARGA_COMPANIES = groupFixture.companies;

/**
 * Página de la vista Empresa: 21 filas (600 px / 28 = 21) con ids únicos sobre los
 * tres ejemplos del contrato, y el `total` real de `universe.json`.
 */
const COMPANY_PAGE = {
  ...universeExample,
  items: Array.from({ length: 21 }, (_, index) => {
    const base = universeExample.items[index % universeExample.items.length];
    return { ...base, id: `COMP_${String(1000 + index).padStart(4, "0")}` };
  }),
  limit: 21,
};

/** `unit=group` → grupos; cualquier otro `/universe` → empresas; `/groups/:id` → filiales. */
function mockPanel(groups = groupUniverseFixture) {
  return mockApi([
    { match: "unit=group", body: groups },
    { match: "/api/v2/universe", body: COMPANY_PAGE },
    { match: "/api/v2/groups/GROUP_0147", body: groupFixture },
  ]);
}

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

/** URLs que ha recibido el `fetch` simulado, en orden. */
function urls(fetchMock: ReturnType<typeof mockApi>): string[] {
  return fetchMock.mock.calls.map((call) => (typeof call[0] === "string" ? call[0] : ""));
}

function lastUrl(fetchMock: ReturnType<typeof mockApi>): string {
  return urls(fetchMock).at(-1) ?? "";
}

/** Fila cuyo nombre es `name`: sin columna Id, el nombre es lo único que identifica la fila. */
function rowNamed(name: string): HTMLElement {
  const rows = screen.getAllByRole("row");
  const found = rows.find((row) => within(row).queryByText(name));
  if (!found) throw new Error(`No hay fila para ${name}`);
  return found;
}

describe("panel Empresas", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("default view lists groups with disclosure, n, band dot before score, deltas, sparkline and confidence; no Id, Grupo, Banda or Comparar", async () => {
    mockPanel();
    renderPanel();

    expect(await screen.findByText(ARGA.name)).toBeInTheDocument();
    expect(screen.getByRole("treegrid", { name: "Empresas" })).toBeInTheDocument();

    const arga = rowNamed(ARGA.name);
    expect(arga).toHaveAttribute("aria-level", "1");
    expect(arga).toHaveAttribute("aria-expanded", "false");
    expect(within(arga).getByRole("button", { name: `Desplegar ${ARGA.name}` })).toBeInTheDocument();
    expect(within(arga).getAllByText(String(ARGA.n_companies_scored)).length).toBeGreaterThan(0);
    // Punto de banda (con su etiqueta solo para lectores) delante del score.
    expect(within(arga).getByText("Sana")).toBeInTheDocument();
    expect(within(arga).getByText(/70,0/)).toBeInTheDocument();
    expect(within(arga).getByText(/\+1,3/)).toBeInTheDocument();
    expect(within(arga).getByText(/\+4,5/)).toBeInTheDocument();
    expect(within(arga).getByRole("img", { name: /Sparkline/ })).toBeInTheDocument();
    expect(within(arga).getByText(/86\s?%/)).toBeInTheDocument();

    // Ni Id ni Grupo como columnas: el id solo vive en el `title` del nombre.
    expect(within(arga).queryByText(ARGA.id)).toBeNull();
    expect(within(arga).getByTitle(`${ARGA.name} · ${ARGA.id}`)).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Id" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Banda" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Comparar/ })).toBeNull();
  });

  it("expanding a group requests /groups/:id and paints its companies indented under it", async () => {
    const fetchMock = mockPanel();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(ARGA.name);

    await user.click(screen.getByRole("button", { name: `Desplegar ${ARGA.name}` }));

    await waitFor(() =>
      expect(urls(fetchMock).some((url) => url.includes("/api/v2/groups/GROUP_0147"))).toBe(true),
    );
    expect(await screen.findByText(ARGA_COMPANIES[0].name)).toBeInTheDocument();

    expect(rowNamed(ARGA.name)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: `Plegar ${ARGA.name}` })).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    const parentIndex = rows.indexOf(rowNamed(ARGA.name));
    ARGA_COMPANIES.forEach((company, index) => {
      const row = rowNamed(company.name);
      expect(row).toHaveAttribute("aria-level", "2");
      expect(rows.indexOf(row)).toBe(parentIndex + 1 + index);
    });
  });

  it("clicking a group row expands it and writes selectedGroup; clicking a child writes selected", async () => {
    mockPanel();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(ARGA.name);

    await user.click(screen.getByText(ARGA.name));
    expect(getSelection().selectedGroup).toBe(ARGA.id);
    expect(getSelection().selected).toBeNull();
    expect(rowNamed(ARGA.name)).toHaveAttribute("aria-expanded", "true");

    const child = ARGA_COMPANIES[0];
    await user.click(await screen.findByText(child.name));
    expect(getSelection().selected).toBe(child.id);
    expect(rowNamed(child.name)).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowRight expands, ArrowLeft collapses, Enter selects", async () => {
    mockPanel();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(ARGA.name);

    rowNamed(ARGA.name).focus();
    expect(rowNamed(ARGA.name)).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(rowNamed(ARGA.name)).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText(ARGA_COMPANIES[0].name)).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(rowNamed(ARGA.name)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(ARGA_COMPANIES[0].name)).toBeNull();

    await user.keyboard("{Enter}");
    expect(getSelection().selectedGroup).toBe(ARGA.id);
    expect(rowNamed(ARGA.name)).toHaveAttribute("aria-selected", "true");
  });

  it("Empresa view is a flat table paged by the container height (600 px → limit=21)", async () => {
    const fetchMock = mockPanel();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(ARGA.name);

    await user.click(
      within(screen.getByRole("group", { name: "Unidad" })).getByRole("button", {
        name: "Empresa",
      }),
    );

    await waitFor(() => expect(lastUrl(fetchMock)).toContain("unit=company"));
    expect(lastUrl(fetchMock)).toContain("limit=21");
    expect(lastUrl(fetchMock)).toContain("offset=0");

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).toBeNull();
    expect(screen.getByText(`1-21 de ${universeExample.total}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguientes" })).toBeInTheDocument();
  });

  it("sorting and band filter rewrite the query from offset 0", async () => {
    const fetchMock = mockPanel();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(ARGA.name);

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

  it("loading, empty and error states are one line each", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const pending = renderPanel();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    pending.unmount();

    mockPanel({ ...groupUniverseFixture, items: [], total: 0 });
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

  it("DADO cada fila CUANDO se mira su lateral derecho ENTONCES lleva una estrella con aria-pressed; el clic alterna el favorito sin seleccionar la fila", async () => {
    resetWatchlist([]);
    mockPanel();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(ARGA.name);

    expect(screen.getByRole("columnheader", { name: "Favorito" })).toBeInTheDocument();
    for (const group of groupUniverseFixture.items) {
      const star = within(rowNamed(group.name)).getByRole("button", { name: "Añadir a favoritos" });
      expect(star).toHaveAttribute("aria-pressed", "false");
      expect(star).toHaveAttribute("tabindex", "-1");
    }

    await user.click(within(rowNamed(ARGA.name)).getByRole("button", { name: "Añadir a favoritos" }));

    expect(isFavorite(ARGA.id)).toBe(true);
    const star = within(rowNamed(ARGA.name)).getByRole("button", { name: "Quitar de favoritos" });
    expect(star).toHaveAttribute("aria-pressed", "true");
    // La estrella no activa la fila: ni selección ni despliegue.
    expect(getSelection().selectedGroup).toBeNull();
    expect(rowNamed(ARGA.name)).toHaveAttribute("aria-expanded", "false");
    expect(rowNamed(ARGA.name)).toHaveAttribute("aria-selected", "false");

    await user.click(star);
    expect(isFavorite(ARGA.id)).toBe(false);
    expect(within(rowNamed(ARGA.name)).getByRole("button", { name: "Añadir a favoritos" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("DADO una fila enfocada CUANDO se pulsa f ENTONCES alterna su favorito y la selección no cambia", async () => {
    resetWatchlist([]);
    mockPanel();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText(ARGA.name);

    rowNamed(ARGA.name).focus();
    await user.keyboard("f");
    expect(isFavorite(ARGA.id)).toBe(true);
    expect(within(rowNamed(ARGA.name)).getByRole("button", { name: "Quitar de favoritos" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(rowNamed(ARGA.name)).toHaveFocus();

    await user.keyboard("f");
    expect(isFavorite(ARGA.id)).toBe(false);

    // Una filial también: desplegar, bajar y pulsar f sobre ella.
    await user.keyboard("{ArrowRight}");
    const child = ARGA_COMPANIES[0];
    await screen.findByText(child.name);
    await user.keyboard("{ArrowRight}");
    expect(rowNamed(child.name)).toHaveFocus();
    await user.keyboard("f");
    expect(isFavorite(child.id)).toBe(true);
    expect(isFavorite(ARGA.id)).toBe(false);

    expect(getSelection().selected).toBeNull();
    expect(getSelection().selectedGroup).toBeNull();
  });
});
