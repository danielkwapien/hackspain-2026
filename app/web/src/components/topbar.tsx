/**
 * Topbar: marca, pestañas de tablero, buscador global y, a la derecha, indicador
 * de dato simulado, «Añadir widget» y avatar. Sin chips: el fondo es transparente
 * para que el orbe se vea a través (Trade Republic: `header.pageHeader` 60 px,
 * padding 16, sin borde).
 *
 * El buscador escribe directamente en el store de selección: el panel Empresas
 * lo lee de ahí y reescribe su consulta. Nada anima al teclear.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { AddWidgetButton } from "@/components/AddWidgetButton";
import { DashboardTabs } from "@/components/DashboardTabs";
import { setSearch, useSelection } from "@/dashboard/selection";
import { getMeta } from "@/lib/api-v2";

/** Inicial del avatar: todavía no hay modelo de usuario, la marca hace de perfil. */
const AVATAR_INITIAL = "X";

const GLASS_CLASS =
  "bg-surface-glass shadow-[inset_0_0_0_1px_var(--border-glass)] backdrop-blur-[var(--blur-glass)]";

/** `2026-08` -> `08/2026`. */
function formatCutoff(month: string | undefined): string {
  if (!month) return "";
  const [year, value] = month.split("-");
  if (!year || !value) return "";
  return ` · corte ${value}/${year}`;
}

function MockIndicator(): ReactElement | null {
  const meta = useQuery({ queryKey: ["meta"], queryFn: getMeta });

  // Mientras la meta carga o falla no se afirma nada sobre el origen del dato.
  if (!meta.data || meta.data.data_kind !== "mock") return null;

  return (
    <span
      role="status"
      className="shrink-0 font-mono text-[length:var(--text-micro)] tabular-nums text-content-secondary"
    >
      Mock v1{formatCutoff(meta.data.months.at(-1))}
    </span>
  );
}

export function Topbar(): ReactElement {
  const search = useSelection((state) => state.search);

  return (
    <header
      role="banner"
      className="flex shrink-0 items-center gap-4 px-4"
      style={{ height: "var(--size-topbar)" }}
    >
      <span className="shrink-0 text-sm font-semibold tracking-[0.1px] text-content-primary">
        X-Ray
      </span>

      <DashboardTabs />

      <div
        className={`flex w-80 max-w-full shrink items-center gap-2 rounded-[var(--radius-control)] px-2 focus-within:ring-1 focus-within:ring-ring ${GLASS_CLASS}`}
        style={{ height: "var(--size-input)" }}
      >
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-content-secondary" />
        <input
          type="text"
          aria-label="Buscar empresa"
          placeholder="Buscar empresa, grupo o id…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-full w-full bg-transparent text-[length:var(--text-control)] text-content-primary outline-none placeholder:text-content-secondary"
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <MockIndicator />
        <AddWidgetButton />
        <button
          type="button"
          aria-label="Menú de perfil"
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[length:var(--text-control)] font-semibold text-content-primary transition-[color,background-color,transform] duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover active:scale-[.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${GLASS_CLASS}`}
        >
          {AVATAR_INITIAL}
        </button>
      </div>
    </header>
  );
}
