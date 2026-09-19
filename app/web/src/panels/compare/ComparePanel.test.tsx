import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { getSelection, resetSelection, toggleCompare } from "@/dashboard/selection";
import { ComparePanel } from "@/panels/compare/ComparePanel";
import { companyLike, timelineOf } from "@/test/examples";
import { mockApi } from "@/test/helpers";

const DUERO = { id: "COMP_0999", name: "Transportes Duero S.L.U." };
const LACALLE = { id: "COMP_0885", name: "Logistica Lacalle S.A." };

/** 24 meses: Duero sube 1,5 pts/mes y Lacalle baja 1 pt/mes, en cualquier rango. */
const duero = companyLike(
  DUERO.id,
  DUERO.name,
  timelineOf(Array.from({ length: 24 }, (_, index) => 60 + index * 1.5)),
);
const lacalle = companyLike(
  LACALLE.id,
  LACALLE.name,
  timelineOf(Array.from({ length: 24 }, (_, index) => 90 - index)),
);

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ComparePanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockBoth() {
  return mockApi([
    { match: `/api/v2/companies/${DUERO.id}`, body: duero },
    { match: `/api/v2/companies/${LACALLE.id}`, body: lacalle },
  ]);
}

/** Filas de mes de la tabla oculta de `LineNoAxes`. */
function monthRows(): HTMLElement[] {
  return within(screen.getByRole("table")).getAllByRole("rowheader");
}

describe("panel Comparativa", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("draws one LineNoAxes series per company in compare", async () => {
    toggleCompare(DUERO.id);
    toggleCompare(LACALLE.id);
    mockBoth();
    renderPanel();

    const table = await screen.findByRole("table");
    const series = within(table)
      .getAllByRole("columnheader")
      .filter((header) => header.textContent !== "Mes");
    expect(series).toHaveLength(2);

    const chart = screen.getAllByRole("img").find((img) => img.getAttribute("aria-label"));
    expect(chart).toBeDefined();
    expect(chart?.getAttribute("aria-label")).not.toBe("");
  });

  it("ranges 3M 6M 1A Máx as text with aria-pressed; 1A by default", async () => {
    toggleCompare(DUERO.id);
    toggleCompare(LACALLE.id);
    mockBoth();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");

    for (const name of ["3M", "6M", "1A", "Máx"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        name === "1A" ? "true" : "false",
      );
    }
    expect(monthRows()).toHaveLength(13);

    await user.click(screen.getByRole("button", { name: "3M" }));
    expect(screen.getByRole("button", { name: "3M" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1A" })).toHaveAttribute("aria-pressed", "false");
    expect(monthRows()).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "6M" }));
    expect(monthRows()).toHaveLength(7);

    await user.click(screen.getByRole("button", { name: "Máx" }));
    expect(monthRows()).toHaveLength(24);
  });

  it("Base 100 toggles normalize: every series starts at 100", async () => {
    toggleCompare(DUERO.id);
    toggleCompare(LACALLE.id);
    mockBoth();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");

    const toggle = screen.getByRole("button", { name: "Base 100" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Base 100" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const firstMonth = within(screen.getByRole("table")).getAllByRole("row")[1];
    for (const cell of within(firstMonth).getAllByRole("cell")) {
      expect(cell).toHaveTextContent(/^100,0/);
    }
  });

  it("inline legend: name, period delta with glyph and a remove button", async () => {
    toggleCompare(DUERO.id);
    toggleCompare(LACALLE.id);
    mockBoth();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");

    expect(screen.getAllByText(DUERO.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(LACALLE.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/▲/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/▼/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: `Quitar ${DUERO.name}` }));
    expect(getSelection().compare).toEqual([LACALLE.id]);
    expect(screen.queryByRole("button", { name: `Quitar ${DUERO.name}` })).toBeNull();
  });

  it("without companies asks to add them from the table", () => {
    mockBoth();
    renderPanel();

    expect(screen.getByText("Añade empresas desde la tabla")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a series with fewer than 2 points shows Historia insuficiente", async () => {
    toggleCompare(DUERO.id);
    mockApi([
      {
        match: `/api/v2/companies/${DUERO.id}`,
        body: companyLike(DUERO.id, DUERO.name, timelineOf([57.4])),
      },
    ]);
    renderPanel();

    expect(await screen.findByText("Historia insuficiente")).toBeInTheDocument();
  });

  it("no color legend panel anywhere", async () => {
    toggleCompare(DUERO.id);
    toggleCompare(LACALLE.id);
    mockBoth();
    renderPanel();
    await screen.findByRole("table");

    expect(screen.queryByText(/leyenda de colores/i)).toBeNull();
  });
});
