import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Entity, LayoutItem } from "@/dashboard/types";
import { companyFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { ScoreCard } from "./ScoreCard";

function itemWith(entities: Entity[]): LayoutItem {
  return {
    i: "w2",
    type: "score-card",
    x: 16,
    y: 0,
    w: 8,
    h: 8,
    entities,
    linkGroup: "green",
  };
}

function renderCard(entities: Entity[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ScoreCard item={itemWith(entities)} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ARGA: Entity = { kind: "company", id: "COMP_0001", name: "Distribuciones Arga S.L." };

describe("Tarjeta de score", () => {
  it('shows score, delta with sign color, regime and sparkline', async () => {
    mockApi([{ match: "/api/v2/companies/COMP_0001", body: companyFixture }]);

    const { container } = renderCard([ARGA]);

    expect(await screen.findByText("74")).toHaveClass("font-mono", "tabular-nums");
    expect(screen.getByText("Distribuciones Arga S.L.")).toBeInTheDocument();
    expect(screen.getByText("COMP_0001")).toBeInTheDocument();
    // El signo se lee por color, no por el texto del hex.
    expect(screen.getByText(/\+2,4/)).toHaveClass("text-positive");
    expect(screen.getByText("Mejorando")).toHaveClass("text-positive");
    expect(screen.getByText("Banda B · Sana")).toBeInTheDocument();
    // La sparkline de los 12 meses: 12 puntos en la polilínea.
    const polyline = container.querySelector("svg polyline");
    expect(polyline?.getAttribute("points")?.split(" ")).toHaveLength(12);
  });

  it('error state on 404', async () => {
    mockApi([
      {
        match: "/api/v2/companies/COMP_0001",
        body: { status: "not_found", message: "Sin ficha" },
        status: 404,
      },
    ]);

    renderCard([ARGA]);

    expect(await screen.findByText("No hay ficha para COMP_0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("pide elegir empresa cuando el vínculo no ha fijado ninguna", () => {
    mockApi([{ match: "/api/v2/companies", body: companyFixture }]);

    renderCard([]);

    expect(screen.getByText("Sin empresa seleccionada")).toBeInTheDocument();
    expect(screen.getByText("Elige una en la cabecera del widget.")).toBeInTheDocument();
    // Sin entidad no se rellena con un cero.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
