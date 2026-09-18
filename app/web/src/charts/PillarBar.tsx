/**
 * PillarBar: la nota de un pilar (`u ∈ [0,1]`) como barra de 6 px, o su
 * contribución en puntos como barra divergente con el cero en el centro.
 *
 * `pillarTone` es la única definición de los tramos de la nota en el producto.
 * La barra nunca lleva texto dentro: el valor va fuera, en la tabla.
 */

/** Alto de la barra: sin token propio en la escala. */
const TRACK_HEIGHT = "6px";

/** Suelo de la nota buena. */
const GOOD_THRESHOLD = 0.6;
/** Suelo de la nota en aviso; por debajo, la nota es mala. */
const ALERT_THRESHOLD = 0.45;

export type PillarBarProps = {
  /** Nota `u ∈ [0,1]` en `plain`; contribución en puntos en `diverging`. */
  value: number;
  label: string;
  variant?: "plain" | "diverging";
  /** Máximo absoluto de la tabla; solo lo usa `diverging`. */
  maxAbs?: number;
};

/** Tramo de color de una nota de pilar. Único sitio donde viven estos umbrales. */
export function pillarTone(u: number): string {
  if (u >= GOOD_THRESHOLD) return "var(--content-positive)";
  if (u >= ALERT_THRESHOLD) return "var(--content-alert)";
  return "var(--content-negative)";
}

/** Fracción a porcentaje de CSS, sin cola de coma flotante. */
function percent(value: number): string {
  return `${Number((value * 100).toFixed(2))}%`;
}

/** Color por signo de la contribución; el cero no tiene ancho que colorear. */
function contributionTone(value: number): string {
  if (value > 0) return "var(--content-positive)";
  if (value < 0) return "var(--content-negative)";
  return "var(--content-secondary)";
}

export function PillarBar({ value, label, variant = "plain", maxAbs = 0 }: PillarBarProps) {
  const diverging = variant === "diverging";
  // Sin escala (tabla vacía o toda a cero) no hay barra que dibujar.
  const half = diverging && maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) / 2 : 0;
  const width = diverging ? half : Math.min(1, Math.max(0, value));
  const left = diverging ? (value < 0 ? 0.5 - half : 0.5) : 0;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={diverging ? -maxAbs : 0}
      aria-valuemax={diverging ? maxAbs : 1}
      aria-valuenow={value}
      data-slot="pillar-bar-track"
      className="relative w-full overflow-hidden"
      style={{
        height: TRACK_HEIGHT,
        borderRadius: "var(--radius-control)",
        backgroundColor: "var(--alpha-white-10)",
      }}
    >
      {diverging ? (
        <div
          data-slot="pillar-bar-zero"
          className="absolute inset-y-0 w-px"
          style={{ left: percent(0.5), backgroundColor: "var(--alpha-white-30)" }}
        />
      ) : null}
      <div
        data-slot="pillar-bar-fill"
        className="absolute inset-y-0"
        style={{
          left: percent(left),
          width: percent(width),
          borderRadius: "var(--radius-control)",
          backgroundColor: diverging ? contributionTone(value) : pillarTone(value),
        }}
      />
    </div>
  );
}
