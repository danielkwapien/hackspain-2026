import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import {
  companyResponseFixture,
  invoiceGapResponseFixture,
  manifestFixture,
} from "@/test/fixtures";
import { mockApi, renderRoute } from "@/test/helpers";

describe("Detalle de sociedad", () => {
  it("muestra el motor pendiente de cálculo sin cifras y los estados sin datos", async () => {
    mockApi([
      { match: "/api/v1/manifest", body: manifestFixture },
      { match: "/api/v1/companies/COMP_0001", body: companyResponseFixture },
    ]);

    renderRoute("/companies/COMP_0001");

    expect(await screen.findByText("Pendiente de cálculo")).toBeInTheDocument();
    expect(screen.getByText("Score y trayectoria")).toBeInTheDocument();
    // Sin resultados del motor no existe la ficha numérica del score.
    expect(screen.queryByText("Score")).not.toBeInTheDocument();
    expect(screen.getByText(/Contribuciones por señal/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GROUP_0147" })).toHaveAttribute(
      "href",
      "/?group=GROUP_0147",
    );
    // Datos observados sí presentes, con el mes parcial anotado.
    expect(screen.getByText(/mes parcial del corte/)).toBeInTheDocument();
    // Secciones sin datos suficientes.
    expect(
      screen.getByText("Sin productos de deuda registrados para esta sociedad."),
    ).toBeInTheDocument();
  });

  it("conserva meses y monedas que solo existen en facturas y no compara ventanas desiguales", async () => {
    mockApi([
      { match: "/api/v1/manifest", body: manifestFixture },
      { match: "/api/v1/companies/COMP_0005", body: invoiceGapResponseFixture },
    ]);

    renderRoute("/companies/COMP_0005");

    // El GBP solo aparece en facturas: debe seguir siendo seleccionable y visible.
    expect(await screen.findByRole("button", { name: "GBP" })).toBeInTheDocument();
    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
    // 12 meses actuales contra 1 mes de histórico anterior: sin variación.
    expect(screen.getByText(/no se calcula variación/)).toBeInTheDocument();
  });
});
