/**
 * Capa de fondo del tablero: el orbe difuminado que deriva detrás del contenido.
 *
 * Trade Republic no tiene orbe en el tablero: su `canvas.spotlightCursor` va a alfa 0
 * en todos los píxeles. El foco difuminado solo se pinta en el login, y allí es un
 * canvas que sigue al cursor. Aquí se trae a la página como capa CSS pura por
 * decisión de producto (XR-030): `radial-gradient` + `blur`, deriva con `transform`
 * y apagado bajo `prefers-reduced-motion`. Color, tamaño y variante viven en
 * `index.css` (`.orb-layer`, `.orb`, tokens `--orb-*`); aquí no hay ningún literal.
 */
import type { ReactElement } from "react";

export function Background(): ReactElement {
  return (
    <div data-orb aria-hidden="true" className="orb-layer">
      <div className="orb" />
      <div className="orb orb--2" />
    </div>
  );
}
