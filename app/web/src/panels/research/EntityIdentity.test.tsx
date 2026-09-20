import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { CompanyRow, EntityProfile, Regime } from "@/lib/api-v2";
import { EntityIdentity } from "@/panels/research/EntityIdentity";
import { companyFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";

const PROFILE: EntityProfile = {
  entity_id: "COMP_0001",
  entity_kind: "company",
  name: "Estudios Maresme S.L.",
  country: "España",
  country_method: "real",
  industry: "servicios profesionales",
  industry_method: "inferred",
  generated_at: "2026-09-19 20:58:12+02",
};

const MONEY_TITLE = "Cobros operativos de los últimos 12 meses";

/** Nombre del grupo tal como lo sirve `/groups/:id`, que es de donde sale. */
const GROUP_NAME = "Estudios Maresme Holding";

type Extra = {
  regime?: Regime | null;
  opIn12m?: number | null;
  currency?: string | null;
  opIn12mEur?: number | null;
};

/** La fila de `companies.csv` del corte, con lo que se quiera cambiar encima. */
function companyRow(patch: Partial<CompanyRow> = {}) {
  return { ...companyFixture, company: { ...companyFixture.company, ...patch } };
}

async function renderIdentity(
  profile: EntityProfile,
  extra: Extra = {},
  company: unknown = companyRow(),
): Promise<void> {
  mockApi([
    { match: "/profile", body: profile },
    { match: "/api/v2/companies/", body: company },
    { match: "/api/v2/groups/", body: { group: { name: GROUP_NAME } } },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <EntityIdentity id={profile.entity_id} {...extra} />
    </QueryClientProvider>,
  );
  await screen.findByText(profile.entity_id);
}

/** Las burbujas de la fila, en orden de lectura. El régimen no es una burbuja. */
function chips(): string[] {
  return screen
    .getAllByTestId("identity-chip")
    .map((chip) => chip.textContent?.replace(/ dato inferido$/u, "").trim() ?? "");
}

describe("EntityIdentity", () => {
  it("DADO una sociedad con ERP CUANDO se pinta ENTONCES seis insignias más el régimen, a 12 px y pegadas al título", async () => {
    // XR-038 (W1.1, criterio 1): a las tres de XR-037 se suman ERP, grupo e
    // historia. El grupo, porque es el único salto de navegación que la ficha no
    // ofrecía; la historia, porque es lo que hace creíble al score y está al 100 %.
    await renderIdentity(PROFILE, { regime: "recovering" });

    await waitFor(() => expect(chips()).toHaveLength(6));
    expect(chips()).toEqual([
      "COMP_0001",
      "Servicios profesionales",
      "España",
      "Business Central",
      GROUP_NAME,
      "24 m de historia",
    ]);
    // El camelCase crudo de `companies.erp` no se enseña nunca.
    expect(screen.queryByText(/businessCentral/)).toBeNull();

    // La cápsula no estrangula la letra: 12 px con `px-2.5 py-1`.
    for (const chip of screen.getAllByTestId("identity-chip")) {
      expect(chip.className).toContain("text-[length:var(--text-control)]");
      expect(chip.className).toContain("px-2.5");
      expect(chip.className).toContain("py-1");
    }

    // El régimen es el séptimo elemento, con su color y fuera del grupo de seis.
    const regime = screen.getByText("Recuperando");
    expect(regime.className).toContain("text-regime-recovering");
    expect(regime).not.toHaveAttribute("data-testid", "identity-chip");

    // Pegadas al título: la fila deja de respirar donde debería leerse como un
    // bloque único de identidad.
    const row = screen.getByTestId("identity-row");
    expect(row.className).toContain("gap-1");
    expect(row.className).not.toContain("gap-2");
  });

  it("DADO una sociedad sin ERP CUANDO se pinta ENTONCES cinco insignias, sin hueco ni «—»", async () => {
    // XR-038 (W1.1, criterio 2): `erp` es NULL en 541 de 1.286 (42 %). Si la
    // insignia se pintara vacía, la fila quedaría coja en cuatro de cada diez
    // fichas; y la fila de identidad no es un formulario, así que tampoco
    // «Sin ERP».
    await renderIdentity(PROFILE, {}, companyRow({ erp: null }));

    await waitFor(() => expect(chips()).toHaveLength(5));
    expect(chips()).toEqual([
      "COMP_0001",
      "Servicios profesionales",
      "España",
      GROUP_NAME,
      "24 m de historia",
    ]);
    expect(screen.queryByText("Sin ERP")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("enseña el identificador junto a la industria y el país", async () => {
    await renderIdentity(PROFILE);
    expect(screen.getByText("COMP_0001")).toBeInTheDocument();
    expect(screen.getByText(/Servicios profesionales/)).toBeInTheDocument();
    expect(screen.getByText(/España/)).toBeInTheDocument();
    cleanup();
  });

  it("DADO los tres campos ENTONCES cada uno va en su burbuja, no en texto corrido", async () => {
    // XR-037 (E8): la línea gris `COMP_0001 · Industria · País` pasa a burbujas.
    await renderIdentity(PROFILE);

    const chip = screen.getByText("COMP_0001");
    expect(chip.className).toContain("rounded-[var(--radius-pill)]");
    expect(chip.className).toContain("bg-surface-glass");
    expect(screen.getByText(/Servicios profesionales/).className).toContain(
      "rounded-[var(--radius-pill)]",
    );
    cleanup();
  });

  it("marca solo los campos inferidos, con el borde punteado en vez del asterisco", async () => {
    await renderIdentity(PROFILE);
    // La industria se infiere y el país es real: una sola marca.
    expect(screen.getAllByText("dato inferido", { exact: false })).toHaveLength(1);
    expect(screen.getByText(/Servicios profesionales/).className).toContain("border-dashed");
    expect(screen.getByText(/España/).className).not.toContain("border-dashed");
    cleanup();
  });

  it("marca los dos cuando también el país es inferido", async () => {
    await renderIdentity({ ...PROFILE, country: "Francia", country_method: "inferred" });
    expect(screen.getAllByText("dato inferido", { exact: false })).toHaveLength(2);
    cleanup();
  });

  it("DADO un régimen ENTONCES lo escribe con su color, que es lo que la gráfica dejó de decir", async () => {
    // XR-037 (E9, punto 2 de «Cuidado con»): compensación obligatoria de la línea
    // del score, que ya no cambia de color por tramos de régimen.
    await renderIdentity(PROFILE, { regime: "recovering" });
    expect(screen.getByText("Recuperando").className).toContain("text-regime-recovering");
    cleanup();

    await renderIdentity(PROFILE, { regime: "deteriorating" });
    expect(screen.getByText("Deteriorándose").className).toContain("text-regime-deteriorating");
    cleanup();
  });

  it("DADO la operativa 12 m ENTONCES va desnuda a la derecha, con su moneda y su title", async () => {
    // XR-037 (E8): sin el rótulo «Operativa», que lo explica el `title`.
    await renderIdentity(PROFILE, { opIn12m: 624002033, currency: "CLP" });

    const money = screen.getByTitle(MONEY_TITLE);
    expect(money).toHaveTextContent("624.002.033,00 CLP");
    expect(money.className).toContain("ml-auto");
    expect(screen.queryByText(/Operativa 12 m/)).toBeNull();
    cleanup();
  });

  it("DADO solo la consolidada ENTONCES la cifra va en EUR", async () => {
    await renderIdentity(PROFILE, { opIn12m: null, currency: null, opIn12mEur: 20339117.25 });
    expect(screen.getByTitle(MONEY_TITLE)).toHaveTextContent("20.339.117,25 EUR");
    cleanup();
  });

  it("no pinta nada cuando la fuente no publica identidad", () => {
    mockApi([{ match: "/profile", body: { error: "entity_not_found" }, status: 404 }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <EntityIdentity id="COMP_0001" />
      </QueryClientProvider>,
    );
    expect(container.textContent).toBe("");
    cleanup();
  });

  it("DADO un perfil que no llega ENTONCES el dinero y el régimen se siguen pintando", async () => {
    // La ficha no depende de la identidad: sin perfil no hay burbujas, pero la
    // operativa y el régimen no son suyos y no se pierden con ella.
    mockApi([{ match: "/profile", body: { error: "entity_not_found" }, status: 404 }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <EntityIdentity id="COMP_0001" regime="stable" opIn12m={1000} currency="EUR" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Estable")).toBeInTheDocument();
    expect(screen.getByTitle(MONEY_TITLE)).toHaveTextContent("1.000,00 EUR");
    expect(screen.queryByText("COMP_0001")).toBeNull();
    cleanup();
  });
});
