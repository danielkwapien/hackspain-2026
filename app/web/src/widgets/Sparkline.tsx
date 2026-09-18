/**
 * Sparkline de una fila: SVG puro, sin librería de gráficos.
 *
 * Es decoración del dato, no el dato: la cifra ya está escrita al lado, así que
 * el SVG queda fuera del árbol de accesibilidad (`aria-hidden`).
 */

import type { ReactElement } from "react";

const STROKE_WIDTH = 1.5;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function Sparkline({
  values,
  width = 64,
  height = 16,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}): ReactElement | null {
  // Un solo punto no dibuja una línea: mejor nada que una raya plana que miente.
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  // El trazo se centra en su coordenada: medio grosor de margen arriba y abajo.
  const usable = height - STROKE_WIDTH;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const ratio = span === 0 ? 0.5 : (value - min) / span;
      const y = STROKE_WIDTH / 2 + (1 - ratio) * usable;
      return `${round(x)},${round(y)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      role="presentation"
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <polyline
        points={points}
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
