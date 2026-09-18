import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router";
import { cn } from "cn";
import { getManifest } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";

const NAV_ITEMS = [
  { to: "/", label: "Cartera", end: true },
  { to: "/monitor", label: "Monitor", end: false },
];

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
    isActive
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
  );
}

/** Marco común: identidad del dataset, navegación y los dos avisos fijos. */
export function AppShell() {
  const manifest = useQuery({ queryKey: ["manifest"], queryFn: getManifest });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
          <NavLink to="/" className="text-sm font-semibold tracking-tight">
            Salud financiera y tesorería
          </NavLink>
          <nav aria-label="Secciones" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {manifest.isPending ? <span>Cargando contexto del dataset</span> : null}
            {manifest.isError ? <span>Contexto del dataset no disponible</span> : null}
            {manifest.data ? (
              <>
                <span>
                  Corte de datos{" "}
                  <span className="num text-foreground">
                    {formatDate(manifest.data.cutoff_date)}
                  </span>
                </span>
                <span>
                  Dataset{" "}
                  <span className="num text-foreground">{manifest.data.dataset_version}</span>
                </span>
                <span>
                  Generado{" "}
                  <span className="num text-foreground">
                    {formatDateTime(manifest.data.generated_at)}
                  </span>
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-2 px-4 pb-2 text-xs">
          <span className="rounded-sm border border-warning/40 bg-warning/10 px-2 py-0.5 text-warning">
            Replay del dataset — no es monitorización bancaria en vivo
          </span>
          <span className="rounded-sm border border-border bg-secondary px-2 py-0.5 text-muted-foreground">
            Score pendiente de cálculo (motor analítico en construcción)
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1700px] px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
