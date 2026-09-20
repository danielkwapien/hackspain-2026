import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CompanyDebt } from "@/lib/api-v2";
import { DebtPositions, debtKey } from "@/widgets/research-deep/DebtPositions";

/**
 * Cuatro de los diez productos de `COMP_0169` medidos en `md:hackspain_2026`, en
 * magnitud. En origen `LINEOFCREDIT_03` trae `granted −300.000` y `outstanding
 * +33.342,18`, y `LOAN_05` `granted −169.421,89` y `outstanding −148.346,80`:
 * los signos están mezclados y por eso la API sirve `abs()`.
 */
function payload(overrides: Partial<CompanyDebt> = {}): CompanyDebt {
  return {
    company_id: "COMP_0169",
    group_id: "GROUP_0090",
    summary: { n_products: 4, n_banks: 3, currencies: ["EUR"] },
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
      {
        product_id: "PRODUCT_08132",
        label: "LOAN_05",
        type: "loan",
        bank_name: "Caixabank Empresas",
        currency: "EUR",
        granted_abs: 169421.89,
        outstanding_abs: 148346.8,
      },
      {
        product_id: "PRODUCT_05012",
        label: "LINEOFCREDIT_03",
        type: "lineofcredit",
        bank_name: "Caixabank Empresas",
        currency: "EUR",
        granted_abs: 300000,
        outstanding_abs: 33342.18,
      },
      {
        product_id: "PRODUCT_06526",
        label: "GUARANTEE_01",
        type: "guarantee",
        bank_name: "Banco Santander Empresas",
        currency: "EUR",
        granted_abs: 96666.77,
        // 743 de 2.239 filas traen `outstanding` a cero y algunas sin valor.
        outstanding_abs: null,
      },
    ],
    ...overrides,
  };
}

function renderBlock(data: CompanyDebt) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(debtKey(data.company_id), data);
  return render(
    <QueryClientProvider client={client}>
      <DebtPositions companyId={data.company_id} />
    </QueryClientProvider>,
  );
}

function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

function rowOf(label: string): HTMLElement {
  const cell = screen.getByRole("rowheader", { name: label });
  const row = cell.closest("tr");
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

describe("XR-038 (W2.3): «Posiciones de financiación»", () => {
  it("DADO productos de deuda CUANDO se pintan ENTONCES producto, tipo, banco, moneda, concedido y saldo vivo", () => {
    renderBlock(payload());

    const block = screen.getByRole("region", { name: "Posiciones de financiación" });
    for (const header of ["Producto", "Tipo", "Banco", "Moneda", "Concedido", "Saldo vivo"]) {
      expect(within(block).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    const line = rowOf("LINEOFCREDIT_03");
    expect(within(line).getByText("Línea de crédito")).toBeInTheDocument();
    expect(within(line).getByText("Caixabank Empresas")).toBeInTheDocument();
    expect(within(line).getByText("300.000,00")).toBeInTheDocument();
    expect(within(line).getByText("33.342,18")).toBeInTheDocument();

    expect(block).toHaveTextContent(loose("4 productos en 3 bancos"));
  });

  it("DADO los signos mezclados en origen CUANDO se enseñan los importes ENTONCES magnitudes, sin ningún signo negativo", () => {
    renderBlock(payload());

    const block = screen.getByRole("region", { name: "Posiciones de financiación" });
    // `LOAN_05` viene de `granted −169.421,89` / `outstanding −148.346,80`.
    const loan = rowOf("LOAN_05");
    expect(within(loan).getByText("169.421,89")).toBeInTheDocument();
    expect(within(loan).getByText("148.346,80")).toBeInTheDocument();
    expect(block.textContent ?? "").not.toMatch(/[-−]\d/);
  });

  it("DADO que `outstanding/granted` no significa nada CUANDO se lee la tabla ENTONCES no hay ninguna utilización ni porcentaje", () => {
    renderBlock(payload());

    // La tabla, no el pie: el pie dice precisamente que de aquí no sale una
    // utilización, y esa frase es parte del arreglo.
    const table = screen.getByRole("table");
    expect(table).not.toHaveTextContent(/utilizaci[oó]n/i);
    expect(table).not.toHaveTextContent(/uso de l[ií]nea/i);
    // Ni un porcentaje: 33.342,18 sobre 300.000 daría un 11 % sin significado.
    expect(table.textContent ?? "").not.toMatch(/%/);
  });

  it("DADO las dos columnas de importe CUANDO se leen sus encabezados ENTONCES dicen qué magnitud son", () => {
    renderBlock(payload());

    const block = screen.getByRole("region", { name: "Posiciones de financiación" });
    expect(within(block).getByRole("columnheader", { name: "Concedido" })).toHaveAttribute(
      "title",
      "Límite concedido por el banco, en magnitud",
    );
    expect(within(block).getByRole("columnheader", { name: "Saldo vivo" })).toHaveAttribute(
      "title",
      "Importe dispuesto pendiente de devolver, en magnitud",
    );
    expect(block).toHaveTextContent(loose("los dos en magnitud"));
  });

  it("DADO un saldo vivo ausente CUANDO se pinta ENTONCES «—», nunca 0,00", () => {
    renderBlock(payload());

    const guarantee = rowOf("GUARANTEE_01");
    expect(within(guarantee).getByText("—")).toBeInTheDocument();
    expect(within(guarantee).queryByText("0,00")).toBeNull();
  });

  it("DADO una de las 908 sociedades sin deuda CUANDO se pinta ENTONCES el estado vacío, nunca una tabla de ceros", () => {
    renderBlock({
      company_id: "COMP_0001",
      group_id: "GROUP_0001",
      summary: { n_products: 0, n_banks: 0, currencies: [] },
      items: [],
    });

    expect(screen.getByText("Sin productos de financiación registrados")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("0,00")).toBeNull();
  });

  it("DADO un tipo de deuda que el front no conoce CUANDO se pinta ENTONCES se humaniza y la tabla sigue en pie", () => {
    const data = payload();
    renderBlock({
      ...data,
      summary: { ...data.summary, n_products: 1, n_banks: 1 },
      items: [{ ...data.items[0], type: "green_loan" }],
    });

    expect(screen.getByText("green loan")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "LOAN_04" })).toBeInTheDocument();
  });
});
