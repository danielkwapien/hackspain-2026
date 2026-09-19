/**
 * Panel Comparativa: las empresas de `compare` en un solo `LineNoAxes`.
 *
 * Tres decisiones que se notan al leer el fichero:
 * - Una consulta por empresa con `useQueries` y la misma clave que Investigación
 *   (`["company-v2", id]`): seleccionar y comparar la misma empresa no la pide dos veces.
 * - El rango recorta los N últimos puntos de cada serie en el cliente; la API no
 *   pagina la `timeline`. `Base 100` es `normalize` de la primitiva, sin rehacer
 *   nada aquí. La Δ del periodo se calcula siempre en puntos de score sobre los
 *   puntos visibles, también con `Base 100`: el rebase es una lectura visual, no
 *   un cambio de magnitud.
 * - Con varias series el color es la identidad de la serie, no su régimen: los
 *   puntos van sin `regime` y el color sale de la posición en `compare`.
 */

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import { cn } from "cn";
import { fmtDelta, LineNoAxes } from "@/charts";
import type { LineSeries } from "@/charts";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { removeCompare, useSelection } from "@/dashboard/selection";
import type { CompanyV2 } from "@/lib/api-v2";
import { getCompanyV2 } from "@/lib/api-v2";

/* No existe un token de serie de comparativa: se reutilizan la línea del score, el
   acento y tres tonos desaturados de pilar, por orden de inserción en `compare`
   (máximo 5, `MAX_COMPARE`). Los pilares aquí no significan nada: solo prestan color. */
const SERIES_COLORS = [
  "var(--chart-score)",
  "var(--content-accent)",
  "var(--chart-pillar-collections)",
  "var(--chart-pillar-activity)",
  "var(--chart-pillar-debt)",
];

/** Rangos como los muestra Trade Republic; `points` es cuántos meses del final se dibujan. */
const RANGES = [
  { key: "3M", long: "3 meses", points: 4 },
  { key: "6M", long: "6 meses", points: 7 },
  { key: "1A", long: "1 año", points: 13 },
  { key: "Máx", long: "todo el histórico", points: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const DEFAULT_RANGE: RangeKey = "1A";

/* Alto de la gráfica: llena el hueco que deja la fila de controles, entre el alto de
   referencia de `--size-chart-large` (148) y un techo para que no se estire en pantallas
   altas. El JS lo necesita como número: `LineNoAxes` fija su `height` en píxeles. */
const MIN_CHART_HEIGHT = 148;
const MAX_CHART_HEIGHT = 360;

/** Serie mínima que se puede dibujar: una línea necesita dos puntos. */
const MIN_POINTS = 2;

/** Feedback de pulsación: encoge un 3 % mientras se mantiene, y vuelve en 150 ms. */
const PRESS_CLASS =
  "transition-[color,background-color,opacity,transform] duration-[var(--duration-fast)] active:scale-[.97]";

const TEXT_BUTTON_CLASS = cn(
  "rounded-[var(--radius-control)] px-2 text-[length:var(--text-control)] font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:hover)]:hover:bg-surface-glass-hover",
  PRESS_CLASS,
);

type CompareSeries = {
  id: string;
  name: string;
  color: string;
  points: LineSeries["points"];
};

/** Serie de una empresa, ya recortada al rango y con su color por posición. */
function seriesOf(company: CompanyV2, index: number, range: RangeKey): CompareSeries {
  const limit = RANGES.find((candidate) => candidate.key === range)?.points ?? null;
  const points = company.timeline.map((point) => ({ month: point.month, value: point.score }));
  return {
    id: company.company.company_id,
    name: company.company.name,
    color: SERIES_COLORS[index % SERIES_COLORS.length],
    points: limit === null ? points : points.slice(-limit),
  };
}

/**
 * Alto disponible del contenedor, acotado. El contenedor se monta después de cargar
 * (antes hay vacío o skeleton), por eso el ref es un callback y el efecto depende del
 * elemento. En jsdom el observador entrega 600 y cae al techo.
 */
function useChartHeight(): [(element: HTMLDivElement | null) => void, number] {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(MIN_CHART_HEIGHT);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = Math.floor(entry.contentRect.height);
      setHeight(Math.min(MAX_CHART_HEIGHT, Math.max(MIN_CHART_HEIGHT, available)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, height];
}

function LegendItem({ series }: { series: CompareSeries }): ReactElement {
  const first = series.points[0];
  const last = series.points.at(-1);
  const drawable = series.points.length >= MIN_POINTS;
  const delta = first && last ? fmtDelta(last.value - first.value) : null;

  return (
    <li className="animate-crossfade motion-reduce:animate-none flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-0.5 w-3 shrink-0"
        style={{ backgroundColor: series.color }}
      />
      <span
        className="max-w-[180px] truncate text-[length:var(--text-body)] text-content-primary"
        title={series.name}
      >
        {series.name}
      </span>
      {drawable && delta ? (
        <span
          className="font-mono text-[length:var(--text-control)] tabular-nums"
          style={{ color: delta.tone }}
        >
          {delta.text}
        </span>
      ) : (
        <span className="text-[length:var(--text-control)] text-content-secondary">
          Historia insuficiente
        </span>
      )}
      <button
        type="button"
        aria-label={`Quitar ${series.name}`}
        onClick={() => removeCompare(series.id)}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-content-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:hover)]:hover:text-content-primary",
          PRESS_CLASS,
        )}
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </li>
  );
}

function CompareSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-3 pt-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos</span>
      <div className="flex gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton
            key={index}
            className="h-5 w-28 rounded-[var(--radius-pill)] bg-surface-glass motion-reduce:animate-none"
          />
        ))}
      </div>
      <Skeleton
        className="w-full rounded-[var(--radius-card)] bg-surface-glass motion-reduce:animate-none"
        style={{ height: `${MIN_CHART_HEIGHT}px` }}
      />
    </div>
  );
}

export function ComparePanel(): ReactElement {
  const compare = useSelection((state) => state.compare);
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [normalize, setNormalize] = useState(false);
  const [chartRef, chartHeight] = useChartHeight();

  const queries = useQueries({
    queries: compare.map((id) => ({
      queryKey: ["company-v2", id],
      queryFn: () => getCompanyV2(id),
    })),
  });

  if (compare.length === 0) {
    return (
      <div key="empty" className="pt-2 text-[length:var(--text-body)] text-content-secondary">
        <p>Añade empresas desde la tabla</p>
        <p>Pasa por encima de una fila de Empresas y pulsa Comparar.</p>
      </div>
    );
  }

  const failed = queries.find((query) => query.isError);
  if (failed) {
    return (
      <ErrorState
        error={failed.error}
        context={`la empresa ${compare[queries.indexOf(failed)]}`}
        onRetry={() => void failed.refetch()}
      />
    );
  }

  if (queries.some((query) => query.isPending)) return <CompareSkeleton />;

  const series = queries.flatMap((query, index) =>
    query.data ? [seriesOf(query.data, index, range)] : [],
  );
  const drawable = series.filter((line) => line.points.length >= MIN_POINTS);
  const rangeLong = RANGES.find((candidate) => candidate.key === range)?.long ?? range;
  const label = `Score de ${series.length} ${series.length === 1 ? "empresa" : "empresas"} (${series
    .map((line) => line.name)
    .join(", ")}), rango ${rangeLong}`;

  /* `key="data"`: el bloque entra con cross-fade al pasar de vacío (o de carga) a datos,
     y NO se remonta al cambiar de rango o de Base 100: esos cambios se pintan de golpe. */
  return (
    <div key="data" className="animate-crossfade motion-reduce:animate-none flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 items-center justify-between gap-4"
        style={{ minHeight: "var(--size-row)" }}
      >
        <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
          {series.map((line) => (
            <LegendItem key={line.id} series={line} />
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2">
          <div role="group" aria-label="Rango" className="flex items-center">
            {RANGES.map((candidate) => (
              <button
                key={candidate.key}
                type="button"
                aria-pressed={range === candidate.key}
                onClick={() => setRange(candidate.key)}
                className={cn(
                  TEXT_BUTTON_CLASS,
                  "h-6",
                  range === candidate.key ? "text-content-primary" : "text-content-secondary",
                )}
              >
                {candidate.key}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={normalize}
            onClick={() => setNormalize((value) => !value)}
            className={cn(
              TEXT_BUTTON_CLASS,
              "h-6 rounded-[var(--radius-pill)] shadow-[inset_0_0_0_1px_var(--border-glass)]",
              normalize
                ? "bg-surface-glass-hover text-content-primary"
                : "bg-surface-glass text-content-secondary",
            )}
          >
            Base 100
          </button>
        </div>
      </div>

      <div ref={chartRef} className="min-h-0 flex-1">
        {drawable.length > 0 ? (
          <LineNoAxes
            series={drawable.map(({ id, color, points }) => ({ id, color, points }))}
            normalize={normalize}
            label={label}
            unit="pts"
            height={chartHeight}
          />
        ) : null}
      </div>
    </div>
  );
}
