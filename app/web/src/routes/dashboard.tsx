import type { ReactElement } from "react";
import { Canvas } from "@/dashboard/Canvas";

/** La ruta `/`: el tablero de widgets y nada más. */
export function DashboardPage(): ReactElement {
  return <Canvas />;
}
