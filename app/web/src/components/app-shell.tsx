import type { ReactElement } from "react";
import { Outlet } from "react-router";
import { MockBanner } from "@/dashboard/MockBanner";
import { Topbar } from "@/dashboard/Topbar";

/**
 * Marco común: topbar de espacios, aviso de dato simulado y la pantalla activa.
 *
 * El marco es una columna de la altura exacta de la ventana y sin desbordamiento:
 * la página nunca scrollea. Si lo hiciera, la barra de scroll del navegador
 * robaría ~15 px de ancho y la rejilla de 24 columnas del lienzo mediría corto.
 * El scroll vive en `<main>`, que es quien lo necesita para las pantallas largas
 * (`/portfolio`, `/company/:id`, `/monitor`); el lienzo ocupa `main` entero y
 * scrollea por su cuenta cuando los widgets no caben.
 *
 * La altura del banner de mock no se resta con un `calc`: aparece y desaparece
 * según `data_kind` y es el flex quien reparte lo que quede.
 */
export function AppShell(): ReactElement {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <Topbar />
      <MockBanner />
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
