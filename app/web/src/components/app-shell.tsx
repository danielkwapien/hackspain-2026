import type { ReactElement } from "react";
import { Outlet } from "react-router";
import { MockBanner } from "@/dashboard/MockBanner";
import { Topbar } from "@/dashboard/Topbar";

/** Marco común: topbar de espacios, aviso de dato simulado y la pantalla activa. */
export function AppShell(): ReactElement {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Topbar />
      <MockBanner />
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
