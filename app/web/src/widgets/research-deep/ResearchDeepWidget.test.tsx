import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { fmtDelta, fmtPoints } from "@/charts";
import { getSelection, resetSelection, select, selectGroup } from "@/dashboard/selection";
import type { LayoutItem } from "@/dashboard/types";
import {
  AS_OF,
  catalogExample,
  companyExample,
  groupExample,
  metaExample,
  monthsEndingAt,
  signalsExample,
  timelineExample,
} from "@/test/examples";
import { mockApi } from "@/test/helpers";
import { ResearchDeepWidget } from "@/widgets/research-deep/ResearchDeepWidget";

const ID = companyExample.company.company_id; // COMP_1267
const ROUTE = `/api/v2/companies/${ID}`;
const GROUP_ID = groupExample.group.group_id; // GROUP_0095
const GROUP_ROUTE = `/api/v2/groups/${GROUP_ID}`;

const REPORT_UNAVAILABLE = "Informe no disponible para esta empresa";

/** Ficha con cifras controladas: penalización 2,0 por Liquidez, sin techo, alerta de julio. */
const company = {
  ...companyExample,
  company: { ...companyExample.company, country: "ES", erp: "businessCentral", months_hist: 21 },
  base: 64.4,
  score: 57.4,
  band: "watch",
  regime: "deteriorating",
  confidence: 1,
  warmup: false,
  outlook: { ...companyExample.outlook, h3: 53.7, h6: 50.8, low: 41.4, high: 60.2 },
  pillars: {
    L: { value: 0.412, weight: 0.25 },
    P: { value: 0.552, weight: 0.2 },
    C: { value: 0.832, weight: 0.15 },
    D: { value: 0.722, weight: 0.2 },
    A: { value: 0.56, weight: 0.2 },
  },
  penalty: { points: 2.0, weakest_pillar: "L" },
  cap: null,
  strength_flags: [],
  alert: { ...companyExample.alert, severity: "review", month_detected: "2026-07" },
};

const timeline = monthsEndingAt(AS_OF, 3).map((month) => ({
  ...timelineExample[0],
  month,
  score: 57.4,
  base: 64.4,
  penalty: 2.0,
  cap: null,
}));

/** Deuda: D1 disponible y D2 no (su `value_fmt` crudo empieza por 0 y NUNCA debe pintarse). */
const D_TEMPLATE = signalsExample.pillars[0].signals[0];
const signals = {
  ...signalsExample,
  company_id: ID,
  pillars: [
    ...signalsExample.pillars,
    {
      pillar: "D",
      pillar_name: "Deuda",
      weight: 0.2,
      value: 0.722,
      signals: [
        {
          ...D_TEMPLATE,
          signal_id: "D1",
          name: "Uso de lineas de credito",
          unit: "ratio",
          is_available: true,
          quality_flag: null,
          value: 0.35,
          value_fmt: "35 % de uso de las lineas",
          u: 0.6,
          u_smooth: 0.61,
          weight: 0.1,
          contribution: 0.4,
          delta_vs_prev: 0.02,
        },
        {
          ...D_TEMPLATE,
          signal_id: "D2",
          name: "Cuotas regulares",
          unit: "ratio",
          is_available: false,
          quality_flag: null,
          value: null,
          value_fmt: "0 cuotas regulares",
          u: null,
          u_smooth: null,
          weight: 0,
          contribution: 0,
          delta_vs_prev: 0,
          series_24m: [],
        },
      ],
    },
  ],
};

/**
 * El ejemplo publicado, tal cual: la escala de bandas y la fila de pesos salen de la
 * ficha (`company.score`, `company.pillars`), no de un `reference` que /meta ya no manda.
 */
const meta = metaExample;

/** Informe de Health con el esquema `HealthReport`; cada cifra del cuerpo existe en `value_fmt`. */
const REPORT = {
  company_id: ID,
  as_of: AS_OF,
  generated_at: "2026-09-18T10:00:00Z",
  model: "claude-opus-5",
  risk_level: "high",
  summary: "Liquidez tensionada: 8 dias de colchon de caja y 4 dias en negativo en el corte.",
  sections: [
    { title: "Resumen", body: "El score se sitúa en vigilancia con deterioro confirmado." },
    { title: "Liquidez y caja", body: "8 dias de colchon de caja: el pilar más débil." },
    { title: "Pagos y cobros", body: "10 % de las facturas de cliente cobradas tarde." },
    { title: "Deuda", body: "Sin tensión en el servicio de la deuda." },
    { title: "Actividad", body: "Actividad estable en los últimos meses." },
  ],
  watch_next: ["Colchón de caja por debajo de 8 dias", "Nuevos dias en negativo"],
};

type Route = { match: string; body: unknown; status?: number };

/** Las rutas más específicas (`/report`, `/signals`, `/timeline`) van antes que la ficha. */
function mockDeep({
  report = { match: `${ROUTE}/report`, body: REPORT },
  sheet = company,
}: { report?: Route; sheet?: unknown } = {}) {
  return mockApi([
    report,
    { match: `${ROUTE}/signals`, body: signals },
    { match: `${ROUTE}/timeline`, body: timeline },
    { match: ROUTE, body: sheet },
    { match: GROUP_ROUTE, body: groupExample },
    { match: "/api/v2/meta", body: meta },
    { match: "/api/v2/catalog/signals", body: catalogExample },
  ]);
}

function item(entity: string | null = null): LayoutItem {
  return { i: "w1", type: "research-deep", x: 0, y: 0, w: 12, h: 24, entity };
}

function renderWidget(entity: string | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ResearchDeepWidget item={item(entity)} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Regex tolerante al espacio fino (U+2009) y a los saltos entre nodos. */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

/** Texto exacto con espacio fino, como `thin()` en `GroupWidget.test.tsx`. */
function thin(expected: string): RegExp {
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s");
  return new RegExp(`^${escaped}$`);
}

function requestedUrls(fetchMock: ReturnType<typeof mockApi>): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

function reportCalls(fetchMock: ReturnType<typeof mockApi>): number {
  return requestedUrls(fetchMock).filter((url) => url.includes(`${ROUTE}/report`)).length;
}

async function findCard(name: RegExp): Promise<HTMLElement> {
  const card = await screen.findByRole("button", { name });
  await waitFor(() => expect(card).not.toHaveAttribute("aria-busy", "true"));
  return card;
}

describe("widget Investigación profunda", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("DADO sin selección CUANDO se monta ENTONCES pide elegir y no pide nada a la API", () => {
    const fetchMock = mockDeep();
    renderWidget();

    expect(screen.getByText(/Selecciona una empresa o un grupo/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Familia" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DADO una empresa CUANDO carga ENTONCES «Familia» son las cinco familias y abre en Liquidez, sin «Health score» (E16)", async () => {
    select(ID);
    mockDeep();
    renderWidget();

    const family = await screen.findByRole("radiogroup", { name: "Familia" });
    expect(within(family).getAllByRole("radio")).toHaveLength(5);
    expect(within(family).getByRole("radio", { name: "Liquidez" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    for (const name of ["Pago", "Cobros", "Deuda", "Actividad"]) {
      expect(within(family).getByRole("radio", { name })).toHaveAttribute("aria-checked", "false");
    }

    // «Health score» repetía la cabecera de la ficha de al lado y el bloque «Motor»,
    // que es metadato de ingeniería.
    expect(within(family).queryByRole("radio", { name: "Health score" })).toBeNull();
    expect(screen.queryByText("Estadísticas clave")).toBeNull();
    expect(screen.queryByText("Motor")).toBeNull();
    expect(screen.queryByText("Rama de cobertura")).toBeNull();

    // Abre en Liquidez con sus señales, y las dos tarjetas de los pop-ups siguen al pie.
    expect(await screen.findByText("32 dias de colchon de caja")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cómo se calcula/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Informe de Health/ })).toBeInTheDocument();
  });

  it("DADO la familia Deuda CUANDO se elige ENTONCES señales con «No aplica» (nunca 0) y sin línea resumen del pilar", async () => {
    const user = userEvent.setup();
    select(ID);
    mockDeep();
    renderWidget();

    const family = await screen.findByRole("radiogroup", { name: "Familia" });
    await user.click(within(family).getByRole("radio", { name: "Deuda" }));

    expect(await screen.findByText("35 % de uso de las lineas")).toBeInTheDocument();

    // XR-038 (W2.1): «Deuda · P 0,72 · peso efectivo 0,20 · 1 de 2 señales
    // disponibles» se va del cuerpo; la cobertura se lee en el toggle.
    expect(screen.queryByText(loose("peso efectivo 0,20"))).toBeNull();
    expect(screen.queryByText(loose("1 de 2 señales disponibles"))).toBeNull();
    await waitFor(() =>
      expect(family.parentElement).toHaveAttribute(
        "title",
        expect.stringContaining("1 de 2 señales"),
      ),
    );

    expect(screen.getByText(loose("+0,4 pts"))).toBeInTheDocument();
    expect(screen.getAllByRole("meter").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("No aplica").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 cuotas regulares")).toBeNull();
  });

  it("DADO un grupo CUANDO carga ENTONCES lista las filiales con score, Δ1m y sparkline, sin Familia ni tarjetas; clic → select", async () => {
    const user = userEvent.setup();
    selectGroup(GROUP_ID);
    const fetchMock = mockDeep();
    renderWidget();

    const list = await screen.findByRole("listbox", { name: "Filiales" });
    expect(requestedUrls(fetchMock).some((url) => url.includes(GROUP_ROUTE))).toBe(true);

    const subsidiaries = groupExample.companies;
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(subsidiaries.length);
    for (const [index, row] of subsidiaries.entries()) {
      expect(within(options[index]).getByText(row.name)).toBeInTheDocument();
      expect(within(options[index]).getByText(thin(fmtPoints(row.score)))).toBeInTheDocument();
      expect(within(options[index]).getByText(thin(fmtDelta(row.delta_1m).text))).toBeInTheDocument();
      expect(within(options[index]).getByRole("img", { name: /Sparkline/ })).toBeInTheDocument();
    }

    expect(screen.queryByRole("radiogroup", { name: "Familia" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cómo se calcula/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Informe de Health/ })).toBeNull();

    await user.click(within(options[1]).getByText(subsidiaries[1].name));
    expect(getSelection().selected).toBe(subsidiaries[1].id);
  });

  it("DADO «Cómo se calcula» CUANDO se pulsa ENTONCES diálogo en body con los cuatro apartados en prosa, bandas y pesos; Escape cierra y devuelve el foco", async () => {
    const user = userEvent.setup();
    select(ID);
    mockDeep();
    const { container } = renderWidget();

    const trigger = await findCard(/Cómo se calcula/);
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Cómo se calcula" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.contains(dialog)).toBe(true);
    expect(container.contains(dialog)).toBe(false);

    // El pop-up ya no expone el modelo formula a formula (E17): cuatro apartados en
    // prosa, y de lo viejo solo sobreviven los dos visuales que funcionaban.
    for (const block of [
      "Qué mide el Health Score",
      "Cómo se comporta en el tiempo",
      "Qué puede limitar la cifra",
      "Qué significa la confianza",
    ]) {
      expect(within(dialog).getByText(block)).toBeInTheDocument();
    }
    await waitFor(() => expect(dialog).toHaveTextContent("Sólida"));
    expect(dialog).toHaveTextContent(loose("Cobertura completa"));
    expect(within(dialog).getAllByRole("meter").length).toBeGreaterThanOrEqual(6);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("DADO /report 200 CUANDO se abre el informe ENTONCES diálogo con riesgo, resumen, secciones, qué vigilar y pie", async () => {
    const user = userEvent.setup();
    select(ID);
    mockDeep();
    renderWidget();

    const card = await findCard(/Informe de Health/);
    expect(card).toBeEnabled();
    expect(card).toHaveTextContent(loose("Generado el 18/09/2026"));
    expect(card).toHaveTextContent("claude-opus-5");

    await user.click(card);

    const dialog = await screen.findByRole("dialog", { name: /Informe de Health/ });
    expect(within(dialog).getByText("Agricola Duero S.L.U.")).toBeInTheDocument();
    expect(within(dialog).getByText("Riesgo alto")).toBeInTheDocument();
    expect(within(dialog).getByText(REPORT.summary)).toBeInTheDocument();
    for (const section of REPORT.sections) {
      expect(within(dialog).getByRole("heading", { name: section.title })).toBeInTheDocument();
      expect(within(dialog).getByText(section.body)).toBeInTheDocument();
    }
    expect(within(dialog).getByText("Qué vigilar")).toBeInTheDocument();
    for (const point of REPORT.watch_next) {
      expect(within(dialog).getByText(point).closest("li")).not.toBeNull();
    }
    expect(dialog).toHaveTextContent(loose("Generado el 18/09/2026"));
    expect(dialog).toHaveTextContent("claude-opus-5");
  });

  it("DADO /report 404 CUANDO carga ENTONCES la tarjeta queda deshabilitada con el motivo y sin reintento", async () => {
    select(ID);
    const fetchMock = mockDeep({
      report: {
        match: `${ROUTE}/report`,
        body: { status: "report_not_found", message: REPORT_UNAVAILABLE },
        status: 404,
      },
    });
    renderWidget();

    const card = await findCard(/Informe de Health/);
    await waitFor(() => expect(card).toBeDisabled());
    expect(card).toHaveAttribute("title", REPORT_UNAVAILABLE);
    expect(card).not.toHaveTextContent(/Generado el/);

    expect(reportCalls(fetchMock)).toBe(1);
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("DADO /report 500 CUANDO se abre el informe ENTONCES ErrorState con Reintentar dentro del diálogo", async () => {
    const user = userEvent.setup();
    select(ID);
    const fetchMock = mockDeep({
      report: {
        match: `${ROUTE}/report`,
        body: { status: "error", message: "Informe corrupto" },
        status: 500,
      },
    });
    renderWidget();

    const card = await findCard(/Informe de Health/);
    await waitFor(() => expect(reportCalls(fetchMock)).toBe(1));
    expect(card).toBeEnabled();

    await user.click(card);

    const dialog = await screen.findByRole("dialog", { name: /Informe de Health/ });
    expect(within(dialog).getByRole("alert")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Riesgo alto")).toBeNull();
  });
});

describe("XR-038 (W2.1, W2.2): el toggle de familia", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("DADO el toggle CUANDO se pinta ENTONCES ancho completo, cinco opciones a partes iguales y en mayúsculas", async () => {
    select(ID);
    mockDeep();
    renderWidget();

    const family = await screen.findByRole("radiogroup", { name: "Familia" });
    // Por `className` en ESTA llamada: el primitivo `Segmented` lo comparten el
    // rango de la gráfica, el orden de contrapartes y el de unidad, y a ancho
    // completo «1M 3M 6M 1A TOTAL» se estiraría por toda la ficha.
    expect(family.className).toContain("w-full");
    expect(family.className).toContain("[&>button]:flex-1");
    expect(family.className).toContain("[&>button]:uppercase");
    expect(family.className).toContain("[&>button]:tracking-wide");
    expect(family.className).toContain("[&>button]:text-[length:var(--text-body)]");
  });

  it("DADO la cobertura de señales CUANDO ya no está en el cuerpo ENTONCES se lee en el title del toggle", async () => {
    select(ID);
    mockDeep();
    renderWidget();

    const family = await screen.findByRole("radiogroup", { name: "Familia" });
    // Liquidez abre por defecto y trae sus tres señales con dato: es la única
    // forma que queda de saber cuántas señales sostienen la familia activa.
    await waitFor(() =>
      expect(family.parentElement).toHaveAttribute(
        "title",
        expect.stringContaining("3 de 3 señales"),
      ),
    );
    expect(family.parentElement).toHaveAttribute(
      "title",
      expect.stringContaining("Liquidez"),
    );
  });
});
