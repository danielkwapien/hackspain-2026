/**
 * Marca de Kima: un cuadrado redondeado con la línea del score subiendo dentro.
 *
 * Placeholder geométrico hasta que llegue el definitivo (XR-037, E2). Todos los
 * trazos van en `currentColor`, así que hereda el color del texto que lo acompaña
 * y no necesita ningún token propio. Decorativo: quien nombra el enlace es su
 * `aria-label`, por eso el SVG va `aria-hidden`.
 */

import type { ReactElement } from "react";

export function Logo({ className }: { className?: string }): ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="1.75" y="1.75" width="16.5" height="16.5" rx="5" />
      <path d="M5.75 13.25 9 9.5l2.25 2 3-4.75" />
    </svg>
  );
}
