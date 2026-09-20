/**
 * Casilla a mano, como `segmented.tsx` y `info-tip.tsx`: un `button` con
 * `role="checkbox"` y `aria-checked`, no un `input` maquillado. La etiqueta va
 * dentro del botón, así que el nombre accesible sale del contenido y todo el
 * renglón es zona de clic.
 *
 * `type="button"`: dentro de un diálogo, el `submit` por defecto de un botón
 * enviaría el formulario que lo contenga. La marca es un `Check` de
 * `lucide-react` sobre la caja, nunca solo un cambio de color.
 */

import type { ReactElement } from "react";
import { Check } from "lucide-react";
import { cn } from "cn";

const ROOT_CLASS =
  "flex w-full items-start gap-2 rounded-[var(--radius-control)] py-1 text-left text-[length:var(--text-body)] text-content-primary transition-colors duration-[var(--duration-fast)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:hover)]:hover:bg-surface-glass";

const BOX_CLASS =
  "mt-px flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-control)] shadow-[inset_0_0_0_1px_var(--border-glass)] transition-colors duration-[var(--duration-fast)]";

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texto visible y nombre accesible de la casilla. */
  label: string;
  className?: string;
}): ReactElement {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-slot="checkbox"
      onClick={() => onChange(!checked)}
      className={cn(ROOT_CLASS, className)}
    >
      <span
        aria-hidden="true"
        className={cn(BOX_CLASS, checked ? "bg-content-accent" : "bg-surface-glass")}
      >
        {checked ? <Check className="size-3 text-surface-primary" /> : null}
      </span>
      <span className="min-w-0 text-pretty">{label}</span>
    </button>
  );
}
