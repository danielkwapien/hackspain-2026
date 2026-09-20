/**
 * El acuse de la operación (W4.5): un sobre que cruza la pantalla hacia arriba
 * desvaneciéndose y un aviso central que se va solo a los 2,5 s. No hay librería
 * de toasts en el proyecto y esto no justifica traer una: es un contenedor
 * `fixed` sin eventos y las dos utilidades de animación que la hoja ya declara
 * (`animate-envelope-fly`, `animate-toast-enter`).
 *
 * Con `prefers-reduced-motion` el sobre **no se pinta** —`animate-none` sobre una
 * animación `both` lo dejaría congelado en medio de la pantalla— pero el aviso
 * sigue apareciendo, sin desplazamiento: es la confirmación de la acción, no un
 * adorno. Por eso lleva `role="status"` y `aria-live="polite"`, que es como se
 * entera de que la operación se ha completado quien no ve la animación.
 *
 * No se envía ningún correo: es una simulación y no hay servicio de correo en el
 * proyecto.
 */

import { useEffect } from "react";
import type { ReactElement } from "react";
import { Mail } from "lucide-react";

/** Lo que dura el aviso en pantalla. */
const NOTICE_MS = 2_500;

const ROOT_CLASS =
  "pointer-events-none fixed inset-0 z-[var(--z-popover)] flex items-center justify-center";

const ENVELOPE_CLASS =
  "absolute size-8 text-content-accent animate-envelope-fly motion-reduce:animate-none motion-reduce:hidden";

const NOTICE_CLASS =
  "rounded-[var(--radius-card)] bg-surface-elevated px-4 py-2 text-[length:var(--text-section)] text-content-primary shadow-[inset_0_0_0_1px_var(--border-glass)] animate-toast-enter motion-reduce:animate-none";

export function SendFeedback({
  message,
  onDone,
}: {
  message: string;
  onDone: () => void;
}): ReactElement {
  useEffect(() => {
    const timer = setTimeout(onDone, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={ROOT_CLASS}>
      <Mail aria-hidden="true" data-slot="trade-envelope" className={ENVELOPE_CLASS} />
      <p role="status" aria-live="polite" className={NOTICE_CLASS}>
        {message}
      </p>
    </div>
  );
}
