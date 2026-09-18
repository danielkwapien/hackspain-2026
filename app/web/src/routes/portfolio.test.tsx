import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { companyListResponse, manifestFixture } from "@/test/fixtures";
import { mockApi, renderRoute } from "@/test/helpers";

const baseRoutes = [
  { match: "/api/v1/manifest", body: manifestFixture },
  { match: "/api/v1/groups", body: [] },
];

describe("Cartera", () => {
  it("lista sociedades con cobertura, caja por moneda y score pendiente", async () => {
    mockApi([
      ...baseRoutes,
      { match: "/api/v1/companies", body: companyListResponse },
    ]);

    renderRoute("/");

    expect(await screen.findByText("COMP_0001")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "COMP_0001" })).toHaveAttribute(
      "href",
      "/companies/COMP_0001",
    );
    expect(screen.getByText(/32\.477,26/)).toBeInTheDocument();
    expect(screen.getByText(/9\.120,50/)).toBeInTheDocument();
    expect(screen.getAllByText("Pendiente")).toHaveLength(2);
    expect(screen.getByText("9/25")).toBeInTheDocument();
    expect(
      screen.getByText("Mostrando 1 a 2 de 2 sociedades"),
    ).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando ningún filtro devuelve sociedades", async () => {
    mockApi([
      ...baseRoutes,
      {
        match: "/api/v1/companies",
        body: { items: [], total: 0, offset: 0, limit: 50, engine_status: "pending_engine" },
      },
    ]);

    renderRoute("/");

    expect(await screen.findByText("Sin sociedades para estos filtros")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
