import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { fmtMonth } from "@/charts";
import { resetSelection } from "@/dashboard/selection";
import { resetStore } from "@/dashboard/store";
import { alertsFixture, metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi, renderRoute } from "@/test/helpers";

/**
 * `/monitor` lee `/api/v2/alerts` (contrato v2). Antes leía el monitor v1 y
 * enseñaba un cartel de «Motor pendiente» aunque el motor publicase alertas.
 */

/** La fixture va de la más antigua a la más reciente, como la sirve la API. */
const [oldest, middle, newest] = alertsFixture.items;

function mount(items: typeof alertsFixture.items, status?: number) {
  mockApi([
    { match: "/api/v2/meta", body: metaFixture },
    { match: "/api/v2/universe", body: universeFixture },
    {
      match: "/api/v2/alerts",
      body: status
        ? { status: "error", message: "Sin tablas" }
        : { ...alertsFixture, items, total: items.length },
      status,
    },
  ]);
  renderRoute("/monitor");
}

function rows(): HTMLElement[] {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

describe("Monitor", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    resetSelection();
  });

  it("DADO alertas publicadas CUANDO se abre /monitor ENTONCES una fila por alerta, la más reciente arriba, con severidad, empresa, mensaje y mes", async () => {
    mount(alertsFixture.items);

    expect(await screen.findByText(newest.message)).toBeInTheDocument();
    const items = rows();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(newest.message);
    expect(items[1]).toHaveTextContent(middle.message);
    expect(items[2]).toHaveTextContent(oldest.message);

    // `newest` es `review`, `middle` es `watch` y `oldest` es `urgent`.
    expect(within(items[0]).getByText("Revisar")).toBeInTheDocument();
    expect(within(items[2]).getByText("Urgente")).toBeInTheDocument();
    expect(within(items[0]).getByText(newest.company_name!)).toBeInTheDocument();
    expect(within(items[0]).getByText(fmtMonth(newest.month_detected))).toBeInTheDocument();

    // El cartel del motor v1 se fue con el contrato v1.
    expect(screen.queryByText("Motor pendiente")).not.toBeInTheDocument();
    expect(screen.queryByText(/Modo demostración/)).not.toBeInTheDocument();
  });

  it("DADO una severidad que el diccionario no conoce CUANDO se pinta ENTONCES cae al valor por defecto y no lanza", async () => {
    // Regresión de XR-035: con `critical` la búsqueda devolvía undefined y leer
    // su propiedad desmontaba el árbol entero.
    const raro = { ...newest, severity: "critical" as unknown as (typeof newest)["severity"] };
    mount([raro]);

    expect(await screen.findByText(raro.message)).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText("Vigilar")).toBeInTheDocument();
  });

  it("DADO 0 alertas CUANDO se pinta ENTONCES el estado vacío dice que no implica ausencia de riesgo", async () => {
    mount([]);

    expect(
      await screen.findByText(/Una bandeja vacía no implica ausencia de riesgo/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("DADO un 500 de la API CUANDO se pinta ENTONCES estado de error con reintento", async () => {
    mount([], 500);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
