/**
 * Selector de empresa: un botón que abre un buscador sobre `/api/v2/universe?q=`.
 *
 * Lo usan la Comparativa (slots A y B), la cabecera de Investigación y el marco de
 * widget («Elegir empresa»), así que vive en `components/` y no en un panel. Con
 * `allowFollow` antepone «Seguir la selección global», que devuelve `null`.
 *
 * Hecho a mano (trigger `aria-haspopup="listbox"` + input `combobox` + `listbox`): no hay
 * librería de popover en el proyecto. El popover se monta en `document.body` con
 * `position: fixed` anclado al rectángulo del trigger: los paneles glass llevan
 * `backdrop-filter`, que convierte al panel en containing block y recortaría un
 * `fixed` anidado. Cierra con clic fuera, `Escape`, `Tab`, `resize`/`scroll` y al
 * elegir; el foco vuelve al trigger salvo en el clic fuera.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { bandToken, fmtPoints } from "@/charts";
import { Skeleton } from "@/components/ui/skeleton";
import { getUniverse } from "@/lib/api-v2";
import type { UniverseItem } from "@/lib/api-v2";
import { pickerKey } from "@/lib/query-keys";

/** Lo que el trigger enseña: basta con id y nombre, venga de donde venga. */
export type PickerValue = { id: string; name: string };

export type CompanyPickerProps = {
  value: PickerValue | null;
  /** Nombre accesible del trigger («Empresa A»). */
  label: string;
  /** Texto del trigger sin valor. */
  placeholder?: string;
  /** `null` solo con `allowFollow`: «Seguir la selección global». */
  onPick: (item: UniverseItem | null) => void;
  allowFollow?: boolean;
  /** Clave de color de la serie (12×2) a la izquierda del nombre. */
  color?: string;
  className?: string;
};

/** Filas que devuelve el buscador: el top por score cuando `q` está vacío. */
const LIMIT = 8;
const FOLLOW_LABEL = "Seguir la selección global";
/** Separación entre el trigger y el popover, y margen mínimo con el borde de la ventana. */
const GAP = 4;
const VIEWPORT_MARGIN = 16;

const PRESS_CLASS =
  "transition-[color,background-color,opacity,transform] duration-[var(--duration-fast)] active:scale-[.97]";

const TRIGGER_CLASS = cn(
  "inline-flex h-[var(--size-segment-sm)] max-w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-[length:var(--text-body)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:hover)]:hover:bg-surface-glass-hover [@media(hover:hover)]:hover:scale-[1.02] motion-reduce:transition-none",
  PRESS_CLASS,
);

const POPOVER_CLASS =
  "fixed z-[var(--z-popover)] flex w-[var(--size-popover-w)] flex-col gap-1 rounded-[var(--radius-card)] bg-surface-elevated p-1 shadow-[inset_0_0_0_1px_var(--border-glass)] animate-menu-enter motion-reduce:animate-none origin-top-left";

const OPTION_CLASS =
  "flex h-[var(--size-row)] cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2";

type Row = { id: string; item: UniverseItem | null };

type Placement = { top: number; left: number };

export function CompanyPicker({
  value,
  label,
  placeholder = "Elegir empresa",
  onPick,
  allowFollow = false,
  color,
  className,
}: CompanyPickerProps): ReactElement {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<Placement>({ top: 0, left: 0 });

  const query = useQuery({
    queryKey: pickerKey(q),
    queryFn: () => getUniverse({ q, unit: "company", limit: LIMIT, sort: "score" }),
    placeholderData: keepPreviousData,
    enabled: open,
  });

  const items = query.data?.items ?? [];
  const rows: Row[] = [
    ...(allowFollow ? [{ id: `${baseId}-follow`, item: null }] : []),
    ...items.map((item, index) => ({ id: `${baseId}-opt-${index}`, item })),
  ];
  const active = rows.length > 0 ? Math.min(activeIndex, rows.length - 1) : 0;

  function openPicker() {
    setQ("");
    setActiveIndex(0);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function pick(row: Row) {
    onPick(row.item);
    close(true);
  }

  /* Anclaje al trigger, medido antes de pintar: alineado a la izquierda salvo que se
     salga por la derecha, y siempre a `GAP` px por debajo. */
  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    const width = popoverRef.current?.offsetWidth ?? 0;
    if (!rect) return;
    let left = rect.left;
    if (left + width > window.innerWidth - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, rect.right - width);
    }
    setPlacement({ top: rect.bottom + GAP, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onWindowChange() {
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    };
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (rows.length > 0) setActiveIndex((active + 1) % rows.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (rows.length > 0) setActiveIndex((active - 1 + rows.length) % rows.length);
        break;
      case "Enter": {
        event.preventDefault();
        const row = rows[active];
        if (row) pick(row);
        break;
      }
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        // Cierra y devuelve el foco al trigger: el Tab nativo sigue desde ahí.
        close(true);
        break;
      default:
    }
  }

  const displayed = value?.name ?? placeholder;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${displayed}`}
        onClick={() => (open ? close(false) : openPicker())}
        className={cn(TRIGGER_CLASS, className)}
      >
        {color ? (
          <span
            aria-hidden="true"
            className="h-0.5 w-3 shrink-0"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <span
          className={cn(
            "truncate",
            value ? "font-semibold text-content-primary" : "text-content-secondary",
          )}
        >
          {displayed}
        </span>
        <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-content-secondary" />
      </button>

      {open
        ? createPortal(
            <div
              ref={popoverRef}
              data-slot="company-picker-popover"
              className={POPOVER_CLASS}
              style={{
                top: `${placement.top}px`,
                left: `${placement.left}px`,
                maxHeight: `min(var(--size-popover-w), calc(100vh - ${placement.top + VIEWPORT_MARGIN}px))`,
              }}
            >
              <div
                className="flex shrink-0 items-center rounded-[var(--radius-control)] bg-surface-glass px-2 shadow-[inset_0_0_0_1px_var(--border-glass)] focus-within:ring-1 focus-within:ring-ring"
                style={{ height: "var(--size-input)" }}
              >
                <input
                  type="text"
                  role="combobox"
                  aria-label="Buscar empresa"
                  aria-autocomplete="list"
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-activedescendant={rows[active]?.id}
                  placeholder="Nombre o id"
                  autoFocus
                  autoComplete="off"
                  value={q}
                  onChange={(event) => {
                    setQ(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  className="h-full w-full bg-transparent text-[length:var(--text-control)] text-content-primary outline-none placeholder:text-content-secondary"
                />
              </div>

              {rows.length > 0 ? (
                <ul id={listboxId} role="listbox" className="min-h-0 overflow-y-auto">
                  {rows.map((row, index) => (
                    <li
                      key={row.id}
                      id={row.id}
                      role="option"
                      aria-selected={index === active}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => pick(row)}
                      className={cn(OPTION_CLASS, index === active && "bg-surface-glass-hover")}
                    >
                      {row.item ? (
                        <>
                          <span className="min-w-0 flex-1 truncate text-[length:var(--text-body)] text-content-primary">
                            {row.item.name}
                          </span>
                          <span className="shrink-0 font-mono text-[length:var(--text-micro)] tabular-nums text-content-secondary">
                            {row.item.id}
                          </span>
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.item.band ? bandToken(row.item.band) : "var(--chart-neutral)" }}
                          />
                          <span className="shrink-0 font-mono text-[length:var(--text-control)] tabular-nums text-content-primary">
                            {fmtPoints(row.item.score)}
                          </span>
                        </>
                      ) : (
                        <span className="text-[length:var(--text-body)] text-content-secondary">
                          {FOLLOW_LABEL}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : query.isPending ? (
                <div className="flex flex-col gap-1 px-2 py-1" aria-busy="true" aria-live="polite">
                  <span className="sr-only">Buscando empresas</span>
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton
                      key={index}
                      className="h-4 w-full bg-surface-glass motion-reduce:animate-none"
                    />
                  ))}
                </div>
              ) : (
                <p className="px-2 py-2 text-[length:var(--text-control)] text-content-secondary">
                  {query.isError ? "No se pudo buscar" : "Sin resultados"}
                </p>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
