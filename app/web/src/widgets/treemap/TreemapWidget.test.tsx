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

/**
 * El mismo corte con la fila por sociedad que trae `/api/v2/treemap`: las nueve
 * empresas del ejemplo con su país del perfil, su industria y su ERP. De ahí
 * salen las opciones de los tres filtros de dimensión, sin una consulta más.
 * Seis en España, dos en Portugal y una en Francia; tres sin ERP.
 */
const DIMENSIONS: Record<string, [string, string, string | null]> = {
  COMP_1185: ["España", "industria y manufactura", "sage200"],
  COMP_0030: ["España", "hostelería y ocio", null],
  COMP_1123: ["Portugal", "comercio minorista", "netsuite"],
  COMP_0822: ["España", "industria y manufactura", null],
  COMP_0340: ["Francia", "hostelería y ocio", "netsuite"],
  COMP_0693: ["España", "construcción e instalaciones", "sage200"],
  COMP_0629: ["España", "comercio minorista", null],
  COMP_0149: ["Portugal", "industria y manufactura", "businessCentral"],
  COMP_0486: ["España", "salud y farmacia", "sage200"],
};

const WITH_DIMENSIONS = {
  ...treemapExample,
  companies: treemapExample.groups.flatMap((group) =>
    group.items.map((item) => {
      const [country, industry, erp] = DIMENSIONS[item.id];
      return { id: item.id, country, country_declared: null, industry, erp };
    }),
  ),
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
 * Elemento más interno cuyo `textContent` es exactamente el esperado. Por texto
 * literal y no por expresión: el Δ lleva `+` y no se puede meter en una.
 */
function exactText(expected: string) {
  return (_content: string, element: Element | null) =>
    element?.textContent === expected &&
    ![...(element?.children ?? [])].some((child) => child.textContent === expected);
}

type PillName = "Cartera" | "País" | "Industria" | "ERP" | "Tamaño" | "Color";

function pill(name: PillName) {
  return screen.getByRole("combobox", { name });
}

/**
 * Abre un desplegable con el teclado: es como lo abre quien no usa ratón y
 * además el puntero simulado de `user-event` guarda su estado en el
 * `document`, que los tests comparten, y solo abre el primero de cada fichero.
 */
async function openPill(
  user: ReturnType<typeof userEvent.setup>,
  name: PillName,
): Promise<void> {
  pill(name).focus();
  await user.keyboard("{Enter}");
}

/** El cajón donde viven País, Industria y ERP: cuatro a la vista no caben. */
async function openFilters(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  screen.getByRole("button", { name: /^Filtros/ }).focus();
  await user.keyboard("{Enter}");
  await screen.findByRole("combobox", { name: "País" });
}

/** Elige una opción de un desplegable. */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  name: PillName,
  option: string,
): Promise<void> {
  await openPill(user, name);
  await user.click(await screen.findByRole("option", { name: option }));
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

  it("DADO la cabecera CUANDO se mira ENTONCES son tres desplegables y el cajón de filtros, con lo elegido en cada uno", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    expect(pill("Cartera")).toHaveTextContent("Todas las empresas");
    expect(pill("Tamaño")).toHaveTextContent("Pendiente de cobro (EUR)");
    expect(pill("Color")).toHaveTextContent("Δ3m");
    expect(screen.getByRole("button", { name: /^Filtros/ })).toHaveTextContent("Filtros");
    // Ya no hay dos segmentados, y el de agrupación —que no movía una ficha— se fue.
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("DADO el corte CUANDO se monta ENTONCES NO hay línea de censo, ni con huecos en los datos", async () => {
    // XR-038 (W3.2, criterio 12): la línea `1.286 empresas · 08/2026 · 7 sin
    // métrica · 653 sin pendiente de cobro` se borra entera. Lo que se pierde
    // queda anotado en el informe: era el único sitio donde se decía cuántas
    // fichas faltan. La instrucción es quitarla, y se quita.
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

    // Sin métrica no se pinta: el contrato prohíbe imputar 0.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: BIG_TILE_PATTERN })).toBeNull(),
    );
    expect(container.textContent).not.toMatch(/\d+ empresas · \d{2}\/\d{4}/);
    expect(container.textContent).not.toContain("sin métrica");
    expect(container.textContent).not.toContain("sin pendiente de cobro");

    // La confesión del fallo anterior desaparece, y con ella cualquier leyenda de
    // color: la columna ya dice lo que decía el color, y se lee sin distinguirlo.
    expect(container.textContent).not.toContain("Área igual por empresa");
    expect(container.textContent).not.toMatch(/verde|rojo|leyenda/i);
  });

  it("DADO el corte por defecto CUANDO se lee la cabecera ENTONCES tampoco repite el total global ni de qué es el color", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const { container } = renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    // 43.622.192.335,22 € es la suma de las nueve: se dice por columna, nunca
    // arriba. Y «color por Δ3m» es literalmente lo que se lee en el desplegable.
    expect(container.textContent).not.toMatch(/\d+ empresas · EUR/);
    expect(pill("Color")).toHaveTextContent("Δ3m");
    expect(screen.queryByText(/color por/)).toBeNull();
  });

  it("DADO 432 px de ancho CUANDO se coloca la cabecera ENTONCES los cuatro en una fila, Filtros a la derecha y los controles a --text-body", async () => {
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    // jsdom no hace layout: lo que se fija aquí es el contrato que lo produce.
    // Los cuatro controles comparten una fila que ENVUELVE, y ninguno se
    // encoge: a poco ancho bajan de línea enteros en vez de truncarse. Son
    // cuatro y no seis porque los tres de dimensión se fueron al cajón: medido
    // a 1440 × 900, seis ocupan tres renglones y le comen 64 px al mapa.
    const row = pill("Cartera").parentElement;
    const filters = screen.getByRole("button", { name: /^Filtros/ });
    expect(row?.className).toContain("flex-wrap");
    expect(row).toContainElement(filters);
    expect(row).toContainElement(pill("Tamaño"));
    expect(row).toContainElement(pill("Color"));
    for (const name of ["Cartera", "Tamaño", "Color"] as const) {
      expect(pill(name).className).toContain("shrink-0");
    }

    // XR-038 (W3.1): `Filtros` se separa del grupo y se va a la derecha de la
    // misma fila. El tamaño de los cuatro lo fija `TreemapHeader.test`.
    expect(filters.className).toContain("ml-auto");
  });

  it("DADO una ficha CUANDO se pasa el ratón ENTONCES no aparece ninguna línea bajo los controles", async () => {
    // XR-037 (I3.a): el ratón no reescribe nada de la cabecera. Sin línea de
    // censo (W3.2) tampoco puede aparecer la del hover que la sustituía.
    mockApi([{ match: "/api/v2/treemap", body: treemapExample }]);
    const user = userEvent.setup();
    const { container } = renderWidget();

    await user.hover(await screen.findByRole("button", { name: BIG_TILE_PATTERN }));

    expect(container.textContent).not.toMatch(/\d+ empresas · \d{2}\/\d{4}/);
    expect(screen.queryByText(exactText(`${BIG_TILE_NAME} · ${BIG_TILE_BUCKET} · Δ3m ${fmtDelta(BIG_TILE_DELTA).text}`))).toBeNull();
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
    // Un recuento lleva su palabra, nunca una moneda inventada, y lo dice la
    // cabecera de cada columna, que es el único sitio donde se totaliza.
    expect((await screen.findAllByText(/^\d+ facturas$/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/EUR/)).toBeNull();
  });

  it("DADO el desplegable de tamaño CUANDO se eligen los cobros de 12m ENTONCES se pide la magnitud YA convertida a euros", async () => {
    const receipts = {
      ...treemapExample,
      size_by: "op_in_12m_eur",
      groups: treemapExample.groups.map((group) => ({
        ...group,
        items: group.items.map((item, index) => ({ ...item, size: 1_000_000 * (index + 1) })),
      })),
    };
    const fetchMock = mockApi([
      { match: "size_by=op_in_12m_eur", body: receipts },
      { match: "/api/v2/treemap", body: treemapExample },
    ]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    // El defecto sigue siendo el pendiente: los cobros convertidos están
    // brutalmente sesgados (p99 296 M sobre una mediana de 1,5 M) y una sola
    // ficha se comería su columna.
    expect(lastUrl(fetchMock)).toContain("size_by=pending_eur");

    await openPill(user, "Tamaño");
    await user.click(await screen.findByRole("option", { name: "Cobros 12m (EUR)" }));

    // La moneda de la entidad (`op_in_12m` a secas) no se pide nunca: mezcla
    // pesos con euros y el área sería una cifra falsa.
    await waitFor(() => expect(lastUrl(fetchMock)).toContain("size_by=op_in_12m_eur"));
    expect(pill("Tamaño")).toHaveTextContent("Cobros 12m (EUR)");
    // Dinero: el total de la columna lleva su moneda dicha.
    expect(screen.getAllByText(/^EUR /).length).toBeGreaterThan(0);
  });

  it("DADO el cajón de filtros CUANDO se elige un país ENTONCES el mapa se queda con sus empresas sin pedirle nada más a la API", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/treemap", body: WITH_DIMENSIONS }]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });
    const before = mapUrls(fetchMock).length;

    await openFilters(user);
    await choose(user, "País", "España");

    // Solo las seis de España, no las nueve del corte: la francesa y las dos
    // portuguesas desaparecen de la tabla accesible, que es el censo pintado.
    await waitFor(() =>
      expect(screen.queryByRole("rowheader", { name: "Hermanos Arga y Cia. S.L." })).toBeNull(),
    );
    expect(screen.queryByRole("rowheader", { name: "Alimentaria Zubiri S.A." })).toBeNull();
    expect(screen.getByRole("rowheader", { name: BIG_TILE_NAME })).toBeInTheDocument();
    expect(pill("País")).toHaveTextContent("España");
    // El corte sigue agrupado por grupo: el filtro es local, sobre las filas
    // que el payload ya trae, y no dispara ni una consulta más.
    expect(mapUrls(fetchMock)).toHaveLength(before);
    expect(lastUrl(fetchMock)).toContain("group_by=group");
  });

  it("DADO un cruce de filtros que vacía el mapa CUANDO no queda ninguna ENTONCES se dice qué filtro corta y se ofrece quitarlo", async () => {
    mockApi([{ match: "/api/v2/treemap", body: WITH_DIMENSIONS }]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByRole("button", { name: BIG_TILE_PATTERN });

    // La única francesa es de hostelería: cruzarla con otra industria no deja nada.
    await openFilters(user);
    await choose(user, "País", "Francia");
    await choose(user, "Industria", "Industria y manufactura");
    await user.keyboard("{Escape}");

    // Ni un rectángulo negro ni un «sin datos»: los dos filtros puestos, con lo
    // que vuelve al quitar cada uno.
    expect(await screen.findByText(/Ninguna empresa pasa los filtros/)).toBeInTheDocument();
    const dropCountry = screen.getByRole("button", { name: /Quitar País · Francia/ });
    expect(dropCountry).toHaveTextContent("3 empresas");
    expect(
      screen.getByRole("button", { name: /Quitar Industria · Industria y manufactura/ }),
    ).toHaveTextContent("1 empresa");

    await user.click(dropCountry);

    expect(await screen.findByRole("rowheader", { name: BIG_TILE_NAME })).toBeInTheDocument();
    expect(screen.queryByText(/Ninguna empresa pasa los filtros/)).toBeNull();
  });

  it("DADO una magnitud que el corte no tiene CUANDO suma 0 ENTONCES el mapa sigue en pie, con las áreas repartidas y sin línea que lo excuse", async () => {
    const withoutPending = {
      ...treemapExample,
      size_by: "pending_eur",
      groups: treemapExample.groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({ ...item, size: 0 })),
      })),
    };
    mockApi([{ match: "/api/v2/treemap", body: withoutPending }]);
    const { container } = renderWidget();

    // El mapa no se queda en blanco: las fichas se pintan con el área repartida.
    expect(await screen.findByRole("button", { name: BIG_TILE_PATTERN })).toBeInTheDocument();
    // Y sin la línea de censo (W3.2) tampoco queda su excusa técnica.
    expect(container.textContent).not.toContain("áreas iguales");
    for (const title of DELTA_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("DADO un corte de snapshots CUANDO todas pesan igual ENTONCES solo se ofrece Score y las columnas se titulan por banda", async () => {
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

    // Sin magnitud que repartir, el área no dice nada y manda el orden. Ya no
    // hay línea donde decirlo (W3.2) y el mapa sigue en pie igualmente.
    for (const title of SCORE_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
