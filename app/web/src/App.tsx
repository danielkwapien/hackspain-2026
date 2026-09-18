import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/states";
import { CompanyPage } from "@/routes/company";
import { MonitorPage } from "@/routes/monitor";
import { PortfolioPage } from "@/routes/portfolio";

/** Configuración de caché: los datos son un replay del dataset, no cambian entre peticiones. */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
      },
    },
  });
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<PortfolioPage />} />
        <Route path="companies/:companyId" element={<CompanyPage />} />
        <Route path="monitor" element={<MonitorPage />} />
        <Route
          path="*"
          element={
            <EmptyState
              title="Página no encontrada"
              description="La dirección solicitada no corresponde a ninguna pantalla del dashboard."
            />
          }
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
