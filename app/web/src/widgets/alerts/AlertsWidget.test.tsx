import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { fmtMonth } from "@/charts";
import { getSelection, resetSelection } from "@/dashboard/selection";
import type { LayoutItem } from "@/dashboard/types";
import { alertsFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { AlertsWidget } from "@/widgets/alerts/AlertsWidget";

const ITEM: LayoutItem = { i: "w1", type: "alerts", x: 0, y: 0, w: 8, h: 12, entity: null };

/** Radix abre desplegables con la API de puntero, que jsdom no implementa. */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

/** Radix bloquea el puntero del `body` mientras el desplegable esta abierto. */
afterEach(() => {
  document.body.style.pointerEvents = "";
});

/**
 * Tres alertas de la fixture con meses distintos, en orden ascendente (como las
 * devuelve la API): la más reciente es la ÚLTIMA del array y tiene que salir la
 * primera. La última es `urgent` para ver los dos colores de punto.
 */
const [oldest, middle, newest] = alertsFixture.items;
const ALERTS = [
  { ...oldest, month_detected: "2025-03", severity: "watch" as const, cause: "buffer_days" },
  { ...middle, month_detected: "2026-01", severity: "review" as const, cause: "band_drop" },
  { ...newest, month_detected: "2026-07", severity: "urgent" as const, cause: "cap_applied" },
];
const alerts = { ...alertsFixture, items: ALERTS, total: ALERTS.length };

function renderWidget() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <AlertsWidget item={ITEM} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rows(): HTMLElement[] {
  return within(screen.getByRole("list")).getAllByRole("button");
}

/** La fila imprime el nombre de la empresa y cae al id cuando la API no lo trae. */
function label(alert: { company_id: string; company_name?: string | null }): string {
  return alert.company_name ?? alert.company_id;
}

describe("widget Alertas", () => {
  beforeEach(() => {
    resetSelection();
  });

  it("DADO /alerts con 3 items CUANDO se monta ENTONCES 3 filas de 34 px, la más reciente primero, con punto de severidad y mes", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/alerts", body: alerts }]);
    renderWidget();

    expect(await screen.findByText(label(newest))).toBeInTheDocument();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("/api/v2/alerts");
    expect(calledUrl).toContain("limit=50");
    // P4: sin esto la bandeja repite sociedad y se queda en el ultimo mes.
    expect(calledUrl).toContain("latest_per_company=true");

    const items = rows();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(label(newest));
    expect(items[1]).toHaveTextContent(label(middle));
    expect(items[2]).toHaveTextContent(label(oldest));

    // XR-038 (W5.2): con el texto a 13 px la fila sube de 28 a 34 px o las
    // filas se solapan. El alto lo pone el `style`, que es por lo que mide el
    // contenedor.
    for (const row of items) {
      expect(`${row.className} ${row.getAttribute("style") ?? ""}`).toMatch(/34px/);
    }

    expect(within(items[0]).getByText("Urgente")).toBeInTheDocument();
    expect(within(items[1]).getByText("Revisar")).toBeInTheDocument();
    expect(within(items[2]).getByText("Vigilar")).toBeInTheDocument();
    expect(within(items[0]).getByText(fmtMonth("2026-07"))).toBeInTheDocument();
    expect(within(items[2]).getByText(fmtMonth("2025-03"))).toBeInTheDocument();
    // Con cinco causas, la fila dice cual es: antes todas eran `buffer_days`.
    // La prosa del motor no cabe al lado en 330 px, asi que viaja en el `title`
    // y en un `sr-only`, no recortada a una letra.
    expect(within(items[0]).getByText("Techo activado")).toHaveAttribute("title", newest.message);
    expect(within(items[0]).getByText(newest.message)).toHaveClass("sr-only");
    expect(within(items[1]).getByText("Bajada de banda")).toBeInTheDocument();
    expect(within(items[2]).getByText("Colchón de caja")).toBeInTheDocument();
  });

  it("DADO una fila CUANDO se lee ENTONCES la sociedad a 13 px blanca peso 600, la causa a 13 px en secundario y el mes en micro", async () => {
    // XR-038 (W5.2): el nombre de la sociedad iba a 11 px en gris, o sea que lo
    // que menos se leía era de quién era la alerta. El mensaje largo del motor
    // sigue SIN pintarse en el cuerpo: a 330 px se recortaba a una letra.
    mockApi([{ match: "/api/v2/alerts", body: alerts }]);
    renderWidget();
    await screen.findByText(label(newest));

    const row = rows()[0];
    const company = within(row).getByText(label(newest));
    expect(company.className).toContain("text-[length:var(--text-body)]");
    expect(company.className).toContain("text-content-primary");
    expect(company.className).toContain("font-semibold");

    const cause = within(row).getByText("Techo activado");
    expect(cause.className).toContain("text-[length:var(--text-body)]");
    expect(cause.className).toContain("text-content-secondary");

    const month = within(row).getByText(fmtMonth("2026-07"));
    expect(month.className).toContain("text-[length:var(--text-micro)]");

    // El mensaje del motor no sale al cuerpo de la fila al agrandar los otros dos.
    expect(within(row).getByText(newest.message)).toHaveClass("sr-only");
  });

  it("DADO el filtro de la cabecera CUANDO se elige una causa ENTONCES la API la recibe y el control sigue ahi", async () => {
    const soloTecho = ALERTS.filter((alert) => alert.cause === "cap_applied");
    const fetchMock = mockApi([{ match: "/api/v2/alerts", body: alerts }]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(label(newest));

    mockApi([
      { match: "cause=cap_applied", body: { ...alerts, items: soloTecho, total: 1 } },
      { match: "/api/v2/alerts", body: alerts },
    ]);
    // Con el teclado, que es lo que hace un usuario sin raton y lo unico que
    // jsdom simula de forma fiable con Radix.
    screen.getByRole("combobox", { name: "Causa" }).focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "Techo activado" }));

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent(label(newest));
    // La primera llamada iba sin causa; la de despues la lleva.
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).not.toContain("cause=");
    expect(screen.getByRole("combobox", { name: "Causa" })).toBeInTheDocument();
  });

  it("DADO una causa que el diccionario no conoce CUANDO se monta ENTONCES la humaniza y no tumba la bandeja", async () => {
    // La otra mitad de la leccion de XR-035: `CAUSE_LABEL` tambien se indexa con
    // lo que publica el motor. Una causa nueva se lee peor, pero se lee.
    const raro = { ...newest, cause: "customer_late_rate" };
    mockApi([{ match: "/api/v2/alerts", body: { ...alerts, items: [raro], total: 1 } }]);
    renderWidget();

    await screen.findByText(label(raro));
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("customer late rate")).toBeInTheDocument();
  });

  it("DADO un filtro sin resultados CUANDO se vacia la bandeja ENTONCES el control sigue ahi para volver", async () => {
    // Filtrar a una causa sin alertas y perder el desplegable es un callejon
    // sin salida: el vacio se pinta debajo de la cabecera, no en su lugar.
    mockApi([{ match: "/api/v2/alerts", body: { ...alerts, items: [], total: 0 } }]);
    renderWidget();

    expect(await screen.findByText("Sin alertas en este corte")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Causa" })).toBeInTheDocument();
  });

  it("DADO una fila CUANDO clic ENTONCES selected es su company_id y la fila lleva aria-current", async () => {
    mockApi([{ match: "/api/v2/alerts", body: alerts }]);
    const user = userEvent.setup();
    renderWidget();
    await screen.findByText(label(newest));

    expect(rows()[1]).not.toHaveAttribute("aria-current", "true");
    await user.click(rows()[1]);

    expect(getSelection().selected).toBe(middle.company_id);
    expect(rows()[1]).toHaveAttribute("aria-current", "true");
    expect(rows()[0]).not.toHaveAttribute("aria-current", "true");
  });

  it("DADO una severidad que el diccionario no conoce CUANDO se monta ENTONCES la pinta por defecto y no lanza", async () => {
    // Regresion de XR-035: el motor publicaba `critical` (la banda del colchon)
    // y la busqueda devolvia undefined, asi que leer su propiedad reventaba y se
    // llevaba el arbol entero. Una severidad desconocida se degrada, no explota.
    const raro = { ...newest, severity: "critical" as unknown as (typeof newest)["severity"] };
    mockApi([{ match: "/api/v2/alerts", body: { ...alerts, items: [raro], total: 1 } }]);
    renderWidget();

    const fila = await screen.findByText(label(raro));
    expect(fila).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    // Cae al escalon mas bajo del vocabulario en vez de inventarse uno.
    expect(within(rows()[0]).getByText("Vigilar")).toBeInTheDocument();
  });

  it("DADO /alerts vacío CUANDO se monta ENTONCES «Sin alertas en este corte»", async () => {
    mockApi([{ match: "/api/v2/alerts", body: { ...alerts, items: [], total: 0 } }]);
    renderWidget();

    expect(await screen.findByText("Sin alertas en este corte")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("DADO carga y 500 CUANDO se monta ENTONCES skeleton y luego ErrorState con Reintentar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const pending = renderWidget();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    pending.unmount();

    mockApi([
      { match: "/api/v2/alerts", body: { status: "error", message: "Sin tablas" }, status: 500 },
    ]);
    renderWidget();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
