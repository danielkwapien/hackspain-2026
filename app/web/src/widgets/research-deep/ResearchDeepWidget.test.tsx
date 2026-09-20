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

/**
 * Las tres tablas de evidencia de W2.3, con la forma real de sus endpoints:
 * un producto bancario con saldo y otro sin fila en `balances`, un producto de
 * deuda en magnitudes y un movimiento al corte.
 */
const CASH = {
  company_id: ID,
  group_id: GROUP_ID,
  as_of: "2026-09-01",
  summary: {
    n_products: 2,
    n_banks: 2,
    total_eur: 146711.13,
    by_currency: [{ currency: "EUR", n_products: 2, total: 146711.13 }],
  },
  items: [
    {
      product_id: "PRODUCT_07734",
      bank_name: "Bankinter Empresas",
      label: "CHECKING_06",
      type: "checking",
      currency: "EUR",
      balance: 146711.13,
    },
    {
      product_id: "PRODUCT_04411",
      bank_name: "Abanca Empresas",
      label: "CHECKING_03",
      type: "checking",
      currency: "EUR",
      balance: null,
    },
  ],
};

const DEBT = {
  company_id: ID,
  group_id: GROUP_ID,
  summary: { n_products: 1, n_banks: 1, currencies: ["EUR"] },
  items: [
    {
      product_id: "PRODUCT_07627",
      label: "LOAN_04",
      type: "loan",
      bank_name: "Caixabank Empresas",
      currency: "EUR",
      granted_abs: 231543.08,
      outstanding_abs: 164876.71,
    },
  ],
};

const ACTIVITY = {
  company_id: ID,
  group_id: GROUP_ID,
  as_of: "2026-08-01",
  limit: 12,
  items: [
    {
      transaction_id: "75a16e3e",
      date: "2026-08-01",
      category: "debt_repayment",
      bank_name: "Caixabank Empresas",
      product_label: "LINEOFCREDIT_03",
      amount: -3055.77,
      status: "booked",
    },
  ],
};

/**
 * Las contrapartes de XR-036, que Pago y Cobros montan bajo sus señales. Aquí
 * con el libro vacío: lo que esta prueba mira es qué familia enseña qué tabla,
 * no la concentración de proveedores, que tiene su propio test.
 */
const COUNTERPARTIES = {
  company_id: ID,
  group_id: GROUP_ID,
  as_of: AS_OF,
  side: "ap",
  sort: "weight",
  currency: "EUR",
  summary: {
    month: AS_OF,
    n_counterparties: 0,
    total_amount: null,
    top1_weight: null,
    effective_counterparties: null,
    hhi: null,
    days_late_w: null,
    pct_late: null,
    overdue_total: null,
    eur_share: null,
  },
  items: [],
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
    { match: `${ROUTE}/counterparties`, body: COUNTERPARTIES },
    { match: `${ROUTE}/cash`, body: CASH },
    { match: `${ROUTE}/debt`, body: DEBT },
    { match: `${ROUTE}/activity`, body: ACTIVITY },
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

    // El pop-up ya no expone el modelo formula a formula (E17): apartados en
    // prosa, y de lo viejo solo sobreviven los dos visuales que funcionaban.
    // Los títulos exactos los fija `panels/research/Methodology` y los cuenta
    // su propio test (W2.5 los lleva de cuatro a cinco): desde aquí se
    // comprueba que el diálogo sigue montando prosa en bloques, que es lo que
    // este widget abre, sin clavar una copia que vive en otro fichero.
    expect(within(dialog).getByText("Qué mide el Health Score")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("heading").length).toBeGreaterThanOrEqual(4);
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

describe("XR-038 (W2.3): la tabla de evidencia de cada familia", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("DADO Liquidez CUANDO abre ENTONCES «Dónde está la caja», y ninguna de las otras dos tablas", async () => {
    select(ID);
    const fetchMock = mockDeep();
    renderWidget();

    await screen.findByText("Bankinter Empresas");
    const cash = screen.getByRole("region", { name: "Dónde está la caja" });
    expect(within(cash).getByText("146.711,13")).toBeInTheDocument();
    // Sin fila en `balances`: «—», nunca 0.
    expect(within(cash).getByText("—")).toBeInTheDocument();

    expect(screen.queryByRole("region", { name: "Posiciones de financiación" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Últimos movimientos" })).toBeNull();
    // Solo la familia visible pide: cambiar de familia no deja tres peticiones abiertas.
    const urls = requestedUrls(fetchMock);
    expect(urls.some((url) => url.includes(`${ROUTE}/cash`))).toBe(true);
    expect(urls.some((url) => url.includes(`${ROUTE}/debt`))).toBe(false);
    expect(urls.some((url) => url.includes(`${ROUTE}/activity`))).toBe(false);
  });

  it("DADO Deuda CUANDO se elige ENTONCES «Posiciones de financiación» en magnitudes, sin utilización", async () => {
    const user = userEvent.setup();
    select(ID);
    mockDeep();
    renderWidget();

    const family = await screen.findByRole("radiogroup", { name: "Familia" });
    await user.click(within(family).getByRole("radio", { name: "Deuda" }));

    const debt = await screen.findByRole("region", { name: "Posiciones de financiación" });
    expect(within(debt).getByRole("rowheader", { name: "LOAN_04" })).toBeInTheDocument();
    expect(within(debt).getByText("231.543,08")).toBeInTheDocument();
    expect(within(debt).getByRole("table")).not.toHaveTextContent(/utilizaci[oó]n/i);
    expect(screen.queryByRole("region", { name: "Dónde está la caja" })).toBeNull();
  });

  it("DADO Actividad CUANDO se elige ENTONCES «Últimos movimientos» al corte, sin marcadores de anonimización", async () => {
    const user = userEvent.setup();
    select(ID);
    mockDeep();
    renderWidget();

    const family = await screen.findByRole("radiogroup", { name: "Familia" });
    await user.click(within(family).getByRole("radio", { name: "Actividad" }));

    const activity = await screen.findByRole("region", { name: "Últimos movimientos" });
    expect(within(activity).getByRole("rowheader", { name: "Cuota de deuda" })).toBeInTheDocument();
    expect(
      within(activity).getByText("Caixabank Empresas · LINEOFCREDIT_03"),
    ).toBeInTheDocument();
    expect(activity.textContent ?? "").not.toMatch(/\[(NUM|COMPANY|IBAN)\]/);
    expect(activity).toHaveTextContent(loose("hasta el corte del 01/08/2026"));
  });

  it("DADO Pago CUANDO se elige ENTONCES sigue con sus contrapartes y ninguna tabla nueva", async () => {
    const user = userEvent.setup();
    select(ID);
    mockDeep();
    renderWidget();

    const family = await screen.findByRole("radiogroup", { name: "Familia" });
    await user.click(within(family).getByRole("radio", { name: "Pago" }));

    // Pago y Cobros ya tenían su evidencia desde XR-036 y no cambia.
    expect(await screen.findByRole("region", { name: "Proveedores" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Dónde está la caja" })).toBeNull(),
    );
    expect(screen.queryByRole("region", { name: "Posiciones de financiación" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Últimos movimientos" })).toBeNull();
  });
});
