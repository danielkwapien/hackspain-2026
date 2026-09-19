import type { ReactElement } from "react";
import { Outlet } from "react-router";
import { Background } from "@/components/Background";
import { Topbar } from "@/components/topbar";

/**
 * Marco común: capa de fondo con el orbe, topbar y la pantalla activa.
 *
 * El marco es una columna de la altura exacta de la ventana y sin desbordamiento:
 * la página nunca scrollea. Si lo hiciera, la barra de scroll del navegador
 * robaría ~15 px de ancho y la rejilla de paneles mediría corto. El scroll vive
 * en `<main>`, que es quien lo necesita para las pantallas largas (`/portfolio`,
 * `/company/:id`, `/monitor`); la página de paneles ocupa `main` entero y cada
 * panel scrollea por su cuenta.
 *
 * El fondo lo pinta `body` (`--background`), no este `div`: el orbe va en una capa
 * fija con `z-index: -1` y un fondo aquí lo taparía.
 */
export function AppShell(): ReactElement {
  return (
    <div className="flex h-dvh flex-col overflow-hidden text-foreground">
      <Background />
      <Topbar />
      <main className="relative min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
