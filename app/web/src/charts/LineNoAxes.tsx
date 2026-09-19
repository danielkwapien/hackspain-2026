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
 * Debajo del SVG, un eje de fechas de `AXIS_HEIGHT` px (`axis`), sin línea: solo
 * etiquetas `mes año` colocadas por porcentaje.
 *
 * `series` recibe la timeline completa y `from` decide qué meses se ven. El eje de
 * tiempo (`buildTimeScale`) no cambia con el rango, así que cada `<path>` lleva **un
 * comando por mes del eje completo**: los meses ocultos colapsan a `x = 0` y a la `y`
 * del primer punto visible, y los meses fuera del tramo repiten su extremo. Con el
 * mismo número de comandos en todos los rangos, `transition: d` interpola la forma.
 *
 * Sin leyenda: con dos o más series la leyenda la pone el widget consumidor,
 * no la primitiva.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChartTooltip } from "@/charts/ChartTooltip";
import { fmtMonthLong, fmtMonthShort, fmtPoints } from "@/charts/format";
import { regimeToken, type Regime } from "@/charts/palette";
import { AXIS_HEIGHT, axisTicks, buildTimeScale, type TimeScale } from "@/charts/time-scale";
import { EMPTY_VALUE } from "@/lib/format";

/** Ancho del `viewBox`; el SVG se estira al ancho disponible. */
const VIEW_W = 600;
/** Respiro vertical para que el trazo y los marcadores no se corten. */
const PAD_Y = 8;
/** `--size-chart-large`. */
const DEFAULT_HEIGHT = 148;
/** Recorrido vertical minimo por defecto, en puntos de score. */
const DEFAULT_MIN_SPAN = 10;
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
  /** Primer mes visible; sin él se ve toda la historia. */
  from?: string;
  /** Eje de fechas bajo la gráfica; por defecto `true`. */
  axis?: boolean;
  onHover?: (month: string | null) => void;
  /**
   * Mes del crosshair en modo controlado (cuando no es `undefined`): el puntero solo
   * avisa por `onHover` y el padre decide; `null` apaga el crosshair.
   */
  activeMonth?: string | null;
  /** `false` cuando la cabecera del widget ya enseña el valor del mes activo. */
  tooltip?: boolean;
  /** Resumen del eje de tiempo; encabeza el `aria-label` y la tabla oculta. */
  label: string;
  unit?: string;
  /**
   * Recorrido vertical minimo del dominio, en unidades del dato. Evita que una
   * serie plana se amplifique hasta parecer volatil. Por defecto 10, que es lo
   * que pide un score de 0 a 100: un vaiven de 0,5 pts ocupa un 5 % del alto y
   * se lee plano, y una caida de 30 pts sigue llenando la grafica.
   */
  minSpan?: number;
};

/** Historia: todos los meses con dato de alguna serie, en orden. */
function historyMonths(series: readonly LineSeries[]): string[] {
  const months = new Set<string>();
  for (const line of series) {
    for (const point of line.points) months.add(point.month);
  }
  return [...months].sort();
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

/** Rebasa la serie a 100 en su primer punto visible. Sin base utilizable, se deja tal cual. */
export function rebaseSeries(series: LineSeries, from?: string): LineSeries {
  const origin =
    from === undefined ? series.points[0] : series.points.find((point) => point.month >= from);
  const base = origin?.value;
  // `0`, `NaN` y la serie vacía caen aquí: no se divide por cero.
  if (!base || !Number.isFinite(base)) return series;
  return {
    ...series,
    points: series.points.map((point) => ({ ...point, value: (point.value * 100) / base })),
  };
}

/** Columnas de la banda de outlook, solo de `from` hacia delante. */
export function forecastArea(forecast: LineForecast, scale: TimeScale): ForecastColumn[] {
  if (!scale.axis.includes(forecast.from)) return [];

  const columns: ForecastColumn[] = [];
  forecast.points.forEach((point, index) => {
    // La banda nunca se dibuja sobre el pasado.
    if (point.month < forecast.from || !scale.axis.includes(point.month)) return;
    columns.push({
      x: scale.x(point.month),
      center: point.value,
      low: forecast.low[index] ?? point.value,
      high: forecast.high[index] ?? point.value,
    });
  });
  return columns;
}

/**
 * Escala vertical: el dominio son los valores dibujados, sin eje que mostrar.
 *
 * Con `minSpan` el dominio nunca se estrecha por debajo de ese recorrido, y los
 * datos quedan centrados dentro de el. Sin ese suelo, una serie plana se estira
 * hasta llenar el alto y un regimen `stable` de 0,7 pts se dibuja como un
 * terremoto: la grafica no tiene ejes que delaten la escala, asi que el lector
 * no tiene forma de saber que esta viendo ruido amplificado.
 */
function yScale(
  values: readonly number[],
  height: number,
  minSpan: number,
): (value: number) => number {
  const usable = values.filter((value) => Number.isFinite(value));
  const dataMin = usable.length > 0 ? Math.min(...usable) : 0;
  const dataMax = usable.length > 0 ? Math.max(...usable) : 1;
  const span = Math.max(dataMax - dataMin, minSpan, Number.EPSILON);
  const mid = (dataMin + dataMax) / 2;
  const min = mid - span / 2;
  const inner = height - PAD_Y * 2;
  return (value: number) => height - PAD_Y - ((value - min) / span) * inner;
}

/** Cifra con la unidad de la gráfica: `fmtPoints` fija el formato, la unidad es del dominio. */
function fmtValue(value: number, unit: string): string {
  const [figure] = fmtPoints(value).split(THIN_SPACE);
  return `${figure}${THIN_SPACE}${unit}`;
}

/** `M x,y L x,y …` a partir de pares ya en unidades del `viewBox`. */
function pathOf(pairs: readonly (readonly [number, number])[]): string {
  return pairs.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(" ");
}

/**
 * Un comando por mes del eje completo. Los meses anteriores al primer punto del tramo
 * repiten ese punto y los posteriores al último repiten el último (no dibujan nada);
 * los meses ocultos colapsan a `x = 0` con la `y` del primer punto visible de la serie.
 */
function segmentD(
  points: readonly LinePoint[],
  scale: TimeScale,
  y: (value: number) => number,
  hiddenY: number,
): string {
  const visible = new Set(scale.visible);
  let cursor = 0;
  const pairs = scale.axis.map((month) => {
    while (cursor + 1 < points.length && points[cursor + 1].month <= month) cursor += 1;
    const point = points[cursor];
    return visible.has(point.month)
      ? ([scale.x(point.month), y(point.value)] as const)
      : ([0, hiddenY] as const);
  });
  return pathOf(pairs);
}

export function LineNoAxes({
  series,
  baseline,
  forecast,
  markers = [],
  height = DEFAULT_HEIGHT,
  normalize = false,
  from,
  axis = true,
  onHover,
  activeMonth,
  tooltip = true,
  label,
  unit = "pts",
  minSpan = DEFAULT_MIN_SPAN,
}: LineNoAxesProps) {
  const { drawn, scale, band, y } = useMemo(() => {
    const scaled = normalize ? series.map((line) => rebaseSeries(line, from)) : series;
    const timeScale = buildTimeScale({
      history: historyMonths(scaled),
      forecast: forecast?.points.map((point) => point.month),
      from,
    });
    const columns = forecast ? forecastArea(forecast, timeScale) : [];
    const shown = new Set(timeScale.visible);
    // Escala vertical sobre lo visible: lo oculto no debe encoger la gráfica.
    const values = [
      ...scaled.flatMap((line) =>
        line.points.filter((point) => shown.has(point.month)).map((point) => point.value),
      ),
      ...columns.flatMap((column) => [column.low, column.center, column.high]),
      ...(baseline ? [baseline.value] : []),
    ];
    return { drawn: scaled, scale: timeScale, band: columns, y: yScale(values, height, minSpan) };
  }, [series, forecast, baseline, normalize, from, height, minSpan]);

  const visible = new Set(scale.visible);
  const [hovered, setHovered] = useState<string | null>(null);
  const controlled = activeMonth !== undefined;
  const active = controlled
    ? activeMonth != null && visible.has(activeMonth)
      ? activeMonth
      : null
    : hovered;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<number | null>(null);

  useEffect(() => () => window.clearTimeout(exitRef.current ?? undefined), []);

  function cancelExit() {
    if (exitRef.current !== null) window.clearTimeout(exitRef.current);
    exitRef.current = null;
  }

  /** El puntero apunta a una X, no a la línea: manda el mes visible más cercano. */
  function pick(clientX: number) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || scale.visible.length === 0) return;
    const month = scale.nearest((clientX - rect.left) / rect.width);
    cancelExit();
    if (!controlled) setHovered(month);
    onHover?.(month);
  }

  function scheduleExit() {
    cancelExit();
    exitRef.current = window.setTimeout(() => {
      if (!controlled) setHovered(null);
      onHover?.(null);
    }, EXIT_DELAY_MS);
  }

  const shownMonth = active;
  const rows =
    shownMonth === null || !tooltip
      ? []
      : drawn
          .map((line) => {
            const point = line.points.find((candidate) => candidate.month === shownMonth);
            if (!point) return null;
            return {
              label: point.regime ? REGIME_LABELS[point.regime] : line.id,
              value: fmtValue(point.value, unit),
              color: point.regime ? regimeToken(point.regime) : (line.color ?? "var(--chart-1)"),
            };
          })
          .filter((row) => row !== null);

  const shownPoints = drawn[0]?.points.filter((point) => visible.has(point.month)) ?? [];
  const first = shownPoints[0];
  const last = shownPoints.at(-1);
  const summary = [
    label,
    first && last ? `de ${fmtValue(first.value, unit)} a ${fmtValue(last.value, unit)}` : null,
    last?.regime ? `régimen ${REGIME_LABELS[last.regime]}` : null,
  ]
    .filter((part) => part !== null)
    .join(", ");

  const splitX = forecast && scale.axis.includes(forecast.from) ? scale.x(forecast.from) : null;
  const warmupUntil = markers.filter((marker) => marker.kind === "warmup").at(-1);
  const ticks = axis ? axisTicks(scale) : [];

  return (
    <div style={{ width: "100%" }}>
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
            <path
              data-slot="forecast-band"
              className={PATH_TRANSITION}
              d={`${pathOf([
                ...band.map((column) => [column.x, y(column.high)] as const),
                ...[...band].reverse().map((column) => [column.x, y(column.low)] as const),
              ])} Z`}
              fillOpacity={BAND_OPACITY}
              style={{ fill: "var(--chart-2)" }}
            />
          )}

          {band.length > 1 && (
            <path
              data-slot="forecast-center"
              className={PATH_TRANSITION}
              d={pathOf(band.map((column) => [column.x, y(column.center)] as const))}
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
            <path
              data-slot="baseline"
              className={PATH_TRANSITION}
              d={pathOf([
                [0, y(baseline.value)],
                [VIEW_W, y(baseline.value)],
              ])}
              strokeWidth={1.3}
              strokeDasharray="0 3.6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ fill: "none", stroke: "var(--content-disabled)" }}
            />
          )}

          {drawn.flatMap((line) => {
            const firstShown = line.points.find((point) => visible.has(point.month));
            const hiddenY = y(firstShown?.value ?? line.points[0]?.value ?? 0);
            return regimeSegments(line.points).map((segment, index) => (
              <path
                key={`${line.id}-${index}`}
                data-slot="line-segment"
                className={PATH_TRANSITION}
                d={segmentD(segment.points, scale, y, hiddenY)}
                // Un tramo sin ningún mes visible es solo comandos degenerados: no se pinta.
                strokeOpacity={segment.points.some((point) => visible.has(point.month)) ? 1 : 0}
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
            ));
          })}
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
                width: `${scale.pct(warmupUntil.month)}%`,
                backgroundColor: "var(--alpha-white-5)",
              }}
            />
          )}

          {markers
            .filter((marker) => marker.kind !== "warmup")
            .map((marker, index) => {
              const point = drawn[0]?.points.find((candidate) => candidate.month === marker.month);
              if (!visible.has(marker.month) || !point) return null;
              const fallback =
                marker.kind === "cap" ? "var(--content-negative)" : "var(--content-alert)";
              return (
                <div
                  key={`${marker.kind}-${marker.month}-${index}`}
                  data-slot={`marker-${marker.kind}`}
                  style={{
                    position: "absolute",
                    left: `${scale.pct(marker.month)}%`,
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
                left: `${scale.pct(active)}%`,
                top: 0,
                bottom: 0,
                width: "1px",
                backgroundColor: "var(--alpha-white-30)",
              }}
            />
          )}

          {shownMonth !== null && rows.length > 0 && (
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
                month={shownMonth}
                rows={rows}
                x={scale.pct(shownMonth)}
                side="top"
              />
            </div>
          )}
        </div>
      </div>

      {axis && (
        // Sin línea de eje: solo etiquetas, colocadas por porcentaje como la capa HTML.
        <div
          data-slot="x-axis"
          aria-hidden="true"
          style={{ position: "relative", width: "100%", height: `${AXIS_HEIGHT}px` }}
        >
          {ticks.map((tick, index) => (
            <span
              key={tick.month}
              className="num"
              style={{
                position: "absolute",
                top: 0,
                left: `${scale.pct(tick.month)}%`,
                // Los extremos se pegan al borde para que ninguna etiqueta se salga.
                transform:
                  index === 0
                    ? "translateX(0)"
                    : index === ticks.length - 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                lineHeight: `${AXIS_HEIGHT}px`,
                whiteSpace: "nowrap",
                fontSize: "var(--text-micro)",
                color: tick.muted ? "var(--content-tertiary)" : "var(--content-secondary)",
              }}
            >
              {fmtMonthShort(tick.month)}
            </span>
          ))}
        </div>
      )}

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
          {scale.visible.map((month) => (
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
