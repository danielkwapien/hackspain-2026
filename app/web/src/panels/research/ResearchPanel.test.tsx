import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { resetSelection, select, selectGroup } from "@/dashboard/selection";
import { ResearchPanel } from "@/panels/research/ResearchPanel";
import {
  AS_OF,
  companyExample,
  groupExample,
  monthsEndingAt,
  signalsExample,
  timelineExample,
  timelineOf,
} from "@/test/examples";
import { mockApi } from "@/test/helpers";

const ID = companyExample.company.company_id; // COMP_1267
const ROUTE = `/api/v2/companies/${ID}`;
const GROUP_ID = groupExample.group.group_id; // GROUP_0095
const GROUP_ROUTE = `/api/v2/groups/${GROUP_ID}`;

/** Los 24 meses del contrato, de `2024-09` a `AS_OF`. */
const MONTHS = monthsEndingAt(AS_OF, 24);

/**
 * Score de los 24 meses: termina en 57,4. El primer mes visible a 1A es `2025-08`
 * (índice 11): 56,6, así que Δ 1A = +0,8. A 3M el primer visible es `2026-05`
 * (índice 20): 59,7, así que Δ 3M = −2,3.
 */
const SCORES = [
  65.2, 64.0, 62.7, 61.5, 60.8, 60.1, 59.6, 59.0, 58.4, 57.9, 57.2, 56.6, 56.0, 55.4, 55.1, 54.8,
  54.3, 60.2, 61.9, 61.0, 59.7, 58.1, 56.3, 57.4,
];

const FIRST_1A_INDEX = 11; // 2025-08
const SCORE = 57.4;

/** Pilares del corte: Actividad no aplica (peso 0, valor nulo). */
const PILLARS_AS_OF = {
  L: { value: 0.412, weight: 0.25 },
  P: { value: 0.552, weight: 0.2 },
  C: { value: 0.832, weight: 0.15 },
  D: { value: 0.722, weight: 0.2 },
  A: { value: null, weight: 0 },
};

/** Liquidez en `2025-08` valía 0,305: a 1A el pilar ha subido 10,7 pts. */
function pillarsAt(index: number) {
  return { ...PILLARS_AS_OF, L: { value: index === FIRST_1A_INDEX ? 0.305 : 0.412, weight: 0.25 } };
}

/** Outlook a 6 m por fila: 52,0 en `2025-08`, 50,8 en el corte. */
function outlook6At(index: number): number {
  if (index === FIRST_1A_INDEX) return 52.0;
  if (index === MONTHS.length - 1) return 50.8;
  return 55.0;
}

/** Seis drivers: los cinco de mayor |contribución| son L1, L3, C1, D1, P1 (A1 queda fuera). */
const DRIVERS = [
  { signal_id: "P1", pillar: "P", contribution: -0.3, value_fmt: "12 % de pagos tarde" },
  { signal_id: "A1", pillar: "A", contribution: 0.1, value_fmt: "+4 % de crecimiento" },
  { signal_id: "L1", pillar: "L", contribution: -2.9, value_fmt: "8 días de colchón" },
  { signal_id: "D1", pillar: "D", contribution: 0.4, value_fmt: "35 % de uso de líneas" },
  { signal_id: "C1", pillar: "C", contribution: 1.0, value_fmt: "10 % de cobros tarde" },
  { signal_id: "L3", pillar: "L", contribution: -1.7, value_fmt: "4 días en negativo" },
].map((driver, index) => ({
  ...companyExample.drivers[0],
  ...driver,
  rank: index + 1,
  delta_vs_prev: 0.01,
  value: 1,
}));

const company = {
  ...companyExample,
  score: SCORE,
  delta_1m: 1.1,
  confidence: 1,
  cap: null,
  outlook: { ...companyExample.outlook, h3: 53.7, h6: 50.8, low: 41.4, high: 60.2 },
  pillars: PILLARS_AS_OF,
  drivers: DRIVERS,
  timeline: timelineOf(SCORES, AS_OF),
};

/** `/timeline`: una fila por mes con la forma del ejemplo más `pillars`; confianza 0,7 salvo el corte. */
const timeline = MONTHS.map((month, index) => ({
  ...timelineExample[0],
  month,
  score: SCORES[index],
  delta_1m: index === 0 ? null : Math.round((SCORES[index] - SCORES[index - 1]) * 10) / 10,
  confidence: index === MONTHS.length - 1 ? 1 : 0.7,
  outlook_6m: outlook6At(index),
  cap: null,
  pillars: pillarsAt(index),
}));

/** Plantillas con la forma real de `/signals`. */
const SIGNAL_TEMPLATE = signalsExample.pillars[0].signals[0];
const POINT_TEMPLATE = SIGNAL_TEMPLATE.series_24m[0];

/** `value_fmt` de L1 en cada mes: `8` en el corte, `20` en `2025-08` (−60 % en el rango 1A). */
function dias(value: number): string {
  return `${value} dias de colchon de caja`;
}

const L_SIGNALS = [
  { id: "L1", name: "Dias de colchon de caja", unit: "dias", contribution: -1.2, value: 8 },
  { id: "L2", name: "Minimo de caja sobre salidas", unit: "ratio", contribution: -0.6, value: 0.76 },
  { id: "L3", name: "Dias en negativo", unit: "dias", contribution: -1.3, value: 4 },
];

function liquiditySignal({ id, name, unit, contribution, value }: (typeof L_SIGNALS)[number]) {
  const fmt = (v: number, month: string) =>
    id === "L1" ? dias(v) : `${name.toLowerCase()} ${v} (${month})`;
  return {
    ...SIGNAL_TEMPLATE,
    signal_id: id,
    name,
    unit,
    is_available: true,
    quality_flag: null,
    value,
    value_fmt: fmt(value, AS_OF),
    u: 0.41,
    u_smooth: 0.42,
    weight: 0.1,
    contribution,
    delta_vs_prev: 0.12,
    series_24m: MONTHS.map((month, index) => {
      const v = id === "L1" ? value + (MONTHS.length - 1 - index) : value;
      return {
        ...POINT_TEMPLATE,
        month,
        value: v,
        value_fmt: fmt(v, month),
        u: 0.41,
        u_smooth: 0.42,
        weight: 0.1,
        contribution,
        delta_vs_prev: 0.12,
        is_available: true,
      };
    }),
  };
}

/** Señal sin dato: `is_available=false` con un valor crudo a 0 que NUNCA debe pintarse. */
const UNAVAILABLE = {
  ...liquiditySignal({ id: "L4", name: "Cobertura de deuda a corto", unit: "meses", contribution: 0, value: 0 }),
  is_available: false,
  value: null,
  value_fmt: "0 meses de cobertura",
  contribution: 0,
  u: 0,
  u_smooth: 0,
  series_24m: [] as { month: string }[],
};

const signals = {
  ...signalsExample,
  company_id: ID,
  pillars: [
    { pillar: "L", pillar_name: "Liquidez", weight: 0.25, value: 0.412, signals: [...L_SIGNALS.map(liquiditySignal), UNAVAILABLE] },
    ...signalsExample.pillars
      .filter((pillar) => pillar.pillar !== "L")
      .map((pillar) => ({
        ...pillar,
        signals: pillar.signals.map((signal) => ({ ...signal, contribution: 0 })),
      })),
  ],
};

/** Grupo con 24 meses de historia consolidada: termina en 69,7; a 1A arranca en 68,9 (Δ +0,8). */
const GROUP_SCORES = SCORES.map((score) => Math.round((score + 12.3) * 10) / 10);
const group = {
  ...groupExample,
  score: 69.7,
  delta_1m: -0.6,
  confidence: 0.977,
  outlook_6m: 66.0,
  outlook_low: 56.6,
  outlook_high: 75.4,
  dispersion: 39.3,
  n_companies_scored: 12,
  timeline: MONTHS.map((month, index) => ({
    ...groupExample.timeline[0],
    month,
    score: GROUP_SCORES[index],
    delta_1m: index === 0 ? null : GROUP_SCORES[index] - GROUP_SCORES[index - 1],
    dispersion: 39.3,
    n_companies_scored: 12,
  })),
};

/** Resumen del libro de clientes (XR-036): las dos últimas tarjetas de tesorería. */
const COUNTERPARTIES = {
  company_id: ID,
  group_id: null,
  as_of: AS_OF,
  side: "ar",
  sort: "weight",
  currency: "EUR",
  summary: {
    month: AS_OF,
    n_counterparties: 133,
    total_amount: 4113736.39,
    top1_weight: 0.68578,
    effective_counterparties: 2.11,
    hhi: 0.47323,
    days_late_w: 1.47,
    pct_late: 0.0635,
    overdue_total: 31750.3,
    eur_share: 1,
  },
  items: [],
};

type Route = { match: string; body: unknown; status?: number };

/** Las rutas más específicas (`/signals`, `/timeline`) van antes que la ficha. */
function mockSheet(overrides: Partial<Record<"signals" | "timeline" | "company", Route>> = {}) {
  return mockApi([
    { match: `${ROUTE}/counterparties`, body: COUNTERPARTIES },
    overrides.signals ?? { match: `${ROUTE}/signals`, body: signals },
    overrides.timeline ?? { match: `${ROUTE}/timeline`, body: timeline },
    overrides.company ?? { match: ROUTE, body: company },
    { match: GROUP_ROUTE, body: group },
  ]);
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ResearchPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Regex tolerante al espacio fino (U+2009): el normalizador de Testing Library lo
 * colapsa en el nodo pero no en un matcher string.
 */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

/** Texto exacto con espacio fino, como `thin()` en `GroupWidget.test.tsx`. */
function thin(expected: string): RegExp {
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s");
  return new RegExp(`^${escaped}$`);
}

/** La cabecera: `dl aria-live` con Score · Δ rango · Confianza · Outlook 6 m. */
function header(): HTMLElement {
  const dl = screen.getByText("Score").closest("dl");
  if (!dl) throw new Error("La cabecera no tiene el dl de KPIs");
  return dl;
}

/** El `dd` de un término de la cabecera: «Score» → la celda con la cifra y su delta. */
function valueOf(term: string): HTMLElement {
  const value = screen.getByText(term).parentElement?.querySelector("dd");
  if (!value) throw new Error(`El término «${term}» no tiene valor`);
  return value as HTMLElement;
}

/** Botón ⓘ de una celda de KPI o de una señal. */
function infoTip(title: string): HTMLElement {
  return screen.getByRole("button", { name: `Definición de ${title}` });
}

/** Celda (término + valor) que acompaña a una ⓘ. */
function cellOf(title: string): HTMLElement {
  const cell = infoTip(title).closest("dt")?.parentElement;
  if (!cell) throw new Error(`La ⓘ «${title}» no está en un dt`);
  return cell;
}

/** Celda de un KPI de grupo (sin ⓘ) a partir del texto de su término. */
function statOf(label: string): HTMLElement {
  const dt = screen
    .getAllByText(label)
    .map((node) => node.closest("dt"))
    .find((node): node is HTMLElement => node !== null);
  const cell = dt?.parentElement;
  if (!cell) throw new Error(`«${label}» no es el término de una celda`);
  return cell;
}

function metricMenuButton(container: HTMLElement): HTMLElement {
  const button = container.querySelector<HTMLElement>('button[aria-haspopup="menu"]');
  if (!button) throw new Error("No hay menú de métrica");
  return button;
}

async function chooseMetric(container: HTMLElement, name: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(metricMenuButton(container));
  const menu = screen.getByRole("menu", { name: "Métrica de la gráfica" });
  await user.click(within(menu).getByRole("menuitemradio", { name }));
}

function mockLayout() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 600,
    bottom: 168,
    width: 600,
    height: 168,
    toJSON: () => ({}),
  } as DOMRect);
}

function chartSurface(container: HTMLElement): HTMLElement {
  const surface = container.querySelector<HTMLElement>('[data-slot="line-no-axes"]');
  if (!surface) throw new Error("No hay gráfica");
  return surface;
}

function lineSegments(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('path[data-slot="line-segment"]')];
}

describe("panel Investigación", () => {
  beforeEach(() => {
    resetSelection();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("DADO sin selección CUANDO se monta ENTONCES pide elegir en el buscador y no pide nada a la API", () => {
    const fetchMock = mockSheet();
    renderPanel();

    expect(
      screen.getByText("Selecciona una empresa o un grupo en el buscador"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DADO una empresa CUANDO carga ENTONCES nombre grande, Score con su delta al lado, Confianza y Outlook 6 m", async () => {
    select(ID);
    mockSheet();
    renderPanel();

    // XR-037 (E6): el nombre es el elemento de mayor peso tipográfico de la ficha.
    const name = await screen.findByText("Agricola Duero S.L.U.");
    expect(name.className).toContain("text-[length:var(--text-figure)]");

    const dl = header();
    expect(dl).toHaveAttribute("aria-live", "polite");
    expect(within(dl).getByText("Score")).toBeInTheDocument();
    expect(within(dl).getByText("Confianza")).toBeInTheDocument();
    expect(within(dl).getByText("Outlook 6 m")).toBeInTheDocument();
    expect(within(dl).queryByText("Δ 1 m")).toBeNull();

    // XR-038 (W1.2, criterio 3): el Score vuelve a llevar su unidad y el delta
    // sigue desnudo entre paréntesis en la misma celda; el rótulo «Δ 1A» sobra,
    // lo dice el selector de rango.
    const score = valueOf("Score");
    expect(within(dl).queryByText("Δ 1A")).toBeNull();
    expect(score).toHaveTextContent(/^57,4\s*pts\s*\(/);
    await waitFor(() => expect(score).toHaveTextContent(loose("(▲ +0,8 pts)")));
    expect(within(score).getByTitle("Δ 1A")).toBeInTheDocument();

    // La cifra a 30 px y el «pts» a `--text-body` en secundario: la unidad
    // acompaña, no compite.
    expect(within(score).getByText("57,4").className).toContain(
      "text-[length:var(--text-figure-lg)]",
    );
    expect(within(score).getByText("pts").className).toContain(
      "text-[length:var(--text-body)]",
    );
    expect(within(score).getByText("pts").className).toContain("text-content-secondary");

    // Y la etiqueta, centrada sobre su valor y a 12 px (`text-right` era de
    // cuando las tres celdas colgaban del borde derecho del `dl`).
    const term = within(dl).getByText("Score");
    expect(term.className).toContain("text-[length:var(--text-control)]");
    expect(term.closest("div")?.className).toContain("text-center");

    // XR-037 (E7.c): confianza del 100 %, en verde y a `--text-figure`.
    const confidence = valueOf("Confianza");
    expect(confidence).toHaveTextContent(/100\s?%/);
    expect(confidence).toHaveClass("text-content-positive");
    expect(confidence.className).toContain("text-[length:var(--text-figure)]");

    expect(dl).toHaveTextContent(loose("50,8 pts"));
    expect(within(dl).queryByText(/Deteriorándose|Vigilancia|COMP_1267/)).toBeNull();
  });

  it("DADO la ficha CUANDO se pinta la cabecera ENTONCES no hay narrativa bajo el nombre", async () => {
    // XR-037 (E5): repetía el score que está tres centímetros a la derecha en 20 px,
    // destripaba la mecánica del motor y venía del pipeline sin tildes.
    select(ID);
    mockSheet();
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");
    await waitFor(() => expect(cellOf("Liquidez")).toHaveTextContent(loose("41,2 pts")));

    const { headline, body } = companyExample.narrative;
    expect(screen.queryByTitle(`${headline} · ${body}`)).toBeNull();
    expect(screen.queryByText(loose(headline ?? ""))).toBeNull();
  });

  it("DADO el rango 3M CUANDO se elige ENTONCES Δ 3M = score(as_of) − score(primer visible)", async () => {
    const user = userEvent.setup();
    select(ID);
    mockSheet();
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    const range = screen.getByRole("radiogroup", { name: "Rango" });
    await user.click(within(range).getByRole("radio", { name: "3M" }));

    const score = valueOf("Score");
    await waitFor(() => expect(score).toHaveTextContent(loose("(▼ −2,3 pts)")));
    expect(score).toHaveTextContent(/^57,4\s*pts\s*\(/);
    // El rango vive en su selector y en el `title` del delta, no en un rótulo propio.
    expect(within(score).getByTitle("Δ 3M")).toBeInTheDocument();
    expect(screen.queryByText("Δ 3M")).toBeNull();
  });

  it("DADO hover en 2025-08 CUANDO se apunta la gráfica ENTONCES cabecera y celdas hablan de ese mes (pilares de /timeline) sin tooltip, y al salir vuelven al corte", async () => {
    select(ID);
    mockSheet();
    const { container } = renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");
    await waitFor(() => expect(cellOf("Liquidez")).toHaveTextContent(loose("41,2 pts")));
    mockLayout();

    // A 1A la gráfica arranca en `2025-08`: el borde izquierdo apunta a ese mes.
    const surface = chartSurface(container);
    fireEvent.pointerMove(surface, { clientX: 0 });

    const dl = header();
    await waitFor(() => expect(valueOf("Score")).toHaveTextContent(/^56,6\s*pts\s*\(/));
    expect(dl).toHaveTextContent("08/2025");
    expect(dl).toHaveTextContent(/70\s?%/);
    // XR-037 (E7.c): el 70 % cae en la banda sin color.
    expect(valueOf("Confianza")).toHaveClass("text-content-primary");
    expect(dl).toHaveTextContent(loose("52,0 pts"));
    expect(dl).not.toHaveTextContent(loose("50,8 pts"));

    // Las celdas leen `pillars` de la fila de `/timeline` del mes apuntado.
    expect(cellOf("Liquidez")).toHaveTextContent(loose("30,5 pts"));
    expect(cellOf("Liquidez")).not.toHaveTextContent(loose("41,2 pts"));

    expect(container.querySelector('[data-slot="chart-tooltip"]')).toBeNull();
    expect(container.querySelector('[data-slot="crosshair"]')).not.toBeNull();

    fireEvent.pointerLeave(surface);

    await waitFor(() => expect(dl).not.toHaveTextContent("08/2025"));
    expect(valueOf("Score")).toHaveTextContent(/^57,4\s*pts\s*\(/);
    expect(dl).toHaveTextContent(/100\s?%/);
    expect(dl).toHaveTextContent(loose("50,8 pts"));
    expect(cellOf("Liquidez")).toHaveTextContent(loose("41,2 pts"));
  });

  it("DADO el menú de métrica CUANDO se elige Liquidez ENTONCES la gráfica dibuja pillar_L×100 con el score detrás, sin banda, y el botón dice «Liquidez»", async () => {
    const user = userEvent.setup();
    select(ID);
    mockSheet();
    const { container } = renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    const button = metricMenuButton(container);
    expect(button).toHaveTextContent("Health score");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector('[data-slot="forecast-band"]')).not.toBeNull();

    await user.click(button);
    const menu = screen.getByRole("menu", { name: "Métrica de la gráfica" });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items).toHaveLength(6);
    expect(within(menu).getByRole("menuitemradio", { name: "Health score" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(menu).getByRole("menuitemradio", { name: "Liquidez" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await user.click(within(menu).getByRole("menuitemradio", { name: "Liquidez" }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveTextContent("Liquidez");
    expect(container.querySelector('[data-slot="forecast-band"]')).toBeNull();

    // XR-037 (E9, E11): dos series distinguibles y sin régimen. El pilar en su
    // token, que ya es el rosa, y el score en su azul, no en el gris de deshabilitado
    // que compartía con la baseline; la baseline ya no se dibuja.
    const strokes = lineSegments(container).map((path) => path.style.stroke);
    expect(strokes).toContain("var(--chart-pillar-liquidity)");
    expect(strokes).toContain("var(--chart-score)");
    expect(container.querySelector('path[data-slot="baseline"]')).toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    const asOfRow = screen.getByRole("row", { name: /agosto de 2026/ });
    expect(within(asOfRow).getByText(thin("41,2 pts"))).toBeInTheDocument();
  });

  it("DADO la métrica Health score CUANDO se pinta la fila de KPIs ENTONCES cinco celdas L…A en pts con ⓘ y % del rango; peso 0 → «No aplica»", async () => {
    select(ID);
    mockSheet();
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    await waitFor(() => expect(cellOf("Liquidez")).toHaveTextContent(loose("41,2 pts")));
    // XR-037 (E12): el `Segmented` de rango está justo encima; repetir «1A» en cada
    // celda de la fila es la saturación que el rediseño quita.
    expect(cellOf("Liquidez")).toHaveTextContent(loose("+10,7 pts"));
    expect(cellOf("Liquidez")).not.toHaveTextContent("1A");
    expect(cellOf("Cobros")).toHaveTextContent(loose("83,2 pts"));
    expect(cellOf("Deuda")).toHaveTextContent(loose("72,2 pts"));
    expect(cellOf("Actividad")).toHaveTextContent("No aplica");
    expect(cellOf("Actividad")).not.toHaveTextContent(loose("0,0 pts"));

    const dl = cellOf("Liquidez").closest("dl");
    expect(dl).not.toBeNull();
    expect(dl).not.toBe(header());
    expect(within(dl as HTMLElement).getAllByRole("button", { name: /^Definición de/ })).toHaveLength(5);
  });

  it("DADO la familia Liquidez CUANDO se pinta la fila de KPIs ENTONCES señales con value_fmt, % del rango y «No aplica» (nunca 0)", async () => {
    select(ID);
    mockSheet();
    const { container } = renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");
    await waitFor(() => expect(cellOf("Liquidez")).toHaveTextContent(loose("41,2 pts")));

    await chooseMetric(container, "Liquidez");

    const cell = cellOf("Colchón de caja");
    await waitFor(() => expect(cell).toHaveTextContent(dias(8)));
    // L1 vale 20 en `2025-08` y 8 en el corte: −60 % en el rango, sin repetir «1A».
    expect(cell).toHaveTextContent(loose("−60,0 %"));
    expect(cell).not.toHaveTextContent("1A");
    expect(screen.getByText("minimo de caja sobre salidas 0.76 (2026-08)")).toBeInTheDocument();

    expect(screen.getAllByText("No aplica").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 meses de cobertura")).toBeNull();
    expect(screen.queryByRole("button", { name: "Definición de Liquidez" })).toBeNull();
  });

  it("DADO una ⓘ CUANDO recibe el foco ENTONCES muestra la definición en un role=tooltip", async () => {
    select(ID);
    mockSheet();
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    const tip = await screen.findByRole("button", { name: "Definición de Liquidez" });
    const tooltipId = tip.getAttribute("aria-describedby");
    expect(tooltipId).toBeTruthy();
    const tooltip = document.getElementById(tooltipId as string);
    expect(tooltip).not.toBeNull();
    expect(tooltip).toHaveAttribute("role", "tooltip");
    expect(tooltip).toHaveAttribute("hidden");

    fireEvent.focus(tip);

    await waitFor(() => expect(tooltip).not.toHaveAttribute("hidden"));
    expect(screen.getByRole("tooltip")).toBe(tooltip);
    expect((tooltip as HTMLElement).textContent?.trim().length ?? 0).toBeGreaterThan(10);

    fireEvent.blur(tip);
    await waitFor(() => expect(tooltip).toHaveAttribute("hidden"));
  });

  it("DADO la fila bajo la gráfica CUANDO se pinta ENTONCES «Tesorería» con seis cifras, y ni rastro de «Señales» ni de sus drivers (E13)", async () => {
    select(ID);
    mockSheet();
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    const section = await screen.findByRole("region", { name: "Tesorería" });
    expect(
      within(section)
        .getAllByRole("term")
        .map((term) => term.textContent?.trim()),
    ).toEqual([
      "Runway de caja",
      "Tendencia de caja",
      "Meses en negativo",
      "Flujo operativo neto",
      "Concentración de clientes",
      "Vencido de clientes",
    ]);

    // Las dos últimas salen del endpoint de contrapartes de XR-036.
    expect(section).toHaveTextContent(loose("2,11"));
    expect(section).toHaveTextContent(loose("31,8 k"));

    // El bloque viejo repetía la fila de pilares y las perspectivas de debajo.
    expect(screen.queryByRole("region", { name: "Señales" })).toBeNull();
    expect(screen.queryByText("8 días de colchón")).toBeNull();
    expect(screen.queryByText("10 % de cobros tarde")).toBeNull();
    expect(screen.queryByText(/Pilar ·/)).toBeNull();
  });

  it("DADO fortalezas del mes CUANDO se pinta la fila de pilares ENTONCES «Conclusión» delante, en seis columnas (E15)", async () => {
    select(ID);
    mockSheet({
      company: { match: ROUTE, body: { ...company, strength_flags: ["PAYS_ON_TIME"] } },
    });
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    await waitFor(() => expect(cellOf("Liquidez")).toHaveTextContent(loose("41,2 pts")));
    const row = cellOf("Liquidez").closest("dl") as HTMLElement;
    expect(within(row).getByText("Conclusión")).toBeInTheDocument();
    expect(within(row).getByText("Paga a tiempo")).toBeInTheDocument();
    expect(row.className).toContain("grid-cols-6");
    // La fortaleza ya no vive suelta en la línea de contexto de la cabecera.
    expect(screen.queryByText(/Operativa 12 m/)).toBeNull();
  });

  it("DADO una empresa sin fortalezas CUANDO se pinta ENTONCES «Sin señales destacadas» y la fila vuelve a cinco columnas (E15)", async () => {
    select(ID);
    mockSheet();
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    await waitFor(() => expect(cellOf("Liquidez")).toHaveTextContent(loose("41,2 pts")));
    expect(screen.getByText(/Sin señales destacadas/)).toBeInTheDocument();
    const row = cellOf("Liquidez").closest("dl") as HTMLElement;
    expect(row.className).toContain("grid-cols-5");
    expect(within(row).queryByText("Conclusión")).toBeNull();
  });

  it("DADO Investigación CUANDO se pinta ENTONCES no hay «Cómo se calcula»", async () => {
    select(ID);
    mockSheet();
    renderPanel();
    await screen.findByText("Agricola Duero S.L.U.");

    expect(screen.queryByRole("region", { name: "Cómo se calcula" })).toBeNull();
    expect(screen.queryByText("Cómo se calcula")).toBeNull();
    expect(screen.queryByText(/λ = |τ = /)).toBeNull();
  });

  it("DADO un grupo seleccionado CUANDO carga ENTONCES cabecera consolidada, gráfica de /groups/:id.timeline, KPIs de grupo y sin menú de métrica", async () => {
    selectGroup(GROUP_ID);
    const fetchMock = mockSheet();
    const { container } = renderPanel();

    expect(await screen.findByText(groupExample.group.name)).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes(GROUP_ROUTE))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v2/companies/"))).toBe(false);

    const dl = header();
    expect(within(dl).getByText("Confianza")).toBeInTheDocument();
    expect(within(dl).getByText("Outlook 6 m")).toBeInTheDocument();
    expect(valueOf("Score")).toHaveTextContent(/^69,7\s*pts\s*\(/);
    await waitFor(() => expect(valueOf("Score")).toHaveTextContent(loose("(▲ +0,8 pts)")));
    expect(dl).toHaveTextContent(/98\s?%/);
    expect(valueOf("Confianza")).toHaveClass("text-content-positive");
    expect(dl).toHaveTextContent(loose("66,0 pts"));

    // La gráfica es la serie consolidada: el corte vale 69,7 en la tabla oculta.
    const asOfRow = screen.getByRole("row", { name: /agosto de 2026/ });
    expect(within(asOfRow).getByText(thin("69,7 pts"))).toBeInTheDocument();

    expect(statOf("Filiales puntuadas")).toHaveTextContent(/\b12\b/);
    expect(statOf("Dispersión")).toHaveTextContent(loose("39,3 pts"));
    expect(statOf("Más débil")).toHaveTextContent(/COMP_1051/);
    expect(statOf("Más fuerte")).toHaveTextContent(/COMP_0248|Quimica Arga/);

    expect(container.querySelector('button[aria-haspopup="menu"]')).toBeNull();
    expect(screen.queryByRole("region", { name: "Señales" })).toBeNull();
  });

  it("DADO menos de tres meses de score CUANDO carga ENTONCES avisa de historia insuficiente", async () => {
    select(ID);
    const short = timeline.slice(-2);
    mockSheet({
      timeline: { match: `${ROUTE}/timeline`, body: short },
      company: { match: ROUTE, body: { ...company, timeline: timelineOf(SCORES.slice(-2), AS_OF) } },
    });
    const { container } = renderPanel();

    expect(await screen.findByText(/Historia insuficiente/)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="line-no-axes"]')).toBeNull();
  });

  it("DADO error en /signals CUANDO se pide la familia Liquidez ENTONCES ErrorState con Reintentar y la cabecera sigue", async () => {
    select(ID);
    mockSheet({
      signals: { match: `${ROUTE}/signals`, body: { status: "error", message: "Sin señales" }, status: 500 },
    });
    const { container } = renderPanel();

    expect(await screen.findByText("Agricola Duero S.L.U.")).toBeInTheDocument();
    await chooseMetric(container, "Liquidez");

    expect((await screen.findAllByRole("button", { name: "Reintentar" })).length).toBeGreaterThan(0);
    expect(valueOf("Score")).toHaveTextContent(/^57,4\s*pts\s*\(/);
    expect(screen.queryByText(dias(8))).toBeNull();
  });
});
