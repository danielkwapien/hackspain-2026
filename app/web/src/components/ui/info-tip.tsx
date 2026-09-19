/**
 * Burbuja ⓘ a mano, sin Radix: un botón de 14 px con `aria-label="Definición de
 * <título>"` y un `span role="tooltip"` **siempre montado** en un portal a `body`
 * (`position: fixed`, así el overflow del widget no lo recorta) que va `hidden`
 * hasta el hover o el foco. Escape lo oculta sin soltar el foco.
 *
 * El hover espera `OPEN_DELAY_MS`; el foco no (el teclado no tiene «hover»). Si
 * otra burbuja se cerró hace menos de `GRACE_MS`, la siguiente abre al instante:
 * recorrer una fila de KPIs no debe esperar en cada celda.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

const OPEN_DELAY_MS = 300;
const GRACE_MS = 300;

/** Separación entre el botón y la burbuja, y margen mínimo con el borde de la ventana. */
const GAP_PX = 6;
const EDGE_PX = 8;

const BUTTON_CLASS =
  "inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-content-secondary transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:text-content-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

const TIP_CLASS =
  "pointer-events-none fixed z-[var(--z-tooltip)] max-w-64 -translate-x-1/2 rounded-[var(--radius-control)] bg-surface-tooltip px-2 py-1 text-left text-[length:var(--text-micro)] leading-snug text-content-primary shadow-[inset_0_0_0_1px_var(--border-glass)]";

/** Cuándo se cerró la última burbuja, compartido entre todas. */
let lastClosedAt = Number.NEGATIVE_INFINITY;

type Position = { top: number; left: number };

export function InfoTip({
  title,
  definition,
}: {
  title: string;
  definition: string;
}): ReactElement {
  const tipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  function clearTimer(): void {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function show(): void {
    clearTimer();
    setOpen(true);
  }

  function hide(): void {
    clearTimer();
    setOpen((current) => {
      if (current) lastClosedAt = Date.now();
      return false;
    });
  }

  function handleMouseEnter(): void {
    if (Date.now() - lastClosedAt < GRACE_MS) {
      show();
      return;
    }
    clearTimer();
    timerRef.current = setTimeout(show, OPEN_DELAY_MS);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "Escape" || !open) return;
    // Solo la burbuja: un diálogo que contenga la ⓘ no se cierra con este Escape.
    event.stopPropagation();
    hide();
  }

  useEffect(() => clearTimer, []);

  // Bajo el botón, centrada; encima si abajo no cabe. Se mide ya visible.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const tip = tipRef.current;
    if (!open || !button || !tip) return;
    const anchor = button.getBoundingClientRect();
    const below = anchor.bottom + GAP_PX;
    const top = below + tip.offsetHeight > window.innerHeight
      ? anchor.top - GAP_PX - tip.offsetHeight
      : below;
    const half = tip.offsetWidth / 2;
    const center = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(center, EDGE_PX + half), window.innerWidth - EDGE_PX - half);
    setPosition({ top, left });
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Definición de ${title}`}
        aria-describedby={tipId}
        className={BUTTON_CLASS}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={handleKeyDown}
      >
        <Info aria-hidden="true" className="size-3.5" />
      </button>
      {createPortal(
        <span
          ref={tipRef}
          id={tipId}
          role="tooltip"
          hidden={!open}
          className={TIP_CLASS}
          style={position ?? undefined}
        >
          {definition}
        </span>,
        document.body,
      )}
    </>
  );
}
