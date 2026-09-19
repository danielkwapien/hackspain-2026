/**
 * Sparkline: una serie en 64x16, sin ejes, sin puntos y sin relleno.
 *
 * El color lo decide el signo del Δ del rango y lo resuelve `fmtDelta`, que ya
 * es el único sitio donde vive el umbral de neutro. El `aria-label` nombra la
 * dirección en palabras: el verde y el rojo quedan a ΔE 6,2 en deutan, banda que
 * solo es legal con codificación secundaria obligatoria (spec §6).
 */

import { memo } from "react";
import { fmtDelta } from "@/charts/format";
import { regimeToken, type Regime } from "@/charts/palette";

/** Espejo numérico de `--size-sparkline-w`: el `viewBox` necesita un número. */
const DEFAULT_WIDTH = 64;
/** Espejo numérico de `--size-sparkline-h`. */
const DEFAULT_HEIGHT = 16;

const STROKE_WIDTH = 1.5;
/** Media línea de margen, para que el trazo no se corte contra el borde. */
const PAD = STROKE_WIDTH / 2;
/** Radio del punto final: 2 px de diámetro. */
const DOT_RADIUS = 1;

/** Dirección del Δ en palabras, la codificación secundaria del color. */
const DIRECTION: Record<-1 | 0 | 1, string> = {
  1: "Sparkline que sube",
  [-1]: "Sparkline que baja",
  0: "Sparkline estable",
};

export type SparklineProps = {
  points: readonly (number | null)[];
  /** Ancho en px; por defecto `--size-sparkline-w`. */
  width?: number;
  /** Alto en px; por defecto `--size-sparkline-h`. */
  height?: number;
  /** Si se pasa, el color sale del régimen en vez del signo del Δ. */
  regime?: Regime | null;
  /** Marca el último punto. */
  dot?: boolean;
};

/** Dos decimales como máximo, sin ceros de relleno: `32`, no `32.00`. */
function round(value: number): number {
  return Number(value.toFixed(2));
}

/** Proyecta la serie sobre el lienzo. Una serie plana va por el centro. */
function project(
  points: readonly (number | null)[],
  width: number,
  height: number,
): ({ x: number; y: number } | null)[] {
  const innerWidth = width - PAD * 2;
  const innerHeight = height - PAD * 2;
  const values = points.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  return points.map((value, index) => value === null || !Number.isFinite(value) ? null : ({
    x: round(PAD + index * step),
    y: round(span === 0 ? PAD + innerHeight / 2 : PAD + innerHeight * (1 - (value - min) / span)),
  }));
}

/**
 * Geometría pura de la serie: el atributo `d` del trazo dentro del lienzo dado.
 * Una serie vacía no dibuja nada.
 */
export function sparklinePath(points: readonly (number | null)[], width: number, height: number): string {
  if (points.length === 0) return "";

  return project(points, width, height)
    .flatMap((point, index, projected) => point === null ? [] : [`${index === 0 || projected[index - 1] === null ? "M" : "L"} ${point.x} ${point.y}`])
    .join(" ");
}

export const Sparkline = memo(function Sparkline({
  points,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  regime,
  dot = false,
}: SparklineProps) {
  const first = points.at(0);
  const last = points.at(-1);
  const hasTrend = points.length > 1 && first != null && last != null;
  const delta = fmtDelta(hasTrend ? last - first : null);
  const color = regime ? regimeToken(regime) : delta.tone;

  const d = sparklinePath(points, width, height);
  const tip = dot ? project(points, width, height).at(-1) : undefined;

  return (
    <svg
      role="img"
      aria-label={hasTrend ? `${DIRECTION[delta.sign]}, ${delta.text}` : "Sin trayectoria publicada"}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{
        width: width === DEFAULT_WIDTH ? "var(--size-sparkline-w)" : `${width}px`,
        height: height === DEFAULT_HEIGHT ? "var(--size-sparkline-h)" : `${height}px`,
      }}
    >
      <path
        d={d}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ fill: "none", stroke: color }}
      />
      {tip ? <circle cx={tip.x} cy={tip.y} r={DOT_RADIUS} style={{ fill: color }} /> : null}
    </svg>
  );
});
