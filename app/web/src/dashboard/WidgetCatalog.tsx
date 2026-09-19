/**
 * Catálogo de widgets: popover `role="menu"` con una fila por tipo registrado.
 *
 * Menú a mano, sin Radix, por la misma razón que el resto de menús del tablero
 * (`FilterPill`): en jsdom su popover es frágil y aquí hace falta control exacto
 * del foco. El foco entra en la primera fila al abrir y se recorre con ↑/↓, Home y
 * End; Enter y Espacio añaden por el clic nativo del botón. Escape y el clic fuera
 * los gestiona quien lo abre (`AddWidgetButton`), que también devuelve el foco.
 */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { listWidgets } from "@/widgets/registry";
import { addWidget, canAddWidget, useDashboards } from "./store";

const MENU_CLASS =
  "absolute top-full right-0 z-[var(--z-popover)] mt-1 max-h-[350px] w-[var(--size-popover-w)] origin-top-right overflow-y-auto rounded-[var(--radius-card)] bg-surface-elevated p-1 shadow-[inset_0_0_0_1px_var(--border-glass)] animate-menu-enter motion-reduce:animate-none";

const ITEM_CLASS =
  "flex h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-2 text-left text-content-primary transition-[background-color,transform,opacity] duration-[var(--duration-fast)] [@media(hover:hover)]:hover:scale-[1.02] [@media(hover:hover)]:hover:bg-surface-glass-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none aria-disabled:opacity-40 aria-disabled:hover:scale-100";

export function WidgetCatalog({ onClose }: { onClose: () => void }): ReactElement {
  const canAdd = useDashboards(canAddWidget);
  const [refused, setRefused] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Al abrir, el foco entra en la primera fila: el menú se recorre con ↑/↓ desde ahí.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  function menuItems(): HTMLElement[] {
    return [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  }

  function handleMenuKey(event: KeyboardEvent<HTMLDivElement>): void {
    const items = menuItems();
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        next = (current + 1) % items.length;
        break;
      case "ArrowUp":
        next = (current - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  function handleAdd(type: string, size: { w: number; h: number }): void {
    if (!canAdd) return;
    const id = addWidget({ type, ...size });
    if (!id) {
      setRefused(true);
      return;
    }
    onClose();
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Añadir widget"
      className={MENU_CLASS}
      onKeyDown={handleMenuKey}
    >
      {listWidgets().map((definition) => {
        const Thumbnail = definition.thumbnail;
        return (
          <button
            key={definition.type}
            type="button"
            role="menuitem"
            aria-disabled={!canAdd || undefined}
            className={ITEM_CLASS}
            onClick={() => handleAdd(definition.type, definition.defaultSize)}
          >
            <span className="w-[60px] shrink-0">
              <Thumbnail />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[length:var(--text-control)] font-semibold">
                {definition.title}
              </span>
              <span className="truncate text-[length:var(--text-micro)] text-content-secondary">
                {definition.description}
              </span>
            </span>
          </button>
        );
      })}
      {refused ? (
        <p
          role="status"
          className="px-2 py-1 text-[length:var(--text-micro)] text-content-secondary"
        >
          Máximo 4 widgets por tablero
        </p>
      ) : null}
    </div>
  );
}
