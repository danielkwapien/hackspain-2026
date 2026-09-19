/**
 * Marco glass común de los tres paneles: cabecera de 32 px con el título a 14/600
 * y un hueco de acciones a la derecha, y el cuerpo ocupando el resto sin desbordar.
 *
 * Es una región con nombre (`aria-labelledby` al `h2`) para que el lector de
 * pantalla salte entre Empresas, Comparativa e Investigación. Entra con
 * `animate-panel-enter` escalonado 40 ms por panel; bajo `prefers-reduced-motion`
 * no anima. Sin hover de borde: el panel es un marco, no un control.
 */

import type { ReactElement, ReactNode } from "react";
import { cn } from "cn";

/** Escalonado de la entrada: el tercer panel arranca a 80 ms, nunca más tarde. */
const ENTER_STAGGER_MS = 40;

export function Panel({
  id,
  title,
  actions,
  children,
  className,
  index = 0,
}: {
  id: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  index?: number;
}): ReactElement {
  return (
    <section
      role="region"
      aria-labelledby={`${id}-title`}
      className={cn(
        "animate-panel-enter motion-reduce:animate-none flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface-glass px-4 pb-4 shadow-[inset_0_0_0_1px_var(--border-glass)] backdrop-blur-[var(--blur-glass)]",
        className,
      )}
      style={{ animationDelay: `${index * ENTER_STAGGER_MS}ms` }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2"
        style={{ height: "var(--size-row)" }}
      >
        <h2
          id={`${id}-title`}
          className="truncate text-[length:var(--text-panel-title)] font-semibold text-content-primary"
        >
          {title}
        </h2>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
