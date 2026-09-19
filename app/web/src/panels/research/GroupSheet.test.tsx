/**
 * La ficha de grupo con la misma anatomía que la de empresa (XR-037, E8 y E15): el
 * dinero consolidado a la derecha de la fila de identidad, el régimen escrito con su
 * color y las fortalezas como «Conclusión» delante de las cifras del grupo.
 */

import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AS_OF, groupExample, monthsEndingAt } from "@/test/examples";
import { mockApi } from "@/test/helpers";
import { GroupSheet } from "@/panels/research/GroupSheet";

const ID = groupExample.group.group_id; // GROUP_0095
const ROUTE = `/api/v2/groups/${ID}`;
const PROFILE_ROUTE = `/api/v2/entities/${ID}/profile`;

const MONTHS = monthsEndingAt(AS_OF, 24);

const group = {
  ...groupExample,
  score: 69.7,
  confidence: 0.977,
  regime: "improving",
  op_in_12m: null,
  op_in_12m_currency: null,
  op_in_12m_eur: 16741699.08,
  strength_flags: ["PAYS_ON_TIME"],
  timeline: MONTHS.map((month, index) => ({
    ...groupExample.timeline[0],
    month,
    score: 60 + index * 0.4,
    delta_1m: index === 0 ? null : 0.4,
    dispersion: 39.3,
    n_companies_scored: 12,
  })),
};

const profile = {
  entity_id: ID,
  kind: "group",
  name: groupExample.group.name,
  country: "España",
  country_method: "declared",
  industry: null,
  industry_method: null,
};

function mockGroup(body: unknown = group) {
  return mockApi([
    { match: PROFILE_ROUTE, body: profile },
    { match: ROUTE, body },
  ]);
}

function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <GroupSheet id={ID} range="1A" onRange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Regex tolerante al espacio fino (U+2009) y a los saltos entre nodos. */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

describe("ficha de grupo", () => {
  it("DADO un grupo con operativa consolidada CUANDO carga ENTONCES el dinero va en la fila de identidad, sin la etiqueta «Operativa 12 m»", async () => {
    mockGroup();
    renderSheet();

    const money = await screen.findByTitle("Cobros operativos de los últimos 12 meses");
    expect(money).toHaveTextContent(loose("16.741.699,08 EUR"));
    // E8: la cifra se queda sola con su moneda, empujada a la derecha de la fila.
    expect(money.className).toContain("ml-auto");
    expect(screen.queryByText(/Operativa 12 m/)).toBeNull();

    // El régimen del grupo, escrito con su color como en la ficha de empresa.
    expect(screen.getByText("Mejorando")).toBeInTheDocument();

    // La fila de identidad es una sola: la burbuja del identificador y el dinero
    // viven en el mismo `p`, como en la ficha de empresa.
    const chip = await screen.findByText(ID);
    expect(chip.closest("p")).toBe(money.closest("p"));
  });

  it("DADO fortalezas del grupo CUANDO se pinta la fila ENTONCES «Conclusión» delante de las cuatro cifras del grupo", async () => {
    mockGroup();
    renderSheet();

    expect(await screen.findByText("Conclusión")).toBeInTheDocument();
    expect(screen.getByText("Paga a tiempo")).toBeInTheDocument();
    const dl = screen.getByText("Filiales puntuadas").closest("dl");
    expect(dl?.className).toContain("grid-cols-5");

    // El nombre de la filial no es una cifra: se queda en el cuerpo y el score baja a
    // la línea de debajo, que a 20 px se perdían los dos.
    const weakest = screen.getByText("Más débil").closest("div") as HTMLElement;
    const name = within(weakest).getByText(groupExample.weakest_company ?? "—", {
      exact: false,
    });
    expect(name.className).toContain("text-[length:var(--text-body)]");
  });

  it("DADO un grupo sin fortalezas CUANDO se pinta ENTONCES «Sin señales destacadas» y la fila con sus cuatro columnas", async () => {
    mockGroup({ ...group, strength_flags: [] });
    renderSheet();

    expect(await screen.findByText(/Sin señales destacadas/)).toBeInTheDocument();
    const dl = screen.getByText("Filiales puntuadas").closest("dl");
    expect(dl?.className).toContain("grid-cols-4");
  });
});
