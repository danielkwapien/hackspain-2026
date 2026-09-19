/**
 * La ruta `/`: el tablero activo sobre el lienzo. Los fijos («Empresa» e
 * «Investigación») van bloqueados (solo se puede maximizar); los tableros de
 * usuario se arrastran y redimensionan. `key` remonta el lienzo al cambiar de
 * tablero: maximizado y medida arrancan de cero y los widgets entran
 * escalonados otra vez.
 */

import type { ReactElement } from "react";
import { Grid } from "@/dashboard/Grid";
import { isFixedDashboard } from "@/dashboard/fixed";
import { useActiveDashboard } from "@/dashboard/store";

export function DashboardPage(): ReactElement {
  const dashboard = useActiveDashboard();
  return (
    <Grid key={dashboard.id} dashboard={dashboard} locked={isFixedDashboard(dashboard.id)} />
  );
}
