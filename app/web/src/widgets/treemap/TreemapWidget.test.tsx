import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { fmtDelta } from "@/charts";
import { getSelection, resetSelection } from "@/dashboard/selection";
import type { LayoutItem } from "@/dashboard/types";
import { metaExample, treemapExample } from "@/test/examples";
import { mockApi } from "@/test/helpers";
import { TreemapWidget } from "@/widgets/treemap/TreemapWidget";

const ITEM: LayoutItem = { i: "w1", type: "treemap", x: 0, y: 0, w: 8, h: 13, entity: null };

/**
 * El hueco REAL del Mapa: en `dashboard/fixed/investigacion` el widget va con
 * `w: 8` de 24, o sea 432 x 338 px a 1440. El doble global de `test/setup`
 * entrega 800 x 600, un tamaño que este widget no tiene nunca y con el que todo
 * cabe: medido así, el test no prueba nada.
 */
const WIDGET_SIZE = { width: 432, height: 338 };

/** Radix abre el desplegable con la API de puntero, que jsdom no implementa. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function stubResizeObserver({ width, height }: { width: number; height: number }): void {
  class MeasuredResizeObserver implements ResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      const entry = {
        target,
        contentRect: { width, height, top: 0, left: 0, bottom: height, right: width, x: 0, y: 0 },
      } as unknown as ResizeObserverEntry;
      this.callback([entry], this);
    }

    unobserve(): void {}

    disconnect(): void {}
  }

  vi.stubGlobal("ResizeObserver", MeasuredResizeObserver);
}

/** La empresa más grande del ejemplo: la ficha que siempre entra en su columna. */
const BIG_TILE = "COMP_1185";
const BIG_TILE_NAME = "Comercial Navarro y Cia. S.L.";
const BIG_TILE_PATTERN = /Comercial Navarro y Cia\. S\.L\./;
/** Su bucket: con `group_by=group`, el grupo al que pertenece. */
const BIG_TILE_BUCKET = "Bierzo Holding";
const BIG_TILE_DELTA = 1.32084632574;

/** Títulos de columna por métrica: nivel con el score, dirección con un Δ. */
const DELTA_TITLES = ["Mejorando", "Estable", "Deteriorando"];
const SCORE_TITLES = ["Sanas", "Vigilancia", "Tensión"];

/** El corte del ejemplo servido por país: tres buckets de tres empresas. */
const BY_COUNTRY = {
  ...treemapExample,
  group_by: "country",
  groups: [
    { ...treemapExample.groups[0], key: "ES", label: "España" },
    { ...treemapExample.groups[1], key: "PT", label: "Portugal" },
    { ...treemapExample.groups[2], key: "unknown", label: "unknown" },
  ],
};

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

/** URL de la consulta del mapa (las listas de buckets van sin `metric`). */
function mapUrls(fetchMock: ReturnType<typeof mockApi>): string[] {
  return fetchMock.mock.calls
    .map((call) => (typeof call[0] === "string" ? call[0] : ""))
    .filter((url) => url.includes("/api/v2/treemap") && url.includes("metric="));
}

/**
 * Elemento más interno cuyo `textContent` completo cumple el patrón: la línea de estado
 * se compone de varios `span` (cifras en `.num`) y `getByText` solo mira el texto propio.
 */
function fullText(pattern: RegExp) {
  return (_content: string, element: Element | null) =>
    pattern.test(element?.textContent ?? "") &&
    ![...(element?.children ?? [])].some((child) => pattern.test(child.textContent ?? ""));
}

/** Igual, pero por texto literal: el Δ lleva `+` y no se puede meter en una expresión. */
function exactText(expected: string) {
  return (_content: string, element: Element | null) =>
    element?.textContent === expected &&
    ![...(element?.children ?? [])].some((child) => child.textContent === expected);
}

function pill(name: "Universo" | "Tamaño" | "Color") {
  return screen.getByRole("combobox", { name });
}

/**
 * Abre un desplegable con el teclado: es como lo abre quien no usa ratón y
 * además el puntero simulado de `user-event` guarda su estado en el
 * `document`, que los tests comparten, y solo abre el primero de cada fichero.
 */
async function openPill(
  user: ReturnType<typeof userEvent.setup>,
  name: "Universo" | "Tamaño" | "Color",
): Promise<void> {
  pill(name).focus();
  await user.keyboard("{Enter}");
}

describe("widget Mapa", () => {
  beforeEach(() => {
    resetSelection();
    stubResizeObserver(WIDGET_SIZE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Radix bloquea el puntero del `body` mientras hay un desplegable abierto.
    document.body.style.pointerEvents = "";
  });

  it("DADO /treemap CUANDO se monta ENTONCES tres columnas por dirección del Δ, fichas de EMPRESA y el área en pendiente de cobro", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();

    // La entidad del mapa es la empresa, no el bucket: la ficha lleva su nombre y su Δ.
    expect(await screen.findByRole("button", { name: BIG_TILE_PATTERN })).toHaveAccessibleName(
      `${BIG_TILE_NAME}, ${fmtDelta(BIG_TILE_DELTA).text}`,
    );
    for (const title of DELTA_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(lastUrl(fetchMock)).toContain("group_by=group");
    expect(lastUrl(fetchMock)).toContain("metric=delta_3m");
    // El área sale del pendiente de cobro, no de `op_in_12m`: esa magnitud
    // llega a 0 en las 1286 empresas y no repartiría nada.
    expect(lastUrl(fetchMock)).toContain("size_by=pending_eur");
    expect(lastUrl(fetchMock)).not.toContain("op_in_12m");

    // La tabla visualmente oculta es la vista accesible del mapa: su fila se
    // busca por NOMBRE de empresa, nunca por el código. Hay una por columna.
    expect(screen.getByRole("rowheader", { name: BIG_TILE_NAME })).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: BIG_TILE })).toBeNull();
    for (const table of screen.getAllByRole("table")) {
      expect(table.className).toContain("sr-only");
    }
  });

  it("DADO la cabecera CUANDO se mira ENTONCES son tres desplegables con lo elegido en cada uno", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    expect(pill("Universo")).toHaveTextContent("Todas las empresas");
    expect(pill("Tamaño")).toHaveTextContent("Pendiente de cobro (EUR)");
    expect(pill("Color")).toHaveTextContent("Δ3m");
    // Ya no hay dos segmentados, y el de agrupación —que no movía una ficha— se fue.
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("DADO el corte CUANDO no hay hover ENTONCES la línea dice censo, pendiente, mes, lo que falta y de qué es el color", async () => {
    const [first, ...rest] = treemapExample.groups;
    const [big, second, ...others] = first.items;
    const withHoles = {
      ...treemapExample,
      groups: [
        {
          ...first,
          items: [{ ...big, color_value: null }, { ...second, size: 0 }, ...others],
        },
        ...rest,
      ],
    };
    mockApi([{ match: "/api/v2/treemap", body: withHoles }]);
    const { container } = renderWidget();

    expect(
      await screen.findByText(
        fullText(
          /^9 empresas · EUR [\d.,]+ M · 08\/2026 · 1 sin métrica · 1 sin pendiente de cobro · color por Δ3m$/,
        ),
      ),
    ).toBeInTheDocument();
    // Sin métrica no se pinta: el contrato prohíbe imputar 0.
    expect(screen.queryByRole("button", { name: BIG_TILE_PATTERN })).toBeNull();

    // La confesión del fallo anterior desaparece, y con ella cualquier leyenda de
    // color: la columna ya dice lo que decía el color, y se lee sin distinguirlo.
    expect(container.textContent).not.toContain("Área igual por empresa");
    expect(container.textContent).not.toMatch(/verde|rojo|leyenda/i);
  });

  it("DADO el corte por defecto CUANDO se lee la cifra ENTONCES el pendiente va en euros y abreviado", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();

    // 43.622.192.335,22 € sumados en las nueve empresas del ejemplo.
    expect(
      await screen.findByText(fullText(/^9 empresas · EUR 43\.622,2 M · 08\/2026 · color por Δ3m$/)),
    ).toBeInTheDocument();
  });

  it("DADO 432 px de ancho CUANDO se coloca la cabecera ENTONCES los tres van juntos, la línea de estado aparte y nada truncado", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();
    const status = await screen.findByText(fullText(/^9 empresas ·/));

    // jsdom no hace layout: lo que se fija aquí es el contrato que lo produce.
    // Los tres desplegables comparten una fila que ENVUELVE, y ninguno se
    // encoge: a poco ancho bajan de línea enteros en vez de truncarse.
    const row = pill("Universo").parentElement;
    expect(row?.className).toContain("flex-wrap");
    expect(row).toContainElement(pill("Tamaño"));
    expect(row).toContainElement(pill("Color"));
    for (const name of ["Universo", "Tamaño", "Color"] as const) {
      expect(pill(name).className).toContain("shrink-0");
    }
    // La línea de estado tiene su propio sitio debajo, entera y sin recortar.
    expect(status.parentElement).not.toBe(row);
    expect(status.className).not.toContain("truncate");
    // Y se anuncia: cambiar de universo, de tamaño o de color la reescribe.
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("DADO una ficha CUANDO se pasa el ratón ENTONCES la línea dice la empresa, su bucket y su valor", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderWidget();

    await user.hover(await screen.findByRole("button", { name: BIG_TILE_PATTERN }));

    expect(
      screen.getByText(
        exactText(`${BIG_TILE_NAME} · ${BIG_TILE_BUCKET} · Δ3m ${fmtDelta(BIG_TILE_DELTA).text}`),
      ),
    ).toBeInTheDocument();
  });

  it("DADO una ficha CUANDO se hace clic ENTONCES select(id)", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderWidget();

    await user.click(await screen.findByRole("button", { name: BIG_TILE_PATTERN }));

    expect(getSelection().selected).toBe(BIG_TILE);
  });

  it("DADO el desplegable de color CUANDO se elige Score ENTONCES la consulta cambia y las columnas pasan a titularse por banda", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    await openPill(user, "Color");
    await user.click(await screen.findByRole("option", { name: "Score" }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain("metric=score"));
    expect(pill("Color")).toHaveTextContent("Score");
    for (const title of SCORE_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    for (const title of DELTA_TITLES) {
      expect(screen.queryByText(title)).toBeNull();
    }
  });

  it("DADO el desplegable de tamaño CUANDO se elige Nº de facturas ENTONCES el área y el total de cada columna pasan a contar facturas", async () => {
    const invoices = {
      ...treemapExample,
      size_by: "n_invoices",
      groups: treemapExample.groups.map((group) => ({
        ...group,
        items: group.items.map((item, index) => ({ ...item, size: 10 + index })),
      })),
    };
    const fetchMock = mockApi([
      { match: "size_by=n_invoices", body: invoices },
      { match: "/api/v2/treemap", body: treemapExample },
    ]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    await openPill(user, "Tamaño");
    await user.click(await screen.findByRole("option", { name: "Nº de facturas" }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain("size_by=n_invoices"));
    // Un recuento lleva su palabra, nunca una moneda inventada.
    expect(await screen.findByText(fullText(/^9 empresas · 99 facturas · 08\/2026 · color por Δ3m$/))).toBeInTheDocument();
  });

  it("DADO el desplegable de universo CUANDO se elige un país ENTONCES el corte se agrupa por país y el mapa se queda con sus empresas", async () => {
    const fetchMock = mockApi([
      { match: "group_by=country", body: BY_COUNTRY },
      { match: "/api/v2/treemap", body: treemapExample },
    ]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    await openPill(user, "Universo");
    await user.click(await screen.findByRole("option", { name: "España" }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain("group_by=country"));
    expect(mapUrls(fetchMock).at(-1)).toContain("size_by=pending_eur");
    // Solo las tres de España, no las nueve del corte.
    expect(await screen.findByText(fullText(/^3 empresas ·/))).toBeInTheDocument();
    expect(pill("Universo")).toHaveTextContent("España");

    // El bucket que se lee al pasar el ratón es ya el país.
    await user.hover(screen.getByRole("button", { name: BIG_TILE_PATTERN }));
    expect(screen.getByText(fullText(/· España ·/))).toBeInTheDocument();
  });

  it("DADO una magnitud que el corte no tiene CUANDO suma 0 ENTONCES el mapa sigue en pie y la línea lo dice", async () => {
    const withoutPending = {
      ...treemapExample,
      size_by: "pending_eur",
      groups: treemapExample.groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({ ...item, size: 0 })),
      })),
    };
    mockApi([{ match: "/api/v2/treemap", body: withoutPending }]);
    renderWidget();

    // Sin excusas técnicas y sin imputar: se dice qué falta y qué manda ahora.
    expect(
      await screen.findByText(
        fullText(
          /^9 empresas · 08\/2026 · sin pendiente de cobro en este corte: áreas iguales, ordenadas por Δ3m$/,
        ),
      ),
    ).toBeInTheDocument();
    // Y el mapa no se queda en blanco: las fichas se pintan con el área repartida.
    expect(screen.getByRole("button", { name: BIG_TILE_PATTERN })).toBeInTheDocument();
    for (const title of DELTA_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("DADO un corte de snapshots CUANDO todas pesan igual ENTONCES solo se ofrece Score y la línea dice el orden", async () => {
    const equalSizes = {
      ...treemapExample,
      groups: treemapExample.groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({ ...item, size: 1 })),
      })),
    };
    mockApi([
      { match: "/api/v2/meta", body: { ...metaExample, capabilities: { snapshots_only: true } } },
      { match: "/api/v2/treemap", body: equalSizes },
    ]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    await waitFor(() => expect(pill("Color")).toHaveTextContent("Score"));
    await openPill(user, "Color");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Score"]);
    await user.keyboard("{Escape}");

    // Sin magnitud que repartir, el área no dice nada y manda el orden: se dice cuál es.
    expect(
      await screen.findByText(
        fullText(/^9 empresas · EUR 9 · 08\/2026 · ordenadas por score$/),
      ),
    ).toBeInTheDocument();
    for (const title of SCORE_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
