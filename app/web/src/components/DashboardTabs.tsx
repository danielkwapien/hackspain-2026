/**
 * Pestañas de tablero en la topbar: «Principal» fijo más los tableros de usuario,
 * con «Añadir página» al final.
 *
 * Solo los tableros de usuario se renombran (doble clic → input inline) y se
 * quitan (X en la pestaña activa). «Principal» no admite nada: el store ya lo
 * protege y aquí ni se ofrece. El renombrado se confirma con Enter o al perder el
 * foco y se cancela con Escape; un blur tardío tras cancelar no debe reabrir la
 * confirmación, así que el id en curso vive en un ref además de en el estado.
 */

import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { cn } from "cn";
import { Plus, X } from "lucide-react";
import {
  createDashboard,
  getState,
  isMainDashboard,
  mainDashboard,
  removeDashboard,
  renameDashboard,
  setActiveDashboard,
  useDashboards,
} from "@/dashboard/store";
import { MAX_DASHBOARDS } from "@/dashboard/types";

const FOCUS_RING_CLASS = "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

const TAB_CLASS = cn(
  "shrink-0 rounded-[var(--radius-control)] px-2 text-[length:var(--text-panel-title)] font-semibold transition-[color,transform] duration-[var(--duration-fast)] [@media(hover:hover)]:hover:scale-[1.02] hover:text-content-primary active:scale-[.97]",
  FOCUS_RING_CLASS,
);

const ICON_BUTTON_CLASS = cn(
  "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-content-secondary transition-transform duration-[var(--duration-moderate)] [@media(hover:hover)]:hover:scale-110 hover:text-content-primary active:scale-[.97] disabled:opacity-40 disabled:hover:scale-100 disabled:hover:text-content-secondary",
  FOCUS_RING_CLASS,
);

export function DashboardTabs(): ReactElement {
  const dashboards = useDashboards((state) => state.dashboards);
  const active = useDashboards((state) => state.active);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const pendingRename = useRef<string | null>(null);

  const tabs = [mainDashboard(), ...dashboards];
  const full = dashboards.length >= MAX_DASHBOARDS;

  function startRename(id: string, name: string): void {
    pendingRename.current = id;
    setRenaming(id);
    setDraft(name);
  }

  function finishRename(save: boolean): void {
    const id = pendingRename.current;
    pendingRename.current = null;
    setRenaming(null);
    if (!id || !save) return;
    const name = draft.trim();
    if (name) renameDashboard(id, name);
  }

  function handleCreate(): void {
    const id = createDashboard();
    if (!id) return;
    const created = getState().dashboards.find((dashboard) => dashboard.id === id);
    if (created) startRename(id, created.name);
  }

  return (
    <div role="tablist" aria-label="Tableros" className="flex min-w-0 items-center gap-1">
      {tabs.map((dashboard) => {
        const isMain = isMainDashboard(dashboard.id);
        const isActive = dashboard.id === active;

        if (renaming === dashboard.id) {
          return (
            <input
              key={dashboard.id}
              autoFocus
              aria-label="Nombre del tablero"
              value={draft}
              className="w-32 shrink-0 rounded-[var(--radius-control)] bg-surface-glass px-2 text-[length:var(--text-panel-title)] font-semibold text-content-primary shadow-[inset_0_0_0_1px_var(--border-glass)] outline-none focus-visible:ring-1 focus-visible:ring-ring"
              style={{ height: "var(--size-segment)" }}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => finishRename(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  finishRename(true);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  finishRename(false);
                }
              }}
            />
          );
        }

        return (
          <div key={dashboard.id} className="flex shrink-0 items-center">
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              className={cn(
                TAB_CLASS,
                isActive ? "text-content-primary" : "text-content-secondary",
              )}
              style={{ height: "var(--size-segment)" }}
              onClick={() => setActiveDashboard(dashboard.id)}
              onDoubleClick={() => {
                if (!isMain) startRename(dashboard.id, dashboard.name);
              }}
            >
              {dashboard.name}
            </button>
            {isActive && !isMain ? (
              <button
                type="button"
                aria-label={`Quitar tablero ${dashboard.name}`}
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-content-secondary transition-[color,background-color,transform] duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover hover:text-content-primary active:scale-[.97]",
                  FOCUS_RING_CLASS,
                )}
                onClick={() => removeDashboard(dashboard.id)}
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        aria-label="Añadir página"
        title={full ? "Máximo 8 tableros" : undefined}
        disabled={full}
        className={ICON_BUTTON_CLASS}
        onClick={handleCreate}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
