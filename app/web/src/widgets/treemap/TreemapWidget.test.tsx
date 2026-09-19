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
/** Su nombre: es lo que se pinta y lo que lleva el nombre accesible, nunca el id. */
const BIG_TILE_NAME = "Comercial Navarro y Cia. S.L.";
const BIG_TILE_PATTERN = /Comercial Navarro y Cia\. S\.L\./;

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
  return within(screen.getByRole("group")).getAllByRole("button");
}

/**
 * Elemento más interno cuyo `textContent` completo cumple el patrón: la línea de estado
 * puede componerse de varios `span` (cifras en `.num`) y `getByText` solo mira el texto propio.
 */
function fullText(pattern: RegExp) {
  return (_content: string, element: Element | null) =>
    pattern.test(element?.textContent ?? "") &&
    ![...(element?.children ?? [])].some((child) => pattern.test(child.textContent ?? ""));
}

describe("widget Mapa", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("DADO /treemap CUANDO se monta ENTONCES un Treemap con un grupo por bucket y el tile COMP_1185", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();

    expect(await screen.findByRole("button", { name: BIG_TILE_PATTERN })).toBeInTheDocument();
    expect(lastUrl(fetchMock)).toContain("/api/v2/treemap");
    expect(lastUrl(fetchMock)).toContain("group_by=group");
    expect(lastUrl(fetchMock)).toContain("metric=delta_3m");

    // `FakeResizeObserver` mide 800 × 600: el mapa tiene tamaño y pinta todos los tiles.
    expect(tiles()).toHaveLength(tileCount);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(tileCount);
    for (const group of treemapExample.groups) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
    expect(screen.queryByText(fullText(/sin Δ/))).toBeNull();
  });

  it("DADO un tile CUANDO clic ENTONCES select(id)", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderWidget();

    const tile = await screen.findByRole("button", { name: BIG_TILE_PATTERN });
    await user.click(tile);

    expect(getSelection().selected).toBe(BIG_TILE);
  });

  it("DADO un item con color_value null CUANDO se monta ENTONCES no se pinta, la línea de estado dice «… · 1 sin Δ» y no hay pie", async () => {
    const [first, ...rest] = treemapExample.groups;
    const [big, ...others] = first.items;
    const withNull = {
      ...treemapExample,
      groups: [{ ...first, items: [{ ...big, color_value: null }, ...others] }, ...rest],
    };
    mockApi([{ match: "/api/v2/treemap", body: withNull }]);
    renderWidget();

    // Una sola línea de estado arriba: «{n} grupos · {mes} · {m} sin Δ». El pie desaparece.
    const status = await screen.findByText(fullText(/3 grupos · .+ · 1 sin Δ/));
    expect(status).toBeInTheDocument();
    expect(screen.queryByText("1 empresa sin Δ en este corte")).toBeNull();
    expect(screen.queryByText(fullText(/sin Δ en este corte/))).toBeNull();

    // El treemap se pinta tras medir el contenedor: se espera a que exista antes de contar.
    await screen.findByRole("group");
    expect(screen.queryByRole("button", { name: BIG_TILE_PATTERN })).toBeNull();
    expect(tiles()).toHaveLength(tileCount - 1);
    // Nunca se imputa 0 a quien no tiene Δ.
    expect(screen.queryByRole("button", { name: new RegExp(`${BIG_TILE_NAME}, 0`) })).toBeNull();
  });

  it("DADO la pill Δ1m CUANDO se elige ENTONCES la consulta se reescribe con metric=delta_1m", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    const metrics = screen.getByRole("radiogroup", { name: "Métrica" });
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

  it("DADO el ejemplo CUANDO se monta ENTONCES el tile se pinta por nombre «Comercial Navarro y Cia. S.L.» y las cabeceras por nombre de grupo", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();

    const tile = await screen.findByRole("button", { name: BIG_TILE_PATTERN });
    // Con 800 × 600 el tile ocupa casi todo su grupo: el nombre entra entero, no el id.
    expect(within(tile).getByText(BIG_TILE_NAME)).toBeInTheDocument();
    expect(tile.textContent).not.toContain(BIG_TILE);
    expect(screen.queryByRole("button", { name: new RegExp(BIG_TILE) })).toBeNull();

    // Cabeceras humanas: «Bierzo Holding», nunca «GROUP_0126».
    expect(screen.getByText("Bierzo Holding")).toBeInTheDocument();
    expect(screen.queryByText("GROUP_0126")).toBeNull();

    // La tabla oculta también va por nombre.
    const table = screen.getByRole("table");
    expect(within(table).getByRole("rowheader", { name: BIG_TILE_NAME })).toBeInTheDocument();

    // Sin hover, la línea de estado resume el corte: grupos y mes, sin «sin Δ» si no falta nada.
    expect(screen.getByText(fullText(/^3 grupos · /))).toBeInTheDocument();
    expect(screen.queryByText(fullText(/sin Δ/))).toBeNull();
    expect(screen.queryByText("Pasa por encima de una empresa")).toBeNull();
  });

  it("DADO la pill País CUANDO se elige ENTONCES la consulta lleva group_by=country y el bucket unknown se llama «Sin dato»", async () => {
    const [first, ...rest] = treemapExample.groups;
    const byCountry = {
      ...treemapExample,
      group_by: "country",
      groups: [{ ...first, key: "unknown", label: "unknown" }, ...rest],
    };
    // Las rutas se evalúan en orden: la más específica primero.
    const fetchMock = mockApi([
      { match: "group_by=country", body: byCountry },
      { match: "/api/v2/treemap", body: treemapExample },
    ]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    const grouping = screen.getByRole("radiogroup", { name: "Agrupar" });
    expect(within(grouping).getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Grupo",
      "País",
      "ERP",
    ]);
    expect(within(grouping).getByRole("radio", { name: "Grupo" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(within(grouping).getByRole("radio", { name: "País" }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain("group_by=country"));
    expect(within(grouping).getByRole("radio", { name: "País" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await screen.findByText("Sin dato")).toBeInTheDocument();
    expect(screen.queryByText("unknown")).toBeNull();
    expect(screen.queryByText("Bierzo Holding")).toBeNull();
  });
});
