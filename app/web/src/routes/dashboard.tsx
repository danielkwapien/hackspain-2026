/**
 * La ruta `/`: el tablero activo sobre el lienzo. «Principal» va bloqueado (solo
 * se puede maximizar); los tableros de usuario se arrastran y redimensionan.
 * `key` remonta el lienzo al cambiar de tablero: maximizado y medida arrancan de
 * cero y los widgets entran escalonados otra vez.
 */

import type { ReactElement } from "react";
import { Grid } from "@/dashboard/Grid";
import { isMainDashboard, useActiveDashboard } from "@/dashboard/store";

export function DashboardPage(): ReactElement {
  const dashboard = useActiveDashboard();
  return (
    <Grid key={dashboard.id} dashboard={dashboard} locked={isMainDashboard(dashboard.id)} />
  );
}
