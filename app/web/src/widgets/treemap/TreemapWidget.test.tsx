import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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

describe("widget Mapa", () => {
  beforeEach(() => {
    resetSelection();
    stubResizeObserver(WIDGET_SIZE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DADO /treemap CUANDO se monta ENTONCES tres columnas por dirección del Δ y fichas de EMPRESA", async () => {
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

    // La tabla visualmente oculta es la vista accesible del mapa: su fila se
    // busca por NOMBRE de empresa, nunca por el código. Hay una por columna.
    expect(screen.getByRole("rowheader", { name: BIG_TILE_NAME })).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: BIG_TILE })).toBeNull();
    for (const table of screen.getAllByRole("table")) {
      expect(table.className).toContain("sr-only");
    }
  });

  it("DADO los dos selectores CUANDO se miran ENTONCES ofrecen sus opciones y marcan la elegida", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
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
  });

  it("DADO el corte CUANDO no hay hover ENTONCES el subtítulo dice buckets, mes y sin métrica, y no hay leyenda de color", async () => {
    const [first, ...rest] = treemapExample.groups;
    const [big, ...others] = first.items;
    const withNull = {
      ...treemapExample,
      groups: [{ ...first, items: [{ ...big, color_value: null }, ...others] }, ...rest],
    };
    mockApi([{ match: "/api/v2/treemap", body: withNull }]);
    const { container } = renderWidget();

    expect(await screen.findByText(fullText(/^3 grupos · 08\/2026 · 1 sin métrica$/))).toBeInTheDocument();
    // Sin métrica no se pinta: el contrato prohíbe imputar 0.
    expect(screen.queryByRole("button", { name: BIG_TILE_PATTERN })).toBeNull();

    // La confesión del fallo anterior desaparece, y con ella cualquier leyenda de
    // color: la columna ya dice lo que decía el color, y se lee sin distinguirlo.
    expect(container.textContent).not.toContain("Área igual por empresa");
    expect(container.textContent).not.toMatch(/verde|rojo|leyenda/i);
  });

  it("DADO el panel estrecho CUANDO la línea de estado no cabe junto a los selectores ENTONCES cae a su propia fila", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();

    // «250 grupos · 09/2026 · 456 sin métrica · ordenadas por score» pide 355 px
    // y en 432 px de panel le quedaban 29 al lado de los selectores: se leía
    // «456 sin métric…». jsdom no hace layout, así que lo que se fija aquí es
    // el contrato que produce el salto de fila: un mínimo que no se puede
    // encoger y una fila que envuelve.
    const status = await screen.findByText(fullText(/^3 grupos · 08\/2026$/));
    expect(status.className).toContain("min-w-64");
    expect(status.className).toContain("flex-1");
    expect(status.parentElement?.className).toContain("flex-wrap-reverse");
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

  it("DADO la pill Score CUANDO se elige ENTONCES la consulta cambia y las columnas pasan a titularse por banda", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    const metrics = screen.getByRole("radiogroup", { name: "Métrica" });
    await user.click(within(metrics).getByRole("radio", { name: "Score" }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain("metric=score"));
    expect(within(metrics).getByRole("radio", { name: "Score" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    for (const title of SCORE_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    for (const title of DELTA_TITLES) {
      expect(screen.queryByText(title)).toBeNull();
    }
  });

  it("DADO la pill País CUANDO se elige ENTONCES la consulta agrupa por país, el subtítulo los cuenta y el bucket unknown se lee «Sin dato»", async () => {
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
    await user.click(within(grouping).getByRole("radio", { name: "País" }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain("group_by=country"));
    expect(within(grouping).getByRole("radio", { name: "País" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await screen.findByText(fullText(/^3 países · 08\/2026$/))).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: BIG_TILE_PATTERN }));
    expect(screen.getByText(fullText(/· Sin dato ·/))).toBeInTheDocument();
    expect(screen.queryByText(fullText(/· unknown ·/))).toBeNull();
  });

  it("DADO un corte de snapshots CUANDO todas pesan igual ENTONCES solo se ofrece Score y el subtítulo dice el orden", async () => {
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
    renderWidget();

    const metrics = await screen.findByRole("radiogroup", { name: "Métrica" });
    await waitFor(() =>
      expect(within(metrics).getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
        "Score",
      ]),
    );

    // Sin magnitud que repartir, el área no dice nada y manda el orden: se dice cuál es.
    expect(await screen.findByText(fullText(/^3 grupos · 08\/2026 · ordenadas por score$/))).toBeInTheDocument();
    for (const title of SCORE_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
