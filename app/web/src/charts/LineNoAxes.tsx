/**
 * Serie temporal sin ejes: la gráfica grande del tablero.
 *
 * Dos capas superpuestas dentro de un contenedor `position: relative`:
 *
 * 1. SVG con `preserveAspectRatio="none"` (solo trazos: tramos de la serie,
 *    baseline, banda de outlook y su línea central). Todo trazo lleva
 *    `vector-effect="non-scaling-stroke"` para que el escalado horizontal no
 *    lo adelgace.
 * 2. HTML absoluto encima (marcadores, warm-up, crosshair y tooltip), porque
 *    con `preserveAspectRatio="none"` un `<circle>` se deformaría en elipse y
 *    un div no. La altura es fija, así que el `top` en píxeles es exacto.
 *
 * Sin leyenda: con dos o más series la leyenda la pone el widget consumidor,
 * no la primitiva.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChartTooltip } from "@/charts/ChartTooltip";
import { fmtMonthLong, fmtPoints } from "@/charts/format";
import { regimeToken, type Regime } from "@/charts/palette";
import { EMPTY_VALUE } from "@/lib/format";

/** Ancho del `viewBox`; el SVG se estira al ancho disponible. */
const VIEW_W = 600;
/** Respiro vertical para que el trazo y los marcadores no se corten. */
const PAD_Y = 8;
/** `--size-chart-large`. */
const DEFAULT_HEIGHT = 148;
/** Techo de opacidad de la banda de outlook. */
const BAND_OPACITY = 0.18;
/** Salida del hover: `--duration-fast`. */
const EXIT_DELAY_MS = 150;
/** Espacio fino (U+2009) entre la cifra y su unidad. */
const THIN_SPACE = " ";
/** El atributo `d` se anima por CSS; nunca en JS. */
const PATH_TRANSITION =
  "[transition:d_var(--duration-moderate)_var(--ease-enter)] motion-reduce:[transition:none]";

/** Régimen en palabras: el color nunca viaja solo (spec §6). */
const REGIME_LABELS: Record<Regime, string> = {
  improving: "mejora",
  deteriorating: "deterioro",
  blip: "bache",
  shock_pending: "bache sin confirmar",
  stable: "estable",
  recovering: "recuperación",
  warmup: "calentamiento",
};

export type LinePoint = { month: string; value: number; regime?: Regime };
export type LineSeries = { id: string; points: LinePoint[]; color?: string };
export type LineBaseline = { value: number; label?: string };
/** `low` y `high` van en paralelo a `points`, índice a índice. */
export type LineForecast = {
  from: string;
  points: { month: string; value: number }[];
  low: number[];
  high: number[];
};
export type LineMarker = { month: string; kind: "cap" | "alert" | "warmup"; color?: string };

/** Tramo homogéneo de régimen. */
export type LineSegment = { regime?: Regime; points: LinePoint[] };
/** Columna de la banda de outlook, con la X ya en unidades del `viewBox`. */
export type ForecastColumn = { x: number; low: number; center: number; high: number };

export type LineNoAxesProps = {
  series: LineSeries[];
  baseline?: LineBaseline;
  forecast?: LineForecast;
  markers?: LineMarker[];
  height?: number;
  normalize?: boolean;
  onHover?: (month: string | null) => void;
  /** Resumen del eje de tiempo; encabeza el `aria-label` y la tabla oculta. */
  label: string;
  unit?: string;
};

/** Eje de tiempo: todos los meses dibujados, en orden. */
export function chartMonths(series: readonly LineSeries[], forecast?: LineForecast): string[] {
  const months = new Set<string>();
  for (const line of series) {
    for (const point of line.points) months.add(point.month);
  }
  for (const point of forecast?.points ?? []) months.add(point.month);
  return [...months].sort();
}

/** X de un mes por su posición en el eje de tiempo. */
export function xAt(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index * VIEW_W) / (count - 1);
}

/** Igual que `xAt`, en porcentaje: la capa HTML se posiciona con `left: X%`. */
function pctAt(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index * 100) / (count - 1);
}

/**
 * Parte la serie en tramos de régimen. El punto donde cambia el régimen
 * pertenece a los dos tramos: así la línea no se rompe visualmente.
 */
export function regimeSegments(points: readonly LinePoint[]): LineSegment[] {
  const segments: LineSegment[] = [];
  for (const point of points) {
    const current = segments.at(-1);
    if (!current) {
      segments.push({ regime: point.regime, points: [point] });
      continue;
    }
    if (current.regime === point.regime) {
      current.points.push(point);
      continue;
    }
    current.points.push(point);
    segments.push({ regime: point.regime, points: [point] });
  }
  return segments;
}

/** Rebasa la serie a 100 en su primer punto. Sin base utilizable, se deja tal cual. */
export function rebaseSeries(series: LineSeries): LineSeries {
  const base = series.points[0]?.value;
  // `0`, `NaN` y la serie vacía caen aquí: no se divide por cero.
  if (!base || !Number.isFinite(base)) return series;
  return {
    ...series,
    points: series.points.map((point) => ({ ...point, value: (point.value * 100) / base })),
  };
}

/** Columnas de la banda de outlook, solo de `from` hacia delante. */
export function forecastArea(
  forecast: LineForecast,
  months: readonly string[],
): ForecastColumn[] {
  const fromIndex = months.indexOf(forecast.from);
  if (fromIndex < 0) return [];

  const columns: ForecastColumn[] = [];
  forecast.points.forEach((point, index) => {
    const at = months.indexOf(point.month);
    // La banda nunca se dibuja sobre el pasado.
    if (at < fromIndex) return;
    columns.push({
      x: xAt(at, months.length),
      center: point.value,
      low: forecast.low[index] ?? point.value,
      high: forecast.high[index] ?? point.value,
    });
  });
  return columns;
}

/** Escala vertical: el dominio son los valores dibujados, sin eje que mostrar. */
function yScale(values: readonly number[], height: number): (value: number) => number {
  const usable = values.filter((value) => Number.isFinite(value));
  const min = usable.length > 0 ? Math.min(...usable) : 0;
  const max = usable.length > 0 ? Math.max(...usable) : 1;
  const span = max - min || 1;
  const inner = height - PAD_Y * 2;
  return (value: number) => height - PAD_Y - ((value - min) / span) * inner;
}

/** Cifra con la unidad de la gráfica: `fmtPoints` fija el formato, la unidad es del dominio. */
function fmtValue(value: number, unit: string): string {
  const [figure] = fmtPoints(value).split(THIN_SPACE);
  return `${figure}${THIN_SPACE}${unit}`;
}

function pathD(
  points: readonly LinePoint[],
  months: readonly string[],
  y: (value: number) => number,
): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${xAt(months.indexOf(point.month), months.length)},${y(point.value)}`,
    )
    .join(" ");
}

export function LineNoAxes({
  series,
  baseline,
  forecast,
  markers = [],
  height = DEFAULT_HEIGHT,
  normalize = false,
  onHover,
  label,
  unit = "pts",
}: LineNoAxesProps) {
  const { drawn, months, band, y } = useMemo(() => {
    const scaled = normalize ? series.map(rebaseSeries) : series;
    const axis = chartMonths(scaled, forecast);
    const columns = forecast ? forecastArea(forecast, axis) : [];
    const values = [
      ...scaled.flatMap((line) => line.points.map((point) => point.value)),
      ...columns.flatMap((column) => [column.low, column.center, column.high]),
      ...(baseline ? [baseline.value] : []),
    ];
    return { drawn: scaled, months: axis, band: columns, y: yScale(values, height) };
  }, [series, forecast, baseline, normalize, height]);

  const [active, setActive] = useState<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<number | null>(null);

  useEffect(() => () => window.clearTimeout(exitRef.current ?? undefined), []);

  function cancelExit() {
    if (exitRef.current !== null) window.clearTimeout(exitRef.current);
    exitRef.current = null;
  }

  /** El puntero apunta a una X, no a la línea: manda el mes más cercano. */
  function pick(clientX: number) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || months.length === 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const index = Math.min(
      months.length - 1,
      Math.max(0, Math.round(ratio * (months.length - 1))),
    );
    cancelExit();
    setActive(index);
    onHover?.(months[index]);
  }

  function scheduleExit() {
    cancelExit();
    exitRef.current = window.setTimeout(() => {
      setActive(null);
      onHover?.(null);
    }, EXIT_DELAY_MS);
  }

  const activeMonth = active === null ? null : months[active];
  const rows =
    activeMonth === null
      ? []
      : drawn
          .map((line) => {
            const point = line.points.find((candidate) => candidate.month === activeMonth);
            if (!point) return null;
            return {
              label: point.regime ? REGIME_LABELS[point.regime] : line.id,
              value: fmtValue(point.value, unit),
              color: point.regime ? regimeToken(point.regime) : (line.color ?? "var(--chart-1)"),
            };
          })
          .filter((row) => row !== null);

  const first = drawn[0]?.points[0];
  const last = drawn[0]?.points.at(-1);
  const summary = [
    label,
    first && last ? `de ${fmtValue(first.value, unit)} a ${fmtValue(last.value, unit)}` : null,
    last?.regime ? `régimen ${REGIME_LABELS[last.regime]}` : null,
  ]
    .filter((part) => part !== null)
    .join(", ");

  const splitX = forecast ? xAt(months.indexOf(forecast.from), months.length) : null;
  const warmupUntil = markers.filter((marker) => marker.kind === "warmup").at(-1);

  return (
    <div
      ref={surfaceRef}
      data-slot="line-no-axes"
      style={{ position: "relative", width: "100%", height: `${height}px` }}
      onPointerMove={(event) => pick(event.clientX)}
      // En táctil no hay `pointermove` sin presión: el tooltip se mantiene
      // desde `pointerdown` hasta `pointerup`.
      onPointerDown={(event) => pick(event.clientX)}
      onPointerUp={scheduleExit}
      onPointerLeave={scheduleExit}
    >
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        focusable="false"
        style={{ display: "block", width: "100%", height: `${height}px` }}
      >
        {band.length > 1 && (
          <polygon
            data-slot="forecast-band"
            points={[
              ...band.map((column) => `${column.x},${y(column.high)}`),
              ...[...band].reverse().map((column) => `${column.x},${y(column.low)}`),
            ].join(" ")}
            fillOpacity={BAND_OPACITY}
            style={{ fill: "var(--chart-2)" }}
          />
        )}

        {band.length > 1 && (
          <polyline
            data-slot="forecast-center"
            points={band.map((column) => `${column.x},${y(column.center)}`).join(" ")}
            strokeWidth={1}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
            style={{ fill: "none", stroke: "var(--chart-2)" }}
          />
        )}

        {splitX !== null && (
          <line
            data-slot="forecast-split"
            x1={splitX}
            x2={splitX}
            y1={0}
            y2={height}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ stroke: "var(--alpha-white-10)" }}
          />
        )}

        {baseline && (
          // Referencia, no rejilla: el guion está reservado a este caso (spec §6).
          <line
            data-slot="baseline"
            x1={0}
            x2={VIEW_W}
            y1={y(baseline.value)}
            y2={y(baseline.value)}
            strokeWidth={1}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
            style={{ stroke: "var(--content-tertiary)" }}
          />
        )}

        {drawn.flatMap((line) =>
          regimeSegments(line.points).map((segment, index) => (
            <path
              key={`${line.id}-${index}`}
              data-slot="line-segment"
              className={PATH_TRANSITION}
              d={pathD(segment.points, months, y)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{
                fill: "none",
                stroke: segment.regime
                  ? regimeToken(segment.regime)
                  : (line.color ?? "var(--chart-1)"),
              }}
            />
          )),
        )}
      </svg>

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {warmupUntil && (
          <div
            data-slot="marker-warmup"
            style={{
              position: "absolute",
              left: "0%",
              top: 0,
              bottom: 0,
              width: `${pctAt(months.indexOf(warmupUntil.month), months.length)}%`,
              backgroundColor: "var(--alpha-white-5)",
            }}
          />
        )}

        {markers
          .filter((marker) => marker.kind !== "warmup")
          .map((marker, index) => {
            const at = months.indexOf(marker.month);
            const point = drawn[0]?.points.find((candidate) => candidate.month === marker.month);
            if (at < 0 || !point) return null;
            const fallback =
              marker.kind === "cap" ? "var(--content-negative)" : "var(--content-alert)";
            return (
              <div
                key={`${marker.kind}-${marker.month}-${index}`}
                data-slot={`marker-${marker.kind}`}
                style={{
                  position: "absolute",
                  left: `${pctAt(at, months.length)}%`,
                  top: `${y(point.value)}px`,
                  width: "4px",
                  height: "4px",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: marker.color ?? fallback,
                  // Anillo de 2 px en color de superficie: marca superpuesta y
                  // 8 px de diámetro exterior (spec §6).
                  boxShadow: "0 0 0 2px var(--bg)",
                  transform: "translate(-50%, -50%)",
                }}
              />
            );
          })}

        {baseline?.label && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: `${y(baseline.value)}px`,
              transform: "translateY(-100%)",
              fontSize: "var(--text-micro)",
              color: "var(--content-tertiary)",
            }}
          >
            {baseline.label}
          </div>
        )}

        {active !== null && (
          <div
            data-slot="crosshair"
            style={{
              position: "absolute",
              left: `${pctAt(active, months.length)}%`,
              top: 0,
              bottom: 0,
              width: "1px",
              backgroundColor: "var(--alpha-white-30)",
            }}
          />
        )}

        {activeMonth !== null && rows.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${height}px`,
              height: 0,
            }}
          >
            <ChartTooltip
              month={activeMonth}
              rows={rows}
              x={pctAt(active ?? 0, months.length)}
              side="top"
            />
          </div>
        )}
      </div>

      {/* Vista de tabla: ningún valor se queda detrás del hover. */}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            {drawn.map((line) => (
              <th key={line.id} scope="col">
                {line.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month}>
              <th scope="row">{fmtMonthLong(month)}</th>
              {drawn.map((line) => {
                const point = line.points.find((candidate) => candidate.month === month);
                return (
                  <td key={line.id}>{point ? fmtValue(point.value, unit) : EMPTY_VALUE}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
