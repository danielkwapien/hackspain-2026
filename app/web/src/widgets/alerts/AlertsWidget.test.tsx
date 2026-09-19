import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { fmtMonth } from "@/charts";
import { getSelection, resetSelection } from "@/dashboard/selection";
import type { LayoutItem } from "@/dashboard/types";
import { alertsFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { AlertsWidget } from "@/widgets/alerts/AlertsWidget";

const ITEM: LayoutItem = { i: "w1", type: "alerts", x: 0, y: 0, w: 8, h: 12, entity: null };

/**
 * Tres alertas de la fixture con meses distintos, en orden ascendente (como las
 * devuelve la API): la más reciente es la ÚLTIMA del array y tiene que salir la
 * primera. La última es `urgent` para ver los dos colores de punto.
 */
const [oldest, middle, newest] = alertsFixture.items;
const ALERTS = [
  { ...oldest, month_detected: "2025-03", severity: "watch" as const },
  { ...middle, month_detected: "2026-01", severity: "review" as const },
  { ...newest, month_detected: "2026-07", severity: "urgent" as const },
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

  it("DADO /alerts con 3 items CUANDO se monta ENTONCES 3 filas de 28 px, la más reciente primero, con punto de severidad y mes", async () => {
    const fetchMock = mockApi([{ match: "/api/v2/alerts", body: alerts }]);
    renderWidget();

    expect(await screen.findByText(label(newest))).toBeInTheDocument();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("/api/v2/alerts");
    expect(calledUrl).toContain("limit=50");

    const items = rows();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(label(newest));
    expect(items[1]).toHaveTextContent(label(middle));
    expect(items[2]).toHaveTextContent(label(oldest));

    for (const row of items) {
      expect(`${row.className} ${row.getAttribute("style") ?? ""}`).toMatch(/h-7\b|28px/);
    }

    expect(within(items[0]).getByText("Urgente")).toBeInTheDocument();
    expect(within(items[1]).getByText("Revisar")).toBeInTheDocument();
    expect(within(items[2]).getByText("Vigilar")).toBeInTheDocument();
    expect(within(items[0]).getByText(fmtMonth("2026-07"))).toBeInTheDocument();
    expect(within(items[2]).getByText(fmtMonth("2025-03"))).toBeInTheDocument();
    expect(within(items[0]).getByText(newest.message)).toHaveAttribute("title", newest.message);
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
