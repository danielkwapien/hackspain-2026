import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityRow, CompanyActivity } from "@/lib/api-v2";
import { RecentActivity, activityKey } from "@/widgets/research-deep/RecentActivity";

const LIMIT = 12;

/**
 * Movimientos de `COMP_0169` al corte, con la forma real: la cuota de línea de
 * crédito de Caixabank, dos de Paypal y los pagos de Santander. Más los tres
 * casos que condicionan el diseño: la categoría `-` (635.530 movimientos, la
 * mayor de todas), un producto ausente de los dos catálogos (1.314) y un
 * movimiento `pending`.
 */
function items(): ActivityRow[] {
  return [
    {
      transaction_id: "75a16e3e",
      date: "2026-08-01",
      category: "debt_repayment",
      bank_name: "Caixabank Empresas",
      product_label: "LINEOFCREDIT_03",
      amount: -3055.77,
      status: "booked",
    },
    {
      transaction_id: "956af041",
      date: "2026-07-31",
      category: "payment_refund",
      bank_name: "Paypal",
      product_label: "CHECKING_04",
      amount: 4.93,
      status: "booked",
    },
    {
      transaction_id: "059755208",
      date: "2026-07-31",
      category: "payment",
      bank_name: "Banco Santander Empresas",
      product_label: "CHECKING_02",
      amount: -157.47,
      status: "pending",
    },
    {
      transaction_id: "bdecb0434",
      date: "2026-07-30",
      // Un hueco, no una categoría: se etiqueta y NO se esconde.
      category: "-",
      bank_name: "Banco Santander Empresas",
      product_label: "CHECKING_02",
      amount: 1200,
      status: "booked",
    },
    {
      transaction_id: "09e991c9",
      date: "2026-07-29",
      category: "collection",
      // Producto fuera de los dos catálogos: la fila no se descarta.
      bank_name: null,
      product_label: null,
      amount: 980.5,
      status: null,
    },
  ];
}

function payload(overrides: Partial<CompanyActivity> = {}): CompanyActivity {
  return {
    company_id: "COMP_0169",
    group_id: "GROUP_0090",
    as_of: "2026-08-01",
    limit: LIMIT,
    items: items(),
    ...overrides,
  };
}

function renderBlock(data: CompanyActivity) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(activityKey(data.company_id, LIMIT), data);
  return render(
    <QueryClientProvider client={client}>
      <RecentActivity companyId={data.company_id} />
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

describe("XR-038 (W2.3): «Últimos movimientos»", () => {
  it("DADO movimientos al corte CUANDO se pintan ENTONCES fecha, categoría, banco · producto, importe y estado", () => {
    renderBlock(payload());

    const block = screen.getByRole("region", { name: "Últimos movimientos" });
    for (const header of ["Fecha", "Categoría", "Banco · producto", "Importe", "Estado"]) {
      expect(within(block).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    const repayment = rowOf("Cuota de deuda");
    expect(within(repayment).getByText("01/08/2026")).toBeInTheDocument();
    expect(within(repayment).getByText("Caixabank Empresas · LINEOFCREDIT_03")).toBeInTheDocument();
    expect(within(repayment).getByText("-3.055,77")).toBeInTheDocument();
    expect(within(repayment).getByText("Contabilizado")).toBeInTheDocument();

    expect(block).toHaveTextContent(loose("hasta el corte del 01/08/2026"));
  });

  it("DADO el 77,6 % de descripciones anonimizadas CUANDO se identifica el movimiento ENTONCES categoría + banco/producto, y ni un marcador en pantalla", () => {
    renderBlock(payload());

    const block = screen.getByRole("region", { name: "Últimos movimientos" });
    // La descripción no se pinta: ni «[NUM]», ni «[COMPANY]», ni ningún otro marcador.
    expect(block.textContent ?? "").not.toMatch(/\[(NUM|COMPANY|IBAN|PERSON|REF|TAXID|X)\]/);
    expect(within(block).queryByRole("columnheader", { name: /Descripci[oó]n|Concepto/i })).toBeNull();

    // Lo que identifica la fila es la categoría, y es su cabecera.
    expect(screen.getByRole("rowheader", { name: "Pago" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Cobro" })).toBeInTheDocument();
  });

  it("DADO la categoría `-` CUANDO se pinta ENTONCES «Sin clasificar» y la fila sigue en la tabla", () => {
    renderBlock(payload());

    const unclassified = rowOf("Sin clasificar");
    expect(within(unclassified).getByText("1.200,00")).toBeInTheDocument();
    // Cinco filas de datos: la mayor categoría del dataset no se esconde.
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it("DADO un producto ausente de los dos catálogos CUANDO se pinta su origen ENTONCES «—» y la fila NO se descarta", () => {
    renderBlock(payload());

    const orphan = rowOf("Cobro");
    // Celdas: fecha, origen, importe y estado (la categoría es la cabecera de fila).
    const [, origin] = within(orphan).getAllByRole("cell");
    expect(origin).toHaveTextContent("—");
    expect(within(orphan).getByText("980,50")).toBeInTheDocument();
  });

  it("DADO el signo del importe CUANDO se pinta ENTONCES entrada y salida no llevan el mismo tono", () => {
    renderBlock(payload());

    const entrada = within(rowOf("Sin clasificar")).getByText("1.200,00");
    const salida = within(rowOf("Cuota de deuda")).getByText("-3.055,77");
    expect(entrada).toHaveClass("text-content-positive");
    expect(salida).not.toHaveClass("text-content-positive");
  });

  it("DADO un estado ausente o desconocido CUANDO se pinta ENTONCES «—» o su código humanizado, nunca un estado inventado", () => {
    renderBlock(payload());

    expect(within(rowOf("Pago")).getByText("Pendiente")).toBeInTheDocument();
    const cells = within(rowOf("Cobro")).getAllByRole("cell");
    expect(cells.at(-1)).toHaveTextContent("—");
  });

  it("DADO una categoría que el front no conoce CUANDO se pinta ENTONCES se humaniza y la tabla sigue en pie", () => {
    // El dataset ya trae `cash_settlements` en plural junto a `cash_settlement`.
    renderBlock(payload({ items: [{ ...items()[0], category: "cash_settlements" }] }));

    expect(screen.getByRole("rowheader", { name: "cash settlements" })).toBeInTheDocument();
    expect(screen.getByText("Caixabank Empresas · LINEOFCREDIT_03")).toBeInTheDocument();
  });

  it("DADO una sociedad sin movimientos al corte CUANDO se pinta ENTONCES lo dice y no monta una tabla vacía", () => {
    renderBlock(payload({ items: [] }));

    expect(screen.getByText(loose("Sin movimientos registrados hasta el 01/08/2026"))).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
