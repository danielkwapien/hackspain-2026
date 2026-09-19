/**
 * Capa de fondo del tablero: el orbe difuminado que deriva detrás del contenido y
 * un foco que sigue al puntero.
 *
 * Trade Republic no tiene orbe en el tablero: su `canvas.spotlightCursor` va a alfa 0
 * en todos los píxeles. El foco difuminado solo se pinta en el login, y allí es un
 * canvas que sigue al cursor. Aquí se trae a la página como capa CSS pura por
 * decisión de producto (XR-030): `radial-gradient` + `blur`, deriva con `transform`
 * y apagado bajo `prefers-reduced-motion`. Color, tamaño y variante viven en
 * `index.css` (`.orb-layer`, `.orb`, `.spotlight`, tokens `--orb-*` y
 * `--spotlight-*`); aquí no hay ningún literal.
 *
 * El foco se mueve sin `setState`: un `pointermove` pasivo escribe el destino y un
 * bucle de `requestAnimationFrame` acerca la posición un 8 % por frame escribiendo
 * `style.transform`. En reposo no hay rAF pendiente. Con reduced motion o sin
 * puntero fino (`hover: none`) no se engancha nada: la hoja ya oculta el foco.
 */
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

/** Fracción de la distancia que se recorre en cada frame. */
const SMOOTHING = 0.08;
/** Por debajo de esta distancia (px) el bucle se para: nadie ve medio píxel. */
const SETTLE_PX = 0.5;

function prefersStaticSpotlight(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(hover: none)").matches
  );
}

export function Background(): ReactElement {
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = spotlightRef.current;
    if (!node || prefersStaticSpotlight()) return;

    // Mismo punto de partida que el `transform` de `.spotlight` en la hoja.
    const target = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
    const current = { ...target };
    let frame = 0;

    function step(): void {
      frame = 0;
      current.x += (target.x - current.x) * SMOOTHING;
      current.y += (target.y - current.y) * SMOOTHING;
      if (node) node.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      const settled =
        Math.abs(target.x - current.x) < SETTLE_PX && Math.abs(target.y - current.y) < SETTLE_PX;
      if (!settled) frame = requestAnimationFrame(step);
    }

    function handlePointerMove(event: PointerEvent): void {
      target.x = event.clientX;
      target.y = event.clientY;
      if (!frame) frame = requestAnimationFrame(step);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div data-orb aria-hidden="true" className="orb-layer">
      <div className="orb" />
      <div className="orb orb--2" />
      <div ref={spotlightRef} data-spotlight className="spotlight" />
    </div>
  );
}
