/**
 * Disparador del buscador central: un botón con aspecto de campo, centrado en la
 * topbar (`absolute left-1/2`, ancho `--size-search-w`), que abre
 * `EntitySearchOverlay`. Muestra el nombre de la entidad seleccionada (empresa por
 * `useCompanyName`, grupo por `groupKey`) o el placeholder, y el atajo `⌘K`.
 *
 * `⌘K`/`Ctrl+K` se escuchan en `window`; antes de abrir, el botón toma el foco para
 * que el diálogo se lo devuelva al cerrar. El diálogo anima igual al abrir por
 * teclado: el velo y el panel llevan su `animate-*` fijo y `motion-reduce` ya lo
 * apaga para quien lo pide.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { cn } from "cn";
import { EntitySearchOverlay } from "@/components/EntitySearchOverlay";
import { useSelection } from "@/dashboard/selection";
import { getGroupV2 } from "@/lib/api-v2";
import { groupKey } from "@/lib/query-keys";
import { useCompanyName } from "@/widgets/useCompanyName";

const PLACEHOLDER = "Buscar empresa o grupo…";

const GLASS_CLASS =
  "bg-surface-glass shadow-[inset_0_0_0_1px_var(--border-glass)] backdrop-blur-[var(--blur-glass)]";

const TRIGGER_CLASS = cn(
  "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[length:var(--text-control)] transition-[background-color,transform] duration-[var(--duration-fast)] [@media(hover:hover)]:hover:scale-[1.01] [@media(hover:hover)]:hover:bg-surface-glass-hover active:scale-[.99] focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
  GLASS_CLASS,
);

function isSearchShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k";
}

export function SearchTrigger(): ReactElement {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const entity = useSelection((state) => state.selectedEntity);

  const companyName = useCompanyName(entity?.kind === "company" ? entity.id : null);
  const groupId = entity?.kind === "group" ? entity.id : null;
  const group = useQuery({
    queryKey: groupKey(groupId ?? ""),
    queryFn: () => getGroupV2(groupId ?? ""),
    select: (data) => data.group.name,
    enabled: groupId !== null,
  });
  const name = groupId !== null ? group.data : companyName;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      buttonRef.current?.focus();
      setOpen(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={TRIGGER_CLASS}
        style={{ width: "var(--size-search-w)", height: "var(--size-input)" }}
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-content-secondary" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            name ? "font-medium text-content-primary" : "text-content-secondary",
          )}
        >
          {name ?? PLACEHOLDER}
        </span>
        <kbd className="shrink-0 num text-[length:var(--text-micro)] text-content-tertiary">
          ⌘K
        </kbd>
      </button>
      {open ? <EntitySearchOverlay onClose={() => setOpen(false)} /> : null}
    </>
  );
}
