/**
 * La gráfica de la ficha con su fila de controles: `Segmented` «Rango» a la izquierda
 * y, si el modo lo trae, el menú de métrica a la derecha. Debajo, `LineNoAxes` con la
 * serie completa más `from`, para que `d` conserve sus comandos al cambiar de rango.
 *
 * `scoreChart` y `pillarChart` construyen lo que se dibuja: el score (de empresa o
 * consolidado de grupo) con su forecast y marcadores, o un pilar en `100·P_k` con el
 * score fantasma detrás (sin régimen, banda ni marcadores). Sin gráfica se enseña un
 * mensaje en su misma caja para que la ficha no salte. `SheetSkeleton` vive aquí
 * porque comparte la caja de la gráfica.
 */

import type { ReactElement, ReactNode } from "react";
import { AXIS_HEIGHT, LineNoAxes, fmtMonth } from "@/charts";
import type { LineBaseline, LineForecast, LineMarker, LineSeries } from "@/charts";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import type { GroupTimelinePoint, Pillar, TimelineRow } from "@/lib/api-v2";
import { FAMILY_LABEL, PILLAR_TOKEN } from "@/lib/definitions";
import type { RangeLabel } from "@/panels/research/series";
import { RANGES, pillarSeries, visibleSlice } from "@/panels/research/series";

/** Meses mínimos de score para dibujar una trayectoria. */
export const MIN_HISTORY = 3;
export const HISTORY_MESSAGE = "Historia insuficiente: hacen falta tres meses de score";
export const PILLAR_MESSAGE = "El pilar no aplica a esta empresa";

/**
 * Alto fijo de la gráfica, entre `--size-chart-large` (148) y el techo de 260.
 * Medirlo con `ResizeObserver` retroalimenta: el contenedor crece con su propio
 * contenido y la gráfica pisa las secciones de abajo.
 */
export const CHART_HEIGHT = 168;

const RANGE_OPTIONS = RANGES.map((range) => ({ value: range.label, label: range.label }));

export type ChartSpec = {
  series: LineSeries[];
  from: string;
  baseline: LineBaseline;
  forecast?: LineForecast;
  markers?: LineMarker[];
  label: string;
};

function baselineOf(points: readonly { month: string; value: number }[], from: string): LineBaseline {
  const first = points.find((point) => point.month >= from) ?? points[0];
  return { value: first.value, label: fmtMonth(first.month) };
}

/** Score con régimen por tramo, forecast y marcadores; `null` con menos de tres meses. */
export function scoreChart(
  rows: readonly (TimelineRow | GroupTimelinePoint)[],
  range: RangeLabel,
  extras: { forecast: LineForecast; markers?: LineMarker[]; label: string },
): ChartSpec | null {
  const points = rows.flatMap((row) =>
    row.score === null
      ? []
      : [{ month: row.month, value: row.score, regime: row.regime ?? undefined }],
  );
  if (points.length < MIN_HISTORY) return null;
  const from = visibleSlice(points, range)[0]?.month ?? points[0].month;
  return {
    series: [{ id: "score", points }],
    from,
    baseline: baselineOf(points, from),
    ...extras,
  };
}

/** `100·P_k` con el token del pilar y el score detrás en gris; `null` si el pilar no aplica. */
export function pillarChart(
  rows: readonly TimelineRow[],
  pillar: Pillar,
  range: RangeLabel,
  name: string,
): ChartSpec | null {
  if (rows.length < MIN_HISTORY) return null;
  const points = pillarSeries(
    rows.flatMap((row) => (row.pillars === null ? [] : [{ month: row.month, pillars: row.pillars }])),
    pillar,
  );
  if (points.length === 0) return null;
  const from = visibleSlice(points, range)[0]?.month ?? points[0].month;
  return {
    series: [
      {
        id: "Health score",
        points: rows.flatMap((row) =>
          row.score === null ? [] : [{ month: row.month, value: row.score }],
        ),
        color: "var(--content-disabled)",
      },
      { id: FAMILY_LABEL[pillar], points, color: PILLAR_TOKEN[pillar] },
    ],
    from,
    baseline: baselineOf(points, from),
    label: `${FAMILY_LABEL[pillar]} de ${name} frente al Health score, ${range}`,
  };
}

export function SheetChart({
  range,
  onRange,
  menu,
  chart,
  message,
  activeMonth,
  onHover,
}: {
  range: RangeLabel;
  onRange: (range: RangeLabel) => void;
  /** El menú de métrica en modo empresa; el grupo no lo trae. */
  menu?: ReactNode;
  chart: ChartSpec | null;
  /** Qué decir cuando no hay gráfica. */
  message: string;
  activeMonth: string | null;
  onHover: (month: string | null) => void;
}): ReactElement {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border-glass pt-3">
      <div className="flex items-center justify-between gap-3">
        <Segmented value={range} options={RANGE_OPTIONS} onChange={onRange} label="Rango" />
        {menu}
      </div>

      {chart === null ? (
        <p
          className="flex items-center text-[length:var(--text-control)] text-content-secondary"
          style={{ height: CHART_HEIGHT + AXIS_HEIGHT }}
        >
          {message}
        </p>
      ) : (
        <div
          className="relative shrink-0 overflow-hidden"
          style={{ height: CHART_HEIGHT + AXIS_HEIGHT }}
        >
          <LineNoAxes
            series={chart.series}
            from={chart.from}
            baseline={chart.baseline}
            forecast={chart.forecast}
            markers={chart.markers}
            height={CHART_HEIGHT}
            activeMonth={activeMonth}
            tooltip={false}
            onHover={onHover}
            label={chart.label}
            unit="pts"
          />
        </div>
      )}
    </div>
  );
}

/** Skeleton con la forma de la ficha: cabecera, caja de la gráfica y cinco celdas. */
export function SheetSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-3 pt-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos</span>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="w-full" style={{ height: CHART_HEIGHT + AXIS_HEIGHT }} />
      <div className="grid grid-cols-5 gap-x-3 pt-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
