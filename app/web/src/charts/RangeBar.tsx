/**
 * RangeBar: dónde cae un valor dentro de su rango, con las dos referencias a los
 * extremos. Es la barra de «Estadísticas clave» de Trade Republic.
 *
 * La posición siempre se recorta a [0, 1]: un valor fuera de rango se apoya en el
 * extremo, nunca se sale del track ni desaparece.
 */

import { bandToken, type Band } from "@/charts/palette";

/** Alto del track y diámetro del punto: sin token propio en la escala. */
const TRACK_HEIGHT = "6px";
const DOT_SIZE = "8px";

/** De peor a mejor, izquierda a derecha: es el sentido en el que crece el score. */
const SEGMENT_BANDS: readonly Band[] = ["stress", "watch", "healthy", "solid"];
/** Opacidad de los tramos: son fondo, no dato. */
const SEGMENT_OPACITY = 0.4;

/** Etiquetas de los extremos: 11 px, secundarias. */
const LABEL_STYLE = { fontSize: "var(--text-micro)", color: "var(--content-secondary)" };

export type RangeBarProps = {
  min: number;
  max: number;
  value: number;
  labels: { min: string; max: string };
  markers?: { value: number; color: string }[];
  variant?: "plain" | "segmented";
};

/** Fracción del rango ocupada por el valor, recortada a [0, 1]. */
function fraction(value: number, min: number, max: number): number {
  // Rango degenerado: no hay posición que signifique nada, así que al centro.
  if (max === min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** Fracción a porcentaje de CSS, sin cola de coma flotante. */
function percent(value: number): string {
  return `${Number((value * 100).toFixed(2))}%`;
}

export function RangeBar({ min, max, value, labels, markers, variant = "plain" }: RangeBarProps) {
  const position = fraction(value, min, max);
  const clamped = Math.min(max, Math.max(min, value));

  return (
    <div
      role="meter"
      aria-label={`Valor entre ${labels.min} y ${labels.max}`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamped}
      className="grid gap-1"
    >
      <div className="relative flex items-center">
        <div
          data-slot="range-bar-track"
          className="flex w-full overflow-hidden"
          style={{
            height: TRACK_HEIGHT,
            borderRadius: "var(--radius-pill)",
            backgroundColor: "var(--surface-raised)",
          }}
        >
          {variant === "segmented"
            ? SEGMENT_BANDS.map((band) => (
                <div
                  key={band}
                  data-slot="range-bar-segment"
                  className="h-full"
                  style={{
                    width: percent(1 / SEGMENT_BANDS.length),
                    backgroundColor: bandToken(band),
                    opacity: SEGMENT_OPACITY,
                  }}
                />
              ))
            : null}
        </div>
        {markers?.map((marker) => (
          <div
            key={`${marker.value}-${marker.color}`}
            data-slot="range-bar-marker"
            className="absolute w-px -translate-x-1/2"
            style={{
              left: percent(fraction(marker.value, min, max)),
              height: TRACK_HEIGHT,
              backgroundColor: marker.color,
            }}
          />
        ))}
        <div
          data-slot="range-bar-dot"
          className="absolute -translate-x-1/2 rounded-full"
          style={{
            left: percent(position),
            width: DOT_SIZE,
            height: DOT_SIZE,
            backgroundColor: "var(--content-primary)",
            border: "1px solid var(--bg)",
          }}
        />
      </div>
      <div className="flex justify-between">
        <span className="num" data-slot="range-bar-label" style={LABEL_STYLE}>
          {labels.min}
        </span>
        <span className="num" data-slot="range-bar-label" style={LABEL_STYLE}>
          {labels.max}
        </span>
      </div>
    </div>
  );
}
