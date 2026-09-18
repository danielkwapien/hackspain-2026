/**
 * Topbar del tablero: espacios de trabajo a la izquierda, estado de la cartera
 * y controles a la derecha.
 *
 * Las pestañas se reordenan con pointer events, no con HTML5 drag and drop: el
 * mismo patrón que el lienzo y el único que se puede probar en jsdom.
 */

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactElement } from "react";
import { cn } from "cn";
import { LayoutGrid, Plus } from "lucide-react";
import { usePortfolioHealth } from "@/lib/portfolio-health";
import {
  applyPreset,
  createWorkspace,
  renameWorkspace,
  reorderWorkspaces,
  setActiveWorkspace,
  useDashboard,
} from "./store";

/** Inicial del avatar: todavía no hay modelo de usuario, la marca hace de perfil. */
const AVATAR_INITIAL = "X";

const CHIP_CLASS =
  "flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-content-secondary";

const ICON_BUTTON_CLASS =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-content-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function formatScore(value: number): string {
  return value.toFixed(1);
}

function formatDelta(value: number): string {
  return `${value >= 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(1)}`;
}

function HealthChips(): ReactElement {
  const health = usePortfolioHealth("universe");
  const unknown = health.isPending || health.isError;

  return (
    <>
      <div className={CHIP_CLASS}>
        <span>Salud de cartera</span>
        {unknown ? (
          <span className="font-mono tabular-nums text-foreground">—</span>
        ) : (
          <>
            <span className="font-mono tabular-nums text-foreground">
              {formatScore(health.score)}
            </span>
            <span
              className={cn(
                "font-mono tabular-nums",
                health.delta >= 0 ? "text-content-positive" : "text-content-negative",
              )}
            >
              {formatDelta(health.delta)}
            </span>
          </>
        )}
      </div>
      <div className={CHIP_CLASS}>
        <span>Empresas en movimiento</span>
        <span className="font-mono tabular-nums text-foreground">
          {unknown ? "—" : health.moving}
        </span>
      </div>
    </>
  );
}

function LayoutMenu(): ReactElement {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Presets de rejilla"
        aria-haspopup="menu"
        aria-expanded={open}
        className={ICON_BUTTON_CLASS}
        onClick={() => setOpen(!open)}
      >
        <LayoutGrid aria-hidden="true" className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Presets de rejilla"
          className="absolute top-full right-0 z-30 mt-1 w-56 rounded-lg border border-border bg-surface-elevated p-1 shadow-lg"
        >
          {["Compacto", "Amplio"].map((preset) => (
            <button
              key={preset}
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised"
              onClick={() => {
                applyPreset("default");
                setOpen(false);
              }}
            >
              {preset}
            </button>
          ))}
          <p className="px-2 py-1 text-xs text-content-secondary">
            Ambos aplican el preset por defecto: los presets por rol llegan en XR-013.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceTabs(): ReactElement {
  const workspaces = useDashboard((state) => state.workspaces);
  const active = useDashboard((state) => state.active);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const dragFrom = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  // El arrastre acaba donde sea que se suelte el puntero, dentro o fuera.
  useEffect(() => {
    function handlePointerUp(): void {
      const from = dragFrom.current;
      const to = dragOver.current;
      dragFrom.current = null;
      dragOver.current = null;
      if (from === null || to === null || from === to) return;
      reorderWorkspaces(from, to);
    }
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, []);

  function startRename(id: string, name: string): void {
    setRenaming(id);
    setDraft(name);
  }

  function commitRename(): void {
    const id = renaming;
    setRenaming(null);
    if (!id) return;
    const name = draft.trim();
    if (name) renameWorkspace(id, name);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, index: number): void {
    if (event.button !== 0) return;
    dragFrom.current = index;
    dragOver.current = null;
  }

  return (
    <div role="tablist" aria-label="Espacios de trabajo" className="flex min-w-0 items-center gap-1">
      {workspaces.map((workspace, index) =>
        renaming === workspace.id ? (
          <input
            key={workspace.id}
            autoFocus
            aria-label="Nombre del espacio"
            value={draft}
            className="w-32 rounded-md border border-border bg-card px-2 py-1 text-[15px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setRenaming(null);
              }
            }}
          />
        ) : (
          <button
            key={workspace.id}
            type="button"
            role="tab"
            aria-selected={workspace.id === active}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-[15px] transition-colors duration-[var(--duration-fast)]",
              workspace.id === active
                ? "font-semibold text-foreground"
                : "text-content-secondary hover:text-foreground",
            )}
            onClick={() => setActiveWorkspace(workspace.id)}
            onDoubleClick={() => startRename(workspace.id, workspace.name)}
            onPointerDown={(event) => handlePointerDown(event, index)}
            onPointerEnter={() => {
              if (dragFrom.current !== null) dragOver.current = index;
            }}
          >
            {workspace.name}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label="Añadir espacio"
        className={ICON_BUTTON_CLASS}
        onClick={() => {
          const name = `Espacio ${workspaces.length + 1}`;
          startRename(createWorkspace(name), name);
        }}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

export function Topbar(): ReactElement {
  return (
    <header
      className="flex shrink-0 items-center gap-4 border-b border-border bg-background px-4"
      style={{ height: "var(--size-topbar)" }}
    >
      <WorkspaceTabs />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <HealthChips />
        <LayoutMenu />
        <button
          type="button"
          aria-label="Menú de perfil"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {AVATAR_INITIAL}
        </button>
      </div>
    </header>
  );
}
