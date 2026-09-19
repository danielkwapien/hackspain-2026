/**
 * Topbar: marca «Kima» con su logo, pestañas de tablero, el disparador del buscador
 * central y, a la derecha, el aviso de dato simulado, «Añadir widget» y avatar. Sin chips: el
 * fondo es transparente para que el orbe se vea a través (Trade Republic:
 * `header.pageHeader` 60 px, padding 16, sin borde).
 *
 * El `header` es `relative`: `SearchTrigger` se centra en él en absoluto, fuera
 * del flujo de las pestañas.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { AddWidgetButton } from "@/components/AddWidgetButton";
import { DashboardTabs } from "@/components/DashboardTabs";
import { Logo } from "@/components/Logo";
import { SearchTrigger } from "@/components/SearchTrigger";
import { getMeta } from "@/lib/api-v2";

/** Inicial del avatar: todavía no hay modelo de usuario, la marca hace de perfil. */
const AVATAR_INITIAL = "K";

const GLASS_CLASS =
  "bg-surface-glass shadow-[inset_0_0_0_1px_var(--border-glass)] backdrop-blur-[var(--blur-glass)]";

/**
 * Aviso de dato simulado. La versión del motor y el corte (`embat-layered-v1 ·
 * corte 08/2026`) se fueron en XR-037: eran ruido de ingeniería en una pantalla de
 * cliente y se truncaban a «at-layered-v1». Lo que no se puede perder es la guarda:
 * era lo único que distinguía en pantalla datos reales de datos simulados, así que
 * el aviso se queda, pero solo cuando hay mock.
 */
function MockIndicator(): ReactElement | null {
  const meta = useQuery({ queryKey: ["meta"], queryFn: getMeta });

  if (meta.data?.data_kind !== "mock") return null;

  return (
    <span
      role="status"
      className="shrink-0 truncate text-[length:var(--text-micro)] text-content-secondary"
    >
      Mock v1
    </span>
  );
}

export function Topbar(): ReactElement {
  return (
    <header
      role="banner"
      className="relative flex shrink-0 items-center gap-4 px-4"
      style={{ height: "var(--size-topbar)" }}
    >
      <Link
        to="/"
        aria-label="Kima, inicio"
        className="flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Logo className="size-5 shrink-0 text-content-primary" />
        <span className="text-[length:var(--text-panel-title)] font-semibold tracking-[0.1px] text-content-primary">
          Kima
        </span>
      </Link>

      <DashboardTabs />

      <SearchTrigger />

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
