import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Counterparties as CounterpartiesPayload, Pillar } from "@/lib/api-v2";
import { companyFixture } from "@/test/fixtures/v2";
import { companySignalsKey, counterpartiesKey } from "@/lib/query-keys";
import { PillarSummary } from "./PillarSummary";

const SIGNALS = {
  company_id: "COMP_0001",
  as_of: "2026-08",
  pillars: [
    { pillar: "L", pillar_name: null, weight: 0.25, value: 0.4, signals: [] },
    { pillar: "P", pillar_name: null, weight: 0.2, value: 0.6, signals: [] },
    { pillar: "C", pillar_name: null, weight: 0.15, value: 0.3, signals: [] },
    { pillar: "D", pillar_name: null, weight: 0.2, value: 0.7, signals: [] },
    { pillar: "A", pillar_name: null, weight: 0.2, value: 0.5, signals: [] },
  ],
};

function counterparties(side: "ap" | "ar"): CounterpartiesPayload {
  return {
    company_id: "COMP_0001", group_id: "GROUP_0001", as_of: "2026-08",
    side, sort: "weight", currency: "EUR",
    summary: {
      month: "2026-08", n_counterparties: 1, total_amount: 100, top1_weight: 1,
      effective_counterparties: 1, hhi: 1, days_late_w: 3, pct_late: 0.5,
      overdue_total: 0, eur_share: 1,
    },
    items: [{
      counterparty_id: "COUNTERPARTY_00001", amount_12m: 100, weight: 1, n_invoices: 2,
      days_late_w: 3, pct_late: 0.5, overdue_total: 0, overdue_0_30: 0,
      overdue_31_60: 0, overdue_61_90: 0, overdue_90_plus: 0,
      sparkline_12: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    }],
  };
}

function renderFamily(family: Pillar) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const id = companyFixture.company.company_id;
  client.setQueryData(companySignalsKey(id), SIGNALS);
  client.setQueryData(counterpartiesKey(id, "ap", "weight"), counterparties("ap"));
  client.setQueryData(counterpartiesKey(id, "ar", "weight"), counterparties("ar"));
  return render(
    <QueryClientProvider client={client}>
      <PillarSummary company={companyFixture} family={family} />
    </QueryClientProvider>,
  );
}

describe("PillarSummary", () => {
  it("shows suppliers under Pago, because that pillar is what you owe", () => {
    renderFamily("P");

    expect(screen.getByRole("heading", { name: "Proveedores" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Clientes" })).not.toBeInTheDocument();
  });

  it("shows customers under Cobros, because that pillar is what you are owed", () => {
    renderFamily("C");

    expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Proveedores" })).not.toBeInTheDocument();
  });

  it.each(["L", "P", "C", "D", "A"] as const)(
    "drops the pillar summary line from the %s family body: no P, no effective weight, no coverage",
    (family) => {
      // XR-038 (W2.1): la linea era metadato de ingenieria en el cuerpo. La
      // cobertura de senales NO desaparece: se va al `title` del toggle de
      // familia, en `ResearchDeepWidget`.
      renderFamily(family);

      expect(screen.queryByText(/peso efectivo/)).not.toBeInTheDocument();
      expect(screen.queryByText(/señales disponibles/)).not.toBeInTheDocument();
      expect(screen.queryByText(/·\s*P\s*0,/)).not.toBeInTheDocument();
    },
  );

  it.each(["L", "D", "A"] as const)(
    "leaves the %s tab exactly as it was: no counterparty book explains it",
    (family) => {
      renderFamily(family);

      expect(screen.queryByRole("heading", { name: "Proveedores" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Clientes" })).not.toBeInTheDocument();
    },
  );
});
