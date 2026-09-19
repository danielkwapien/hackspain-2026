/**
 * Diálogo modal a mano, sin Radix: portal a `body`, `role="dialog" aria-modal`, foco
 * dentro al abrir, trampa de Tab cíclica, Escape y clic en el velo cierran, y al
 * desmontar el foco vuelve a quien lo abrió. Mientras está abierto `body` no
 * scrollea y los hermanos del portal quedan `inert`.
 *
 * El padre lo monta mientras está abierto y lo desmonta en `onClose` (patrón
 * `WidgetCatalog`). Escape se consume con `preventDefault` + `stopPropagation`: el
 * lienzo (`Grid`) no debe restaurar el widget maximizado con la misma tecla.
 *
 * Dos tamaños: `overlay` (el buscador: `--size-overlay-w` × `--size-overlay-h`
 * anclado bajo la topbar) y `full` (metodología e informe: `inset: 16px` centrado
 * hasta `max-w-6xl`). El título va en un `h2` solo para lectores de pantalla: cada
 * consumidor pinta su cabecera visible.
 */

import { useEffect, useId, useRef } from "react";
import type { CSSProperties, KeyboardEvent, ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";

export type DialogSize = "overlay" | "full";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PANEL_CLASS =
  "fixed flex flex-col overflow-y-auto rounded-[var(--radius-card)] bg-surface-elevated shadow-[inset_0_0_0_1px_var(--border-glass)] focus:outline-none animate-dialog-enter motion-reduce:animate-none";

const SIZE_CLASS: Record<DialogSize, string> = {
  overlay: "left-1/2 -translate-x-1/2 origin-top",
  full: "inset-4 mx-auto max-w-6xl origin-center",
};

const SIZE_STYLE: Record<DialogSize, CSSProperties | undefined> = {
  overlay: {
    top: "var(--size-topbar)",
    width: "var(--size-overlay-w)",
    maxHeight: "var(--size-overlay-h)",
  },
  full: undefined,
};

const SCRIM_CLASS =
  "fixed inset-0 bg-surface-overlay backdrop-blur-[2px] animate-backdrop-enter motion-reduce:animate-none";

function focusables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.getAttribute("aria-hidden") !== "true",
  );
}

export function Dialog({
  label,
  size = "overlay",
  onClose,
  className,
  children,
}: {
  label: string;
  size?: DialogSize;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Solo los hermanos que no estaban ya inertes: al cerrar se devuelven tal cual.
    const silenced = [...document.body.children].filter(
      (sibling) => sibling !== root && !sibling.hasAttribute("inert"),
    );
    for (const sibling of silenced) sibling.setAttribute("inert", "");

    // Un hijo con `autoFocus` ya tiene el foco; si no, el primer enfocable o el panel.
    if (!panel.contains(document.activeElement)) {
      (focusables(panel)[0] ?? panel).focus();
    }

    return () => {
      for (const sibling of silenced) sibling.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    const items = focusables(panelRef.current);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && items.includes(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-[var(--z-modal)]" onKeyDown={handleKeyDown}>
      <div data-dialog-scrim="" aria-hidden="true" className={SCRIM_CLASS} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        className={cn(PANEL_CLASS, SIZE_CLASS[size], className)}
        style={SIZE_STYLE[size]}
      >
        <h2 id={labelId} className="sr-only">
          {label}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
