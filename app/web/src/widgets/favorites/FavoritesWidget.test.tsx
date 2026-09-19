import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { fmtPoints } from "@/charts";
import { getSelection, resetSelection } from "@/dashboard/selection";
import type { LayoutItem } from "@/dashboard/types";
import { getWatchlist, isFavorite, resetWatchlist } from "@/dashboard/watchlist";
import { companyFixture, groupFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { FavoritesWidget } from "@/widgets/favorites/FavoritesWidget";

/** Texto exacto con espacio fino: Testing Library normaliza U+2009 en el nodo, no en el matcher. */
function thin(expected: string): RegExp {
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s");
  return new RegExp(`^${escaped}$`);
}

const COMPANY_ID = companyFixture.company.company_id; // COMP_0001
const COMPANY_NAME = companyFixture.company.name;
const GROUP_ID = groupFixture.group.group_id; // GROUP_0288
const GROUP_NAME = groupFixture.group.name;

const ITEM: LayoutItem = { i: "w1", type: "favorites", x: 18, y: 0, w: 6, h: 13, entity: null };

function renderWidget() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <FavoritesWidget item={ITEM} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockFavorites() {
  return mockApi([
    { match: `/api/v2/companies/${COMPANY_ID}`, body: companyFixture },
    { match: `/api/v2/groups/${GROUP_ID}`, body: groupFixture },
  ]);
}

function requestedUrls(fetchMock: ReturnType<typeof mockApi>): string[] {
  return fetchMock.mock.calls.map(([input]) => (typeof input === "string" ? input : ""));
}

function list(): HTMLElement {
  return screen.getByRole("listbox", { name: "Favoritos" });
}

function rows(): HTMLElement[] {
  return within(list()).getAllByRole("option");
}

/** Fila cuyo nombre es `name`. */
function rowNamed(name: string): HTMLElement {
  const found = rows().find((row) => within(row).queryByText(name));
  if (!found) throw new Error(`No hay fila para ${name}`);
  return found;
}

describe("widget Favoritos", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSelection();
    resetWatchlist([COMPANY_ID, GROUP_ID]);
  });

  it("DADO 1 empresa y 1 grupo en la lista CUANDO se monta ENTONCES pide /companies y /groups y pinta dos filas de 28 px en orden, con chip G, score, Δ y sparkline", async () => {
    const fetchMock = mockFavorites();
    renderWidget();

    expect(await screen.findByText(COMPANY_NAME)).toBeInTheDocument();
    expect(await screen.findByText(GROUP_NAME)).toBeInTheDocument();
    const urls = requestedUrls(fetchMock);
    expect(urls.some((url) => url.includes(`/api/v2/companies/${COMPANY_ID}`))).toBe(true);
    expect(urls.some((url) => url.includes(`/api/v2/groups/${GROUP_ID}`))).toBe(true);

    const items = rows();
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(COMPANY_NAME);
    expect(items[1]).toHaveTextContent(GROUP_NAME);
    for (const row of items) {
      expect(`${row.className} ${row.getAttribute("style") ?? ""}`).toMatch(/h-7\b|28px/);
      expect(within(row).getByRole("img")).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Quitar de favoritos" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    expect(within(items[0]).queryByText("G")).toBeNull();
    expect(within(items[1]).getByText("G")).toBeInTheDocument();
    expect(within(items[0]).getByText(thin(fmtPoints(companyFixture.score)))).toBeInTheDocument();
    expect(within(items[1]).getByText(thin(fmtPoints(groupFixture.score)))).toBeInTheDocument();
  });

  it("DADO una fila CUANDO clic ENTONCES select en empresa y selectGroup en grupo, con selectedEntity acorde", async () => {
    mockFavorites();
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(GROUP_NAME);

    await user.click(within(rowNamed(COMPANY_NAME)).getByText(COMPANY_NAME));
    expect(getSelection().selected).toBe(COMPANY_ID);
    expect(getSelection().selectedEntity).toEqual({ kind: "company", id: COMPANY_ID });
    expect(rowNamed(COMPANY_NAME)).toHaveAttribute("aria-selected", "true");

    await user.click(within(rowNamed(GROUP_NAME)).getByText(GROUP_NAME));
    expect(getSelection().selectedGroup).toBe(GROUP_ID);
    expect(getSelection().selectedEntity).toEqual({ kind: "group", id: GROUP_ID });
    expect(rowNamed(GROUP_NAME)).toHaveAttribute("aria-selected", "true");
    expect(rowNamed(COMPANY_NAME)).toHaveAttribute("aria-selected", "false");
  });

  it("DADO la estrella de una fila CUANDO clic ENTONCES la quita de la lista y de la watchlist sin seleccionar", async () => {
    mockFavorites();
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(COMPANY_NAME);

    await user.click(within(rowNamed(COMPANY_NAME)).getByRole("button", { name: "Quitar de favoritos" }));

    expect(isFavorite(COMPANY_ID)).toBe(false);
    expect(getWatchlist()).toEqual([GROUP_ID]);
    expect(screen.queryByText(COMPANY_NAME)).toBeNull();
    expect(rows()).toHaveLength(1);
    expect(getSelection().selected).toBeNull();
    expect(getSelection().selectedEntity).toBeNull();
  });

  it("DADO la lista vacía CUANDO se monta ENTONCES «Sin favoritos» con la pista de la estrella y ninguna petición", () => {
    resetWatchlist([]);
    const fetchMock = mockFavorites();
    renderWidget();

    expect(screen.getByText(/Sin favoritos/)).toBeInTheDocument();
    expect(screen.getByText(/estrella/)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DADO 500 en una ficha CUANDO se monta ENTONCES esa fila dice «No se pudo cargar · Reintentar» y las demás se pintan", async () => {
    mockApi([
      { match: `/api/v2/companies/${COMPANY_ID}`, body: companyFixture },
      { match: `/api/v2/groups/${GROUP_ID}`, body: { status: "error", message: "Sin tablas" }, status: 500 },
    ]);
    renderWidget();

    expect(await screen.findByText(COMPANY_NAME)).toBeInTheDocument();
    expect(await screen.findByText(/No se pudo cargar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
