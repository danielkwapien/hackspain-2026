import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Counterparties as CounterpartiesPayload, CounterpartySide } from "@/lib/api-v2";
import { counterpartiesKey } from "@/lib/query-keys";
import { Counterparties } from "./Counterparties";

function payload(overrides: Partial<CounterpartiesPayload> = {}): CounterpartiesPayload {
  return {
    company_id: "COMP_0001",
    group_id: "GROUP_0001",
    as_of: "2026-08",
    side: "ap",
    sort: "weight",
    currency: "EUR",
    summary: {
      month: "2026-08",
      n_counterparties: 3,
      total_amount: 1000,
      top1_weight: 0.8,
      effective_counterparties: 1.5,
      hhi: 0.68,
      days_late_w: 12.6,
      pct_late: 0.26,
      overdue_total: 150,
      eur_share: 1,
    },
    items: [
      {
        counterparty_id: "COUNTERPARTY_09820",
        amount_12m: 800,
        weight: 0.8,
        n_invoices: 10,
        days_late_w: 2,
        pct_late: 0.1,
        overdue_total: 100,
        overdue_0_30: 100,
        overdue_31_60: 0,
        overdue_61_90: 0,
        overdue_90_plus: 0,
        sparkline_12: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      },
      {
        counterparty_id: "COUNTERPARTY_08037",
        amount_12m: 200,
        weight: 0.2,
        n_invoices: 4,
        // Sin ninguna factura pagada en ventana: no hay desvío medido.
        days_late_w: null,
        pct_late: null,
        overdue_total: 50,
        overdue_0_30: 0,
        overdue_31_60: 0,
        overdue_61_90: 0,
        overdue_90_plus: 50,
        sparkline_12: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    ],
    ...overrides,
  };
}

function renderBlock(side: CounterpartySide, data: CounterpartiesPayload, sort = "weight") {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(counterpartiesKey("COMP_0001", side, sort), data);
  return render(
    <QueryClientProvider client={client}>
      <Counterparties companyId="COMP_0001" side={side} />
    </QueryClientProvider>,
  );
}

describe("Counterparties", () => {
  it("names each side in its own vocabulary instead of a generic label", () => {
    renderBlock("ap", payload());
    expect(screen.getByRole("heading", { name: "Proveedores" })).toBeInTheDocument();

    renderBlock("ar", payload({ side: "ar" }));
    expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument();
  });

  it("leads with the two figures that say how dependent the company is", () => {
    renderBlock("ap", payload());

    expect(screen.getByText("Peso de la mayor")).toBeInTheDocument();
    expect(screen.getByText("Contrapartes efectivas")).toBeInTheDocument();
    // El 80 % sale dos veces a proposito: como cifra de cabecera y en la fila de
    // esa contraparte. Que el peso de la mayor y el de la primera fila coincidan
    // es la propiedad, no una duplicidad.
    expect(screen.getAllByText("80,0 %")).toHaveLength(2);
  });

  it("writes a share without a sign, because a share is not a change", () => {
    renderBlock("ap", payload({ summary: { ...payload().summary, top1_weight: 0.634 } }));

    expect(screen.getByText("63,4 %")).toBeInTheDocument();
    expect(screen.queryByText("+63,4 %")).not.toBeInTheDocument();
  });

  it("says how many counterparties the concentration is effectively spread over", () => {
    renderBlock("ap", payload());

    expect(screen.getByText("Contrapartes efectivas")).toBeInTheDocument();
    expect(screen.getByText("1,5")).toBeInTheDocument();
  });

  it("shows a counterparty without measured days as empty, never as zero", () => {
    renderBlock("ap", payload());

    const row = screen.getByRole("row", { name: /CP 08037/ });
    // Un 0 aquí afirmaría puntualidad que nadie ha medido.
    expect(row).toHaveTextContent("—");
    expect(row).not.toHaveTextContent("0 d");
  });

  it("marks lateness with its sign and keeps the 12 month trend", () => {
    renderBlock("ap", payload());

    const row = screen.getByRole("row", { name: /CP 09820/ });
    expect(row).toHaveTextContent("+2 d");
  });

  it("says how many are not shown instead of silently truncating", () => {
    const many = payload({
      summary: { ...payload().summary, n_counterparties: 41 },
    });
    renderBlock("ap", many);

    expect(screen.getByText(/y 39 proveedores más/)).toBeInTheDocument();
    expect(screen.getByText(/41 proveedores en 12 m/)).toBeInTheDocument();
  });

  it("states the euro coverage when part of the book is left out", () => {
    renderBlock("ap", payload({ summary: { ...payload().summary, eur_share: 0.75 } }));

    // Sin esta frase la pantalla afirmaría enseñar el libro entero.
    expect(screen.getByText(/75,0 % del importe en euros/)).toBeInTheDocument();
  });

  it("offers ordering by weight or by deterioration", async () => {
    renderBlock("ap", payload());

    const deterioration = screen.getByRole("radio", { name: "Deterioro" });
    expect(screen.getByRole("radio", { name: "Peso" })).toBeInTheDocument();
    await userEvent.click(deterioration);
  });

  it("renders the empty state of its own side rather than an empty table", () => {
    renderBlock("ar", payload({
      side: "ar",
      items: [],
      summary: { ...payload().summary, n_counterparties: 0, top1_weight: null },
    }));

    expect(screen.getByText("Sin clientes en euros en la ventana")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
