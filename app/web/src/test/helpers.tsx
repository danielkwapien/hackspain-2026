import { afterEach, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "@/App";

export type MockRoute = {
  /** Fragmento de URL que identifica la petición (se evalúa en orden). */
  match: string;
  body: unknown;
  status?: number;
};

/**
 * Sustituye `fetch` por rutas simuladas. Las rutas se evalúan en orden: coloca
 * primero las más específicas (`/api/v1/companies/COMP_0001` antes que
 * `/api/v1/companies`).
 */
export function mockApi(routes: MockRoute[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find((candidate) => url.includes(candidate.match));
    if (!route) {
      return new Response(
        JSON.stringify({ status: "not_found", message: `Sin ruta simulada para ${url}` }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Renderiza las rutas reales de la aplicación dentro de un router en memoria. */
export function renderRoute(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
