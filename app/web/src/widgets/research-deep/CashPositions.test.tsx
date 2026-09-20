import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CompanyCash } from "@/lib/api-v2";
import { CashPositions, cashKey } from "@/widgets/research-deep/CashPositions";

/**
 * La caja real de `COMP_0169` medida en `md:hackspain_2026` (§W2.3 del informe):
 * seis productos en cinco bancos, 217.665,33 EUR de total, un producto en USD y
 * el Abanca `CHECKING_03` sin fila en `balances`.
 */
function payload(overrides: Partial<CompanyCash> = {}): CompanyCash {
  return {
    company_id: "COMP_0169",
    group_id: "GROUP_0090",
    as_of: "2026-09-01",
    summary: {
      n_products: 6,
      n_banks: 5,
      total_eur: 217665.33,
      by_currency: [
        { currency: "EUR", n_products: 5, total: 217665.33 },
        { currency: "USD", n_products: 1, total: 0 },
      ],
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
        product_id: "PRODUCT_06577",
        bank_name: "Paypal",
        label: "CHECKING_04",
        type: "checking",
        currency: "EUR",
        balance: 52330.56,
      },
      {
        product_id: "PRODUCT_07106",
        bank_name: "BBVA Net Cash Empresas",
        label: "CHECKING_05",
        type: "checking",
        currency: "EUR",
        balance: 11145.38,
      },
      {
        product_id: "PRODUCT_03123",
        bank_name: "Banco Santander Empresas",
        label: "CHECKING_02",
        type: "checking",
        currency: "EUR",
        balance: 7478.26,
      },
      {
        product_id: "PRODUCT_02408",
        bank_name: "Paypal",
        label: "CHECKING_01",
        type: "checking",
        currency: "USD",
        balance: 0,
      },
      {
        product_id: "PRODUCT_04411",
        bank_name: "Abanca Empresas",
        label: "CHECKING_03",
        type: "checking",
        currency: "EUR",
        // Sin fila en `balances`: no se sabe cuánto hay, que no es tener cero.
        balance: null,
      },
    ],
    ...overrides,
  };
}

function renderBlock(data: CompanyCash) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(cashKey(data.company_id), data);
  return render(
    <QueryClientProvider client={client}>
      <CashPositions companyId={data.company_id} />
    </QueryClientProvider>,
  );
}

/** Tolerante al espacio fino (U+2009) que meten los formatos de importe. */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

function rowOf(label: string): HTMLElement {
  const cell = screen.getByRole("rowheader", { name: label });
  const row = cell.closest("tr");
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

describe("XR-038 (W2.3): «Dónde está la caja»", () => {
  it("DADO COMP_0169 CUANDO se pinta ENTONCES seis productos en cinco bancos con banco, producto, tipo, moneda y saldo", () => {
    renderBlock(payload());

    const block = screen.getByRole("region", { name: "Dónde está la caja" });
    for (const header of ["Banco", "Producto", "Tipo", "Moneda", "Saldo"]) {
      expect(within(block).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    // Seis filas de datos más la de cabecera.
    expect(within(block).getAllByRole("row")).toHaveLength(7);

    const bankinter = rowOf("Bankinter Empresas");
    expect(within(bankinter).getByText("CHECKING_06")).toBeInTheDocument();
    expect(within(bankinter).getByText("Cuenta corriente")).toBeInTheDocument();
    expect(within(bankinter).getByText("146.711,13")).toBeInTheDocument();

    expect(block).toHaveTextContent(loose("6 productos en 5 bancos"));
    expect(block).toHaveTextContent(loose("saldos a 01/09/2026"));
  });

  it("DADO las dos cifras de cabecera CUANDO se leen ENTONCES saldo total en euros y número de bancos", () => {
    renderBlock(payload());

    const block = screen.getByRole("region", { name: "Dónde está la caja" });
    const total = within(block).getByText("Saldo total en euros").parentElement;
    expect(total).toHaveTextContent(loose("EUR 217.665,33"));
    const banks = within(block).getByText("Bancos").parentElement;
    expect(banks).toHaveTextContent("5");
  });

  it("DADO `balances.available` vacía en las 7.996 filas CUANDO se pinta la tabla ENTONCES no hay columna «Disponible»", () => {
    renderBlock(payload());

    const block = screen.getByRole("region", { name: "Dónde está la caja" });
    expect(within(block).queryByRole("columnheader", { name: /Disponible/i })).toBeNull();
    expect(block).not.toHaveTextContent(/Disponible/i);
  });

  it("DADO EUR y USD sin tabla de cambio CUANDO se totaliza ENTONCES solo euros, y las demás monedas aparte y sin sumar", () => {
    renderBlock(payload());

    const block = screen.getByRole("region", { name: "Dónde está la caja" });
    // 217.665,33 es el total EUR: ni una cifra que mezcle EUR con USD.
    expect(block).toHaveTextContent(loose("EUR 217.665,33"));
    expect(block).toHaveTextContent(loose("Otras monedas, sin convertir"));
    expect(block).toHaveTextContent(loose("USD 0,00 (1 producto)"));

    // Una sola fila en USD: el resto son euros y ninguna cifra los junta.
    expect(within(block).getAllByText("USD")).toHaveLength(1);
    expect(within(block).getAllByText("EUR")).toHaveLength(5);
  });

  it("DADO un producto sin fila en `balances` CUANDO se pinta su saldo ENTONCES «—» y nunca 0,00", () => {
    renderBlock(payload());

    const abanca = rowOf("Abanca Empresas");
    expect(within(abanca).getByText("—")).toBeInTheDocument();
    expect(within(abanca).queryByText("0,00")).toBeNull();
    expect(within(abanca).getByTitle("Este producto no tiene saldo publicado")).toBeInTheDocument();
  });

  it("DADO un tipo de producto que el front no conoce CUANDO se pinta ENTONCES se humaniza y la tabla sigue en pie", () => {
    const data = payload();
    renderBlock({
      ...data,
      summary: { ...data.summary, n_products: 1, n_banks: 1 },
      items: [{ ...data.items[0], type: "green_deposit" }],
    });

    expect(screen.getByText("green deposit")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Bankinter Empresas" })).toBeInTheDocument();
  });

  it("DADO una sociedad sin producto bancario CUANDO se pinta ENTONCES lo dice y no monta una tabla vacía", () => {
    const data = payload();
    renderBlock({
      ...data,
      as_of: null,
      summary: { n_products: 0, n_banks: 0, total_eur: null, by_currency: [] },
      items: [],
    });

    expect(screen.getByText("Sin productos bancarios registrados")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
