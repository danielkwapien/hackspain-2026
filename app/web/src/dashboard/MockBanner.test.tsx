import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { metaFixture, realMetaFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import type { MetaV2 } from "@/lib/api-v2";
import { MockBanner } from "./MockBanner";
import { resetStore } from "./store";

function renderBanner(meta: MetaV2): QueryClient {
  mockApi([{ match: "/api/v2/meta", body: meta }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MockBanner />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("MockBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it('visible when meta.data_kind === "mock"', async () => {
    renderBanner(metaFixture);

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("Datos simulados (mock v1) · corte 08/2026");
  });

  it("hidden when the data is not mock", async () => {
    const client = renderBanner(realMetaFixture);

    // El banner solo puede faltar de verdad cuando la meta ya ha respondido.
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(client.getQueryData(["meta"])).toMatchObject({ data_kind: "real" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
