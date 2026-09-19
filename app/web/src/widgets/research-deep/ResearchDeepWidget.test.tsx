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

/** La misma ficha sin alerta, país, ERP, techo ni penalización: nada de eso se pinta como 0. */
const bareCompany = {
  ...company,
  company: { ...company.company, country: null, erp: null },
  penalty: { points: 0, weakest_pillar: null },
  cap: null,
  alert: null,
  strength_flags: [],
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

/** `reference` con la forma del manifest para que la metodología pinte bandas y pesos. */
const meta = {
  ...metaExample,
  reference: {
    ...metaExample.reference,
    pillar_weights: { L: 25, P: 20, C: 15, D: 20, A: 20 },
    bands: { solid: [80, null], healthy: [60, 80], watch: [40, 60], stress: [null, 40] },
  },
};

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

/** Valor (`dd`) de una estadística clave a partir del texto de su término (`dt`). */
function stat(label: string): HTMLElement {
  const dt = screen
    .getAllByText(label)
    .map((node) => node.closest("dt"))
    .find((node): node is HTMLElement => node !== null);
  if (!dt) throw new Error(`«${label}» no es el término de una estadística`);
  const dd =
    dt.nextElementSibling?.tagName === "DD"
      ? dt.nextElementSibling
      : dt.parentElement?.querySelector("dd");
  if (!(dd instanceof HTMLElement)) throw new Error(`«${label}» no tiene valor`);
  return dd;
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

  it("DADO una empresa CUANDO carga ENTONCES «Familia» con Health score y las estadísticas clave en tres grupos", async () => {
    select(ID);
    mockDeep();
    renderWidget();

    expect(await screen.findByText("Estadísticas clave")).toBeInTheDocument();

    const family = screen.getByRole("radiogroup", { name: "Familia" });
    expect(within(family).getAllByRole("radio")).toHaveLength(6);
    expect(within(family).getByRole("radio", { name: "Health score" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    for (const name of ["Liquidez", "Pago", "Cobros", "Deuda", "Actividad"]) {
      expect(within(family).getByRole("radio", { name })).toHaveAttribute("aria-checked", "false");
    }

    // Tres grupos: Score · Motor · Empresa.
    expect(screen.getAllByText("Score").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Motor")).toBeInTheDocument();
    expect(screen.getByText("Empresa")).toBeInTheDocument();

    expect(stat("Score")).toHaveTextContent(loose("57,4 pts"));
    expect(stat("Banda")).toHaveTextContent("Vigilancia");
    expect(stat("Régimen")).toHaveTextContent("Deteriorándose");
    expect(stat("Outlook 3 m")).toHaveTextContent(loose("53,7 pts"));
    expect(stat("Outlook 6 m")).toHaveTextContent(loose("50,8 pts"));
    expect(stat("Banda outlook")).toHaveTextContent(/41,4.*60,2/);
    expect(stat("Confianza")).toHaveTextContent(/100\s?%/);

    expect(stat("Base")).toHaveTextContent(loose("64,4 pts"));
    expect(stat("Penalización")).toHaveTextContent(loose("−2,0 pts (Liquidez)"));
    expect(stat("Techo")).toHaveTextContent(/sin techo/i);
    expect(stat("Meses de historia")).toHaveTextContent(/\b21\b/);
    expect(stat("Rama de cobertura")).toHaveTextContent("full");
    expect(stat("Última alerta")).toHaveTextContent(loose("Revisar · 07/2026"));

    expect(stat("Grupo")).toHaveTextContent(/GROUP_0095|Ulzama Participaciones/);
    expect(stat("País")).toHaveTextContent("ES");
    expect(stat("Moneda")).toHaveTextContent("EUR");
    expect(stat("ERP")).toHaveTextContent("businessCentral");
    expect(stat("Operativa 12 m")).toHaveTextContent(loose("EUR 8,2 M"));
    expect(stat("Facturas · Productos")).toHaveTextContent(loose("2.188 · 6"));

    // Los términos con definición llevan ⓘ.
    expect(screen.getAllByRole("button", { name: /^Definición de/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Cómo se calcula/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Informe de Health/ })).toBeInTheDocument();
  });

  it("DADO ausentes (alerta, país, ERP, techo, penalización) CUANDO se pintan ENTONCES «—» / «sin alertas», nunca 0", async () => {
    select(ID);
    mockDeep({ sheet: bareCompany });
    renderWidget();

    await screen.findByText("Estadísticas clave");

    expect(stat("Última alerta")).toHaveTextContent(/sin alertas/i);
    expect(stat("País")).toHaveTextContent("—");
    expect(stat("ERP")).toHaveTextContent("—");
    expect(stat("Fortalezas")).toHaveTextContent("—");
    expect(stat("Techo")).toHaveTextContent(/sin techo/i);
    expect(stat("Penalización")).toHaveTextContent(/sin penalización/i);

    const values = [...document.querySelectorAll("dd")].map((node) => node.textContent?.trim());
    expect(values).not.toContain("0");
    expect(values.some((value) => /^0,0\s?pts$/.test(value ?? ""))).toBe(false);
  });

  it("DADO la familia Deuda CUANDO se elige ENTONCES línea resumen del pilar y señales con «No aplica» (nunca 0)", async () => {
    const user = userEvent.setup();
    select(ID);
    mockDeep();
    renderWidget();
    await screen.findByText("Estadísticas clave");

    const family = screen.getByRole("radiogroup", { name: "Familia" });
    await user.click(within(family).getByRole("radio", { name: "Deuda" }));

    expect(await screen.findByText("35 % de uso de las lineas")).toBeInTheDocument();
    expect(screen.queryByText("Estadísticas clave")).toBeNull();

    // «Deuda · P 0,72 · peso efectivo 0,20 · 1 de 2 señales disponibles».
    expect(screen.getByText(loose("P 0,72"))).toBeInTheDocument();
    expect(screen.getByText(loose("peso efectivo 0,20"))).toBeInTheDocument();
    expect(screen.getByText(loose("1 de 2 señales disponibles"))).toBeInTheDocument();

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

  it("DADO «Cómo se calcula» CUANDO se pulsa ENTONCES diálogo en body con bandas, pesos, identidad, techos, outlook, confianza y regímenes; Escape cierra y devuelve el foco", async () => {
    const user = userEvent.setup();
    select(ID);
    mockDeep();
    const { container } = renderWidget();
    await screen.findByText("Estadísticas clave");

    const trigger = await findCard(/Cómo se calcula/);
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Cómo se calcula" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.contains(dialog)).toBe(true);
    expect(container.contains(dialog)).toBe(false);

    for (const block of [
      "2 · Pilares",
      "4 · Techos por eventos duros",
      "5 · Bandas",
      "6 · Contribuciones e identidad",
      "7 · Outlook a 3 y 6 meses",
      "8 · Confianza del score",
      "9 · Regímenes",
    ]) {
      expect(within(dialog).getByText(block)).toBeInTheDocument();
    }
    await waitFor(() => expect(dialog).toHaveTextContent(loose("≥ 80 Sólida")));
    expect(dialog).toHaveTextContent(/sin techo/i);
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
