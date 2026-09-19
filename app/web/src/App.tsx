import { Suspense, lazy, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/states";
import { loadFromStorage } from "@/dashboard/store";
import { CompanyPage } from "@/routes/company";
import { DashboardPage } from "@/routes/dashboard";
import { MonitorPage } from "@/routes/monitor";
import { PortfolioPage } from "@/routes/portfolio";
import "@/widgets/register-all";
import { getWidget } from "@/widgets/registry";

/* Arranque: con el catálogo ya poblado, los tableros persistidos se cargan
   descartando los widgets de tipo desconocido. */
loadFromStorage((type) => getWidget(type) !== undefined);

/**
 * Playground de tokens: carga perezosa bajo la guarda de desarrollo. En producción
 * la condición se pliega a `null` y el `import()` desaparece, así que ni el módulo
 * ni la hoja en crudo que lee (`index.css?raw`) llegan al bundle.
 */
const TokensPage = import.meta.env.DEV
  ? lazy(() => import("@/routes/tokens").then((module) => ({ default: module.TokensPage })))
  : null;

/** Prototipo de fondo de XR-030: misma guarda que el playground de tokens. */
const BackgroundPrototypePage = import.meta.env.DEV
  ? lazy(() =>
      import("@/routes/prototypes/background").then((module) => ({
        default: module.BackgroundPrototypePage,
      })),
    )
  : null;

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
        <Route index element={<DashboardPage />} />
        <Route path="portfolio" element={<PortfolioPage />} />
        {/* `companies/:companyId` es la dirección histórica; `company/:companyId` la del tablero. */}
        <Route path="company/:companyId" element={<CompanyPage />} />
        <Route path="companies/:companyId" element={<CompanyPage />} />
        <Route path="monitor" element={<MonitorPage />} />
        {/* Playground del sistema de tokens: pantalla de desarrollo, no de producto. */}
        {import.meta.env.DEV && TokensPage ? (
          <Route
            path="tokens"
            element={
              <Suspense fallback={null}>
                <TokensPage />
              </Suspense>
            }
          />
        ) : null}
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
      {/* Prototipo de fondo: página completa con su propia topbar, fuera del marco de producto. */}
      {import.meta.env.DEV && BackgroundPrototypePage ? (
        <Route
          path="prototypes/background"
          element={
            <Suspense fallback={null}>
              <BackgroundPrototypePage />
            </Suspense>
          }
        />
      ) : null}
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
