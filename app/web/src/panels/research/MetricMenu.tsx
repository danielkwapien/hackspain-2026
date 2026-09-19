/**
 * Botón que cambia la métrica de la gráfica (Health score o una familia) con un menú
 * de radio a mano, sin Radix, como el menú de acciones de `WidgetFrame`: `div
 * role="menu"` con seis `menuitemradio`, flechas y Home/End mueven el foco, Enter o
 * Espacio eligen y devuelven el foco al botón, Escape cierra (y se lo queda: el lienzo
 * también escucha Escape) y un clic fuera cierra sin devolver el foco.
 */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import type { Metric } from "@/lib/definitions";
import { METRIC_OPTIONS } from "@/lib/definitions";

const BUTTON_CLASS =
  "flex h-[var(--size-segment-sm)] shrink-0 items-center gap-1 rounded-[var(--radius-control)] bg-surface-glass px-2 text-[length:var(--text-control)] font-semibold whitespace-nowrap text-content-primary shadow-[inset_0_0_0_1px_var(--border-glass)] transition-[background-color,transform] duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover [@media(hover:hover)]:hover:scale-[1.02] active:scale-[.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none";

const MENU_CLASS =
  "absolute top-full right-0 z-[var(--z-popover)] mt-1 w-40 origin-top-right rounded-[var(--radius-card)] bg-surface-elevated p-1 shadow-[inset_0_0_0_1px_var(--border-glass)] animate-menu-enter motion-reduce:animate-none";

const ITEM_CLASS =
  "flex h-[var(--size-row)] w-full items-center rounded-[var(--radius-control)] px-2 text-left text-[length:var(--text-body)] transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover focus-visible:bg-surface-glass-hover focus-visible:outline-none motion-reduce:transition-none";

export function MetricMenu({
  value,
  onChange,
}: {
  value: Metric;
  onChange: (metric: Metric) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const label = METRIC_OPTIONS.find((option) => option.value === value)?.label ?? value;

  // Al abrir, el foco va a la opción marcada; un clic fuera cierra sin devolverlo.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    function onPointerDown(event: PointerEvent): void {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close(): void {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function choose(metric: Metric): void {
    if (metric !== value) onChange(metric);
    close();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);
    let next: number;
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
    items[next].focus();
  }

  return (
    <div
      ref={wrapRef}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Métrica de la gráfica: ${label}`}
        className={BUTTON_CLASS}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <ChevronDown aria-hidden="true" className="size-3" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Métrica de la gráfica"
          className={MENU_CLASS}
          onKeyDown={handleMenuKeyDown}
        >
          {METRIC_OPTIONS.map((option) => {
            const checked = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                className={cn(
                  ITEM_CLASS,
                  checked ? "text-content-primary" : "text-content-secondary",
                )}
                onClick={() => choose(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
