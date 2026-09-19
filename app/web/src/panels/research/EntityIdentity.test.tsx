import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { EntityProfile } from "@/lib/api-v2";
import { EntityIdentity } from "@/panels/research/EntityIdentity";
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

async function renderIdentity(profile: EntityProfile): Promise<void> {
  mockApi([{ match: "/profile", body: profile }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <EntityIdentity id={profile.entity_id} />
    </QueryClientProvider>,
  );
  await screen.findByText(profile.entity_id);
}

describe("EntityIdentity", () => {
  it("enseña el identificador junto a la industria y el país", async () => {
    await renderIdentity(PROFILE);
    expect(screen.getByText("COMP_0001")).toBeInTheDocument();
    expect(screen.getByText(/Servicios profesionales/)).toBeInTheDocument();
    expect(screen.getByText(/España/)).toBeInTheDocument();
    cleanup();
  });

  it("marca solo los campos inferidos", async () => {
    await renderIdentity(PROFILE);
    // La industria se infiere y el país es real: una sola marca.
    expect(screen.getAllByText("dato inferido", { exact: false })).toHaveLength(1);
    cleanup();
  });

  it("marca los dos cuando también el país es inferido", async () => {
    await renderIdentity({ ...PROFILE, country: "Francia", country_method: "inferred" });
    expect(screen.getAllByText("dato inferido", { exact: false })).toHaveLength(2);
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
});
