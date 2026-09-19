/**
 * «Añadir widget»: el disparador del catálogo en la topbar.
 *
 * Deshabilitado en los tableros fijos y con el tablero lleno; el `title` dice
 * por qué. Abre `WidgetCatalog` como popover anclado a la derecha; Escape y el
 * clic fuera lo cierran, y Escape devuelve el foco al botón (patrón `FilterPill`).
 */

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Plus } from "lucide-react";
import { WidgetCatalog } from "@/dashboard/WidgetCatalog";
import { isFixedDashboard } from "@/dashboard/fixed";
import { canAddWidget, useDashboards } from "@/dashboard/store";

const ICON_BUTTON_CLASS =
  "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-content-secondary transition-transform duration-[var(--duration-moderate)] [@media(hover:hover)]:hover:scale-110 hover:text-content-primary active:scale-[.97] disabled:opacity-40 disabled:hover:scale-100 disabled:hover:text-content-secondary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

export function AddWidgetButton(): ReactElement {
  const isFixed = useDashboards((state) => isFixedDashboard(state.active));
  const canAdd = useDashboards(canAddWidget);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const title = isFixed
    ? "Este tablero es fijo: crea uno con «Añadir página»"
    : !canAdd
      ? "Máximo 4 widgets por tablero"
      : undefined;

  /** Cierra el menú y devuelve el foco al disparador: quien lo abrió sigue donde estaba. */
  function closeMenu(): void {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative flex shrink-0 items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Añadir widget"
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        disabled={isFixed || !canAdd}
        className={ICON_BUTTON_CLASS}
        onClick={() => setOpen(!open)}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
      {open ? <WidgetCatalog onClose={closeMenu} /> : null}
    </div>
  );
}
