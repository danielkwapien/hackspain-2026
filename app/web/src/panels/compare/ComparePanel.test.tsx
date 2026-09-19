import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { getSelection, resetSelection, select, setCompareSlot } from "@/dashboard/selection";
import { ComparePanel } from "@/panels/compare/ComparePanel";
import { companyLike, timelineOf, universeExample } from "@/test/examples";
import { mockApi } from "@/test/helpers";

/** Espacio fino (U+2009) entre la cifra y su unidad. */
const THIN = " ";

/** Los tres ejemplos del contrato: son las filas que devuelve el picker. */
const [DUERO, LACALLE, BIERZO] = universeExample.items;

/** 24 meses: Duero sube 1,5 pts/mes, Lacalle baja 1 pt/mes y Bierzo se queda plano. */
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
const bierzo = companyLike(
  BIERZO.id,
  BIERZO.name,
  timelineOf(Array.from({ length: 24 }, () => 70)),
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

/** Fichas de las tres empresas y el universo que alimenta el picker. */
function mockAll() {
  return mockApi([
    { match: `/api/v2/companies/${DUERO.id}`, body: duero },
    { match: `/api/v2/companies/${LACALLE.id}`, body: lacalle },
    { match: `/api/v2/companies/${BIERZO.id}`, body: bierzo },
    { match: "/api/v2/universe", body: universeExample },
  ]);
}

function pickerA(): HTMLElement {
  return screen.getByRole("button", { name: /^Empresa A/ });
}

function pickerB(): HTMLElement {
  return screen.getByRole("button", { name: /^Empresa B/ });
}

/** Abre el picker `trigger` y elige la fila cuyo nombre es `name`. */
async function pick(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, name: string) {
  await user.click(trigger);
  const listbox = await screen.findByRole("listbox");
  await user.click(await within(listbox).findByRole("option", { name: new RegExp(name) }));
}

/** Cabeceras de serie de la tabla oculta de `LineNoAxes` (todas menos «Mes»). */
function series(): HTMLElement[] {
  return within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .filter((header) => header.textContent !== "Mes");
}

/** Filas de mes de la tabla oculta de `LineNoAxes`. */
function monthRows(): HTMLElement[] {
  return within(screen.getByRole("table")).getAllByRole("rowheader");
}

describe("panel Comparativa", () => {
  beforeEach(() => {
    resetSelection();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("slot A defaults to the selected company and B is empty (Elegir empresa)", async () => {
    select(DUERO.id);
    mockAll();
    renderPanel();

    await screen.findByRole("table");
    expect(pickerA()).toHaveAttribute("aria-haspopup", "listbox");
    expect(pickerA()).toHaveTextContent(DUERO.name);
    expect(pickerB()).toHaveAttribute("aria-haspopup", "listbox");
    expect(pickerB()).toHaveTextContent("Elegir empresa");
    expect(series()).toHaveLength(1);
    expect(getSelection().compare[0]).toBeNull();
  });

  it("picking B through the picker draws two series and the inline legend with period deltas", async () => {
    select(DUERO.id);
    const fetchMock = mockAll();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");

    await pick(user, pickerB(), LACALLE.name);

    expect(
      fetchMock.mock.calls.some((call) => {
        const url = String(call[0]);
        return url.includes("/api/v2/universe") && url.includes("unit=company") && url.includes("limit=8");
      }),
    ).toBe(true);
    expect(getSelection().compare[1]).toBe(LACALLE.id);
    expect(pickerB()).toHaveTextContent(LACALLE.name);

    await waitFor(() => expect(series()).toHaveLength(2));
    // Leyenda inline: nombre y Δ del periodo con glifo (Duero sube, Lacalle baja).
    expect(screen.getAllByText(DUERO.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(LACALLE.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/▲/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/▼/).length).toBeGreaterThan(0);
  });

  it("picking in B the company A is following is refused: never two equal series", async () => {
    select(DUERO.id);
    mockAll();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");

    await pick(user, pickerB(), DUERO.name);

    expect(getSelection().compare).toEqual([null, null]);
    expect(pickerB()).toHaveTextContent("Elegir empresa");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(series()).toHaveLength(1);
  });

  it("picking in B the company pinned in A (same as the selection) is refused too", async () => {
    select(DUERO.id);
    mockAll();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");

    await pick(user, pickerA(), DUERO.name);
    expect(getSelection().compare).toEqual([DUERO.id, null]);

    await pick(user, pickerB(), DUERO.name);

    expect(getSelection().compare).toEqual([DUERO.id, null]);
    expect(pickerB()).toHaveTextContent("Elegir empresa");
    expect(series()).toHaveLength(1);
  });

  it("pinning A through the picker overrides the selection", async () => {
    select(DUERO.id);
    mockAll();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");

    await pick(user, pickerA(), LACALLE.name);
    expect(getSelection().compare[0]).toBe(LACALLE.id);
    expect(pickerA()).toHaveTextContent(LACALLE.name);
    await waitFor(() => expect(series()[0]).toHaveTextContent(LACALLE.name));

    // La selección global cambia y el slot A fijado no se mueve.
    act(() => select(BIERZO.id));
    expect(pickerA()).toHaveTextContent(LACALLE.name);
    expect(screen.queryByText(BIERZO.name)).toBeNull();
  });

  it("Quitar B empties slot B", async () => {
    setCompareSlot(0, DUERO.id);
    setCompareSlot(1, LACALLE.id);
    mockAll();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");
    await waitFor(() => expect(series()).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: `Quitar ${LACALLE.name}` }));

    expect(getSelection().compare[1]).toBeNull();
    expect(pickerB()).toHaveTextContent("Elegir empresa");
    expect(screen.queryByRole("button", { name: `Quitar ${LACALLE.name}` })).toBeNull();
    await waitFor(() => expect(series()).toHaveLength(1));
  });

  it("ranges are a radiogroup, 1A by default, 3M leaves 4 points", async () => {
    setCompareSlot(0, DUERO.id);
    setCompareSlot(1, LACALLE.id);
    mockAll();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");

    const ranges = screen.getByRole("radiogroup", { name: "Rango" });
    for (const name of ["1M", "3M", "6M", "1A", "Total"]) {
      expect(within(ranges).getByRole("radio", { name })).toHaveAttribute(
        "aria-checked",
        name === "1A" ? "true" : "false",
      );
    }
    expect(monthRows()).toHaveLength(13);

    await user.click(within(ranges).getByRole("radio", { name: "3M" }));
    expect(within(ranges).getByRole("radio", { name: "3M" })).toHaveAttribute("aria-checked", "true");
    expect(within(ranges).getByRole("radio", { name: "1A" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(monthRows()).toHaveLength(4);

    await user.click(within(ranges).getByRole("radio", { name: "Total" }));
    expect(monthRows()).toHaveLength(24);
  });

  it("Base 100 toggles normalize", async () => {
    setCompareSlot(0, DUERO.id);
    setCompareSlot(1, LACALLE.id);
    mockAll();
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole("table");
    await waitFor(() => expect(series()).toHaveLength(2));

    const toggle = screen.getByRole("button", { name: "Base 100" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Base 100" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const firstMonth = within(screen.getByRole("table")).getAllByRole("row")[1];
    const cells = within(firstMonth).getAllByRole("cell");
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell).toHaveTextContent(/^100,0/);
    }
  });

  it("hover shows both values in the tooltip", async () => {
    setCompareSlot(0, DUERO.id);
    setCompareSlot(1, LACALLE.id);
    mockAll();
    const { container } = renderPanel();
    await screen.findByRole("table");
    await waitFor(() => expect(series()).toHaveLength(2));

    // jsdom no hace layout: sin este doble el porcentaje del puntero sería NaN.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 600,
      bottom: 148,
      width: 600,
      height: 148,
      toJSON: () => ({}),
    } as DOMRect);

    const surface = container.querySelector<HTMLElement>('[data-slot="line-no-axes"]');
    expect(surface).not.toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();

    // Último mes del rango 1A: Duero 60 + 23 × 1,5 = 94,5 y Lacalle 90 − 23 = 67.
    fireEvent.pointerMove(surface!, { clientX: 600 });

    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain(`94,5${THIN}pts`);
    expect(tip.textContent).toContain(`67,0${THIN}pts`);
  });

  it("no A shows Elige una empresa en A", () => {
    mockAll();
    renderPanel();

    expect(screen.getByText("Elige una empresa en A")).toBeInTheDocument();
    expect(pickerA()).toBeInTheDocument();
    expect(pickerB()).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("DADO el rango 3M CUANDO se elige ENTONCES el eje pinta 4 etiquetas y la tabla oculta 4 filas, con el presente al 100 %", async () => {
    setCompareSlot(0, DUERO.id);
    setCompareSlot(1, LACALLE.id);
    mockAll();
    const user = userEvent.setup();
    const { container } = renderPanel();
    await screen.findByRole("table");
    await waitFor(() => expect(series()).toHaveLength(2));

    function ticks(): HTMLElement[] {
      return [...container.querySelectorAll<HTMLElement>('[data-slot="x-axis"] span')];
    }

    // 1A por defecto: 13 meses visibles → 5 etiquetas (cada 3.ª desde el corte).
    expect(ticks()).toHaveLength(5);
    expect(ticks().at(-1)?.textContent).toBe("ago 26");

    const ranges = screen.getByRole("radiogroup", { name: "Rango" });
    await user.click(within(ranges).getByRole("radio", { name: "3M" }));

    expect(ticks().map((tick) => tick.textContent)).toEqual(["may 26", "jun 26", "jul 26", "ago 26"]);
    expect(monthRows()).toHaveLength(4);
    // Sin forecast, el presente cae en el borde derecho.
    expect(ticks().at(-1)?.style.left).toBe("100%");
    expect(within(screen.getByRole("table")).getByRole("rowheader", { name: "mayo de 2026" })).toBeInTheDocument();
  });

  it("DADO dos series CUANDO cambia el rango ENTONCES cada trazo conserva el número de comandos", async () => {
    setCompareSlot(0, DUERO.id);
    setCompareSlot(1, LACALLE.id);
    mockAll();
    const user = userEvent.setup();
    const { container } = renderPanel();
    await screen.findByRole("table");
    await waitFor(() => expect(series()).toHaveLength(2));

    function commandCounts(): number[] {
      return [...container.querySelectorAll('path[data-slot="line-segment"]')].map(
        (path) => (path.getAttribute("d") ?? "").match(/[ML]/g)?.length ?? 0,
      );
    }

    const atYear = commandCounts();
    expect(atYear).toHaveLength(2);
    expect(atYear.every((count) => count > 0)).toBe(true);

    const ranges = screen.getByRole("radiogroup", { name: "Rango" });
    for (const name of ["1M", "3M", "6M", "1A", "Total"]) {
      await user.click(within(ranges).getByRole("radio", { name }));
      expect(commandCounts(), name).toEqual(atYear);
    }
  });
});
