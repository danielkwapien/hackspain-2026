import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { companyResponseFixture, manifestFixture } from "@/test/fixtures";
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
});
