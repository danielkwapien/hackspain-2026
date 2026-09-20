/**
 * La fila «Tesorería» (XR-037, E13), que sustituye a «Señales».
 *
 * Los valores son los que publica la API para COMP_0169 al corte 2026-08: las cuatro
 * señales de `/signals` y el resumen del libro de clientes de `/counterparties?side=ar`.
 */

import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { AS_OF, signalsExample } from "@/test/examples";
import { mockApi } from "@/test/helpers";
import { TreasuryRow } from "@/panels/research/TreasuryRow";

const ID = "COMP_0169";
const ROUTE = `/api/v2/companies/${ID}`;

const TEMPLATE = signalsExample.pillars[0].signals[0];

function signal(
  signalId: string,
  name: string,
  value: number | null,
  valueFmt: string | null,
  deltaVsPrev = 0,
) {
  return {
    ...TEMPLATE,
    signal_id: signalId,
    name,
    value,
    value_fmt: valueFmt,
    delta_vs_prev: deltaVsPrev,
    is_available: value !== null,
    series_24m: [],
  };
}

const signals = {
  ...signalsExample,
  company_id: ID,
  as_of: AS_OF,
  pillars: [
    {
      pillar: "L",
      pillar_name: "Liquidez",
      weight: 0.25,
      value: 0.42,
      signals: [
        signal("buffer_days", "Dias de caja sobre salidas operativas", 6.2591, "6 dias", -2.3733),
        signal("cash_trend", "Tendencia de la caja", 1, "+100,0 %"),
        signal("neg_cash_share", "Meses recientes con caja negativa", 0, "0 %"),
      ],
    },
    {
      pillar: "A",
      pillar_name: "Actividad",
      weight: 0.2,
      value: 0.84,
      signals: [
        signal("net_ocf_ratio", "Flujo operativo neto", 0.0234, "+0,02"),
        signal("op_in_growth", "Crecimiento de cobros operativos", 1.379, "+137,9 %"),
      ],
    },
  ],
};

const summary = {
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
};

const counterparties = {
  company_id: ID,
  group_id: "GROUP_0090",
  as_of: AS_OF,
  side: "ar",
  sort: "weight",
  currency: "EUR",
  summary,
  items: [],
};

/** Libro de clientes vacío: la API responde 200 con el resumen a nulos. */
const emptyBook = {
  ...counterparties,
  summary: {
    ...summary,
    month: null,
    n_counterparties: 0,
    total_amount: null,
    effective_counterparties: null,
    overdue_total: null,
  },
};

function mockRow({ book = counterparties }: { book?: unknown } = {}) {
  return mockApi([
    { match: `${ROUTE}/signals`, body: signals },
    { match: `${ROUTE}/counterparties`, body: book },
  ]);
}

function renderRow() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TreasuryRow id={ID} />
    </QueryClientProvider>,
  );
}

/** Regex tolerante al espacio fino (U+2009) y a los saltos entre nodos. */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

/** Celda (término + valor) de la fila a partir de su etiqueta. */
async function cell(label: string): Promise<HTMLElement> {
  const term = await screen.findByText(label);
  const box = term.closest("div");
  if (box === null) throw new Error(`«${label}» no es el término de una tarjeta`);
  return box;
}

describe("fila de tesorería", () => {
  it("DADO señales y contrapartes CUANDO carga ENTONCES seis tarjetas de tesorería, no los drivers del score", async () => {
    mockRow();
    renderRow();

    const section = await screen.findByRole("region", { name: "Tesorería" });
    const terms = within(section)
      .getAllByRole("term")
      .map((term) => term.textContent?.trim());
    expect(terms).toEqual([
      "Runway de caja",
      "Tendencia de caja",
      "Meses en negativo",
      "Flujo operativo neto",
      "Concentración de clientes",
      "Vencido de clientes",
    ]);

    // El bloque «Señales» duplicaba la fila de pilares y las perspectivas.
    expect(screen.queryByRole("region", { name: "Señales" })).toBeNull();
    expect(within(section).queryByText(/Pilar ·/)).toBeNull();
    // Y ninguna celda dice «No aplica» con estos datos: las seis tienen cifra.
    expect(within(section).queryByText("No aplica")).toBeNull();
  });

  it("DADO las cuatro señales publicadas CUANDO se pintan ENTONCES su value_fmt compacto y la ventana medida del catálogo", async () => {
    mockRow();
    renderRow();

    expect(await cell("Runway de caja")).toHaveTextContent(loose("6 d"));
    // Δ frente al mes anterior, en días: −2,4 sobre 6,26.
    expect(await cell("Runway de caja")).toHaveTextContent(loose("−2,4 d en el mes"));

    // A 20 px «+100,0 %» no cabe en una sexta parte de la fila: por encima de las tres
    // cifras la décima se va, y la frase entera sigue en el `title`.
    expect(await cell("Tendencia de caja")).toHaveTextContent(loose("+100 %"));
    expect(
      within(await cell("Tendencia de caja")).getByTitle(loose("+100,0 %")),
    ).toBeInTheDocument();
    expect(await cell("Tendencia de caja")).toHaveTextContent("3 m frente a los 3 previos");

    // `neg_cash_share` es de 3 meses: nunca «0 de 12».
    expect(await cell("Meses en negativo")).toHaveTextContent(loose("0 %"));
    expect(await cell("Meses en negativo")).toHaveTextContent("últimos 3 meses");
    expect(screen.queryByText(/de 12/)).toBeNull();

    expect(await cell("Flujo operativo neto")).toHaveTextContent(loose("+0,02"));
  });

  it("DADO el libro de clientes de XR-036 CUANDO se lee ENTONCES concentración efectiva y vencido, con la frase entera en title", async () => {
    mockRow();
    renderRow();

    const concentration = await cell("Concentración de clientes");
    expect(concentration).toHaveTextContent(loose("2,11"));
    expect(concentration).toHaveTextContent(loose("de 133 en 12 m"));
    expect(within(concentration).getByTitle("2,11 clientes efectivos")).toBeInTheDocument();

    // A 20 px «EUR 31,8 k» no cabe: la moneda baja al pie y la cifra se queda sola.
    const overdue = await cell("Vencido de clientes");
    expect(overdue).toHaveTextContent(loose("31,8 k"));
    expect(overdue).toHaveTextContent("EUR · facturas vencidas");
    expect(within(overdue).getByTitle(loose("EUR 31.750,30"))).toBeInTheDocument();
  });

  it("DADO una sociedad sin libro de clientes CUANDO la API responde con nulos ENTONCES «No aplica», nunca un 0", async () => {
    mockRow({ book: emptyBook });
    renderRow();

    expect(await cell("Concentración de clientes")).toHaveTextContent("No aplica");
    expect(await cell("Vencido de clientes")).toHaveTextContent("No aplica");
    // Las señales de caja siguen en su sitio.
    expect(await cell("Runway de caja")).toHaveTextContent(loose("6 d"));
    const values = [...document.querySelectorAll("dd")].map((node) => node.textContent?.trim());
    expect(values).not.toContain("0");
  });

  it("DADO /counterparties caído CUANDO falla ENTONCES la fila sigue con las señales de caja", async () => {
    mockApi([
      { match: `${ROUTE}/signals`, body: signals },
      { match: `${ROUTE}/counterparties`, body: { status: "error" }, status: 500 },
    ]);
    renderRow();

    expect(await cell("Runway de caja")).toHaveTextContent(loose("6 d"));
    expect(await cell("Vencido de clientes")).toHaveTextContent("No aplica");
  });

  it("DADO la sección CUANDO se lee la cabecera ENTONCES «TESORERÍA» a --text-section, peso 600 y en blanco", async () => {
    // XR-038 (W1.5): la cabecera de sección subía un escalón de la escala,
    // conservando `uppercase tracking-wide`. No es un `px` nuevo: es el token.
    mockRow();
    renderRow();

    const section = await screen.findByRole("region", { name: "Tesorería" });
    const heading = within(section).getByRole("heading", { name: "Tesorería" });
    expect(heading.className).toContain("text-[length:var(--text-section)]");
    expect(heading.className).toContain("font-semibold");
    expect(heading.className).toContain("text-content-primary");
    expect(heading.className).toContain("uppercase");
    expect(heading.className).toContain("tracking-wide");
    expect(heading.className).not.toContain("text-content-secondary");
  });

  it("DADO las seis cards CUANDO se pintan ENTONCES etiqueta blanca a 12 px, cifra a 30 px y pie en micro secundario", async () => {
    // XR-038 (W1.4 y W1.6): la rejilla de seis se queda —son cifras cortas y en
    // una columna por fila se vería vacía—, pero la cifra sube a
    // `--text-figure-lg` y la etiqueta deja de ser gris sin robarle jerarquía.
    mockRow();
    renderRow();

    const section = await screen.findByRole("region", { name: "Tesorería" });
    for (const term of within(section).getAllByRole("term")) {
      expect(term.className, term.textContent ?? "").toContain(
        "text-[length:var(--text-control)]",
      );
      expect(term.className, term.textContent ?? "").toContain("text-content-primary");
      expect(term.className, term.textContent ?? "").not.toContain("text-content-secondary");
      expect(term.className, term.textContent ?? "").not.toContain("font-semibold");
    }

    const figure = within(await cell("Runway de caja")).getByTitle("6 dias");
    expect(figure.className).toContain("text-[length:var(--text-figure-lg)]");
    expect(figure.className).toContain("font-semibold");

    const caption = within(await cell("Runway de caja")).getByText(loose("−2,4 d en el mes"));
    expect(caption.className).toContain("text-[length:var(--text-micro)]");
    expect(caption.className).toContain("text-content-secondary");
  });
});
