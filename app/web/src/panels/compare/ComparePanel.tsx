/**
 * Panel Comparativa: dos slots A/B (`compare` del store) en un solo `LineNoAxes`.
 *
 * Tres decisiones que se notan al leer el fichero:
 * - A vacío sigue a `selected`; fijar A desde el picker anula la selección. Una consulta
 *   por empresa con `useQueries` y la misma clave que Investigación (`companyKey`):
 *   seleccionar y comparar la misma empresa no la pide dos veces.
 * - El rango no recorta nada: la primitiva recibe la serie completa y `from`, el
 *   primer mes de los N últimos de la serie más larga (así los comandos de cada `d`
 *   no cambian y la transición se anima). `Base 100` es `normalize` de la primitiva,
 *   sin rehacer nada aquí. La Δ del periodo se calcula siempre en puntos de score
 *   sobre los puntos visibles, también con `Base 100`: el rebase es una lectura
 *   visual, no un cambio de magnitud.
 * - El color es la identidad del slot, no el régimen: A va en la línea del score y B en
 *   el acento, y los puntos van sin `regime`.
 */

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import { cn } from "cn";
import { AXIS_HEIGHT, fmtDelta, LineNoAxes } from "@/charts";
import type { LineSeries } from "@/charts";
import { CompanyPicker } from "@/components/CompanyPicker";
import { ErrorState } from "@/components/states";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { setCompareSlot, useSelection } from "@/dashboard/selection";
import type { CompareSlot } from "@/dashboard/selection";
import type { CompanyV2, UniverseItem } from "@/lib/api-v2";
import { getCompanyV2 } from "@/lib/api-v2";
import { companyKey } from "@/lib/query-keys";

/* No existe un token de serie de comparativa: A presta la línea del score y B el acento. */
const SLOT_COLORS: Record<CompareSlot, string> = {
  0: "var(--chart-score)",
  1: "var(--content-accent)",
};

/** Rangos como los muestra Trade Republic; `points` es cuántos meses del final se dibujan. */
const RANGES = [
  { key: "3M", long: "3 meses", points: 4 },
  { key: "6M", long: "6 meses", points: 7 },
  { key: "1A", long: "1 año", points: 13 },
  { key: "Máx", long: "todo el histórico", points: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const DEFAULT_RANGE: RangeKey = "1A";

const RANGE_OPTIONS = RANGES.map((range) => ({ value: range.key, label: range.key }));

/* Alto de la gráfica: llena el hueco que deja la fila de controles, entre el alto de
   referencia de `--size-chart-large` (148) y un techo para que no se estire en pantallas
   altas. El JS lo necesita como número: `LineNoAxes` fija su `height` en píxeles. */
const MIN_CHART_HEIGHT = 148;
const MAX_CHART_HEIGHT = 360;

/** Serie mínima que se puede dibujar: una línea necesita dos puntos. */
const MIN_POINTS = 2;

/** Feedback de pulsación: encoge un 3 % mientras se mantiene, y vuelve en 150 ms. */
const PRESS_CLASS =
  "transition-[color,background-color,opacity,transform] duration-[var(--duration-fast)] active:scale-[.97] motion-reduce:transition-none";

type CompareSeries = {
  slot: CompareSlot;
  name: string;
  color: string;
  /** Serie completa: la primitiva recorta con `from`. */
  points: LineSeries["points"];
  /** Los puntos del rango, para la Δ de la leyenda. */
  visible: LineSeries["points"];
};

/** Primer mes visible: los N últimos meses de la serie más larga; `undefined` = todos. */
function fromFor(companies: readonly CompanyV2[], range: RangeKey): string | undefined {
  const limit = RANGES.find((candidate) => candidate.key === range)?.points ?? null;
  if (limit === null) return undefined;
  const longest = companies.reduce<CompanyV2["timeline"]>(
    (best, company) => (company.timeline.length > best.length ? company.timeline : best),
    [],
  );
  return longest.at(-limit)?.month ?? longest[0]?.month;
}

/** Serie de una empresa con el color de su slot; `from` decide qué puntos cuentan en la leyenda. */
function seriesOf(company: CompanyV2, slot: CompareSlot, from: string | undefined): CompareSeries {
  const points = company.timeline.flatMap((point) =>
    point.score === null ? [] : [{ month: point.month, value: point.score }],
  );
  return {
    slot,
    name: company.company.name,
    color: SLOT_COLORS[slot],
    points,
    visible: from === undefined ? points : points.filter((point) => point.month >= from),
  };
}

/**
 * Alto disponible del contenedor, acotado, descontando el eje de fechas que la
 * primitiva pinta bajo el SVG. El contenedor se monta después de cargar (antes hay
 * vacío o skeleton), por eso el ref es un callback y el efecto depende del elemento.
 * En jsdom el observador entrega 600 y cae al techo.
 */
function useChartHeight(): [(element: HTMLDivElement | null) => void, number] {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(MIN_CHART_HEIGHT);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = Math.floor(entry.contentRect.height) - AXIS_HEIGHT;
      setHeight(Math.min(MAX_CHART_HEIGHT, Math.max(MIN_CHART_HEIGHT, available)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, height];
}

function LegendItem({ series }: { series: CompareSeries }): ReactElement {
  const first = series.visible[0];
  const last = series.visible.at(-1);
  const drawable = series.visible.length >= MIN_POINTS;
  const delta = first && last ? fmtDelta(last.value - first.value) : null;

  return (
    <li className="flex items-center gap-2">
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
        <span className="num text-[length:var(--text-control)]" style={{ color: delta.tone }}>
          {delta.text}
        </span>
      ) : (
        <span className="text-[length:var(--text-control)] text-content-secondary">
          Historia insuficiente
        </span>
      )}
    </li>
  );
}

function CompareSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-3 pt-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos</span>
      <div className="flex gap-4">
        {Array.from({ length: 2 }, (_, index) => (
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
  const selected = useSelection((state) => state.selected);
  const compare = useSelection((state) => state.compare);
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [normalize, setNormalize] = useState(false);
  const [chartRef, chartHeight] = useChartHeight();

  const slots: [string | null, string | null] = [compare[0] ?? selected, compare[1]];
  const active = slots.flatMap((id, index) =>
    id === null ? [] : [{ id, slot: index as CompareSlot }],
  );

  const queries = useQueries({
    queries: active.map(({ id }) => ({
      queryKey: companyKey(id),
      queryFn: () => getCompanyV2(id),
    })),
  });

  function nameOf(id: string): string {
    const query = queries[active.findIndex((entry) => entry.id === id)];
    return query?.data?.company.name ?? id;
  }

  function valueOf(id: string | null) {
    return id === null ? null : { id, name: nameOf(id) };
  }

  /* Nunca A = B. El store ya vacía el otro slot si estaba fijado; cuando A sigue a la
     selección el store no la ve, así que elegir esa misma empresa en B se rechaza. */
  function pickInto(slot: CompareSlot) {
    const other: CompareSlot = slot === 0 ? 1 : 0;
    return (item: UniverseItem | null) => {
      // La empresa que ya se ve en el otro slot (fijada o seguida) no entra en este: nunca A = B.
      if (item && item.id === slots[other]) return;
      setCompareSlot(slot, item?.id ?? null);
    };
  }

  function renderBody(): ReactElement {
    const [a, b] = slots;
    if (a === null) {
      return (
        <p key="empty" className="pt-2 text-[length:var(--text-body)] text-content-secondary">
          Elige una empresa en A
        </p>
      );
    }

    const failed = queries.find((query) => query.isError);
    if (failed) {
      return (
        <ErrorState
          error={failed.error}
          context={`la empresa ${active[queries.indexOf(failed)]?.id}`}
          onRetry={() => void failed.refetch()}
        />
      );
    }

    if (queries.some((query) => query.isPending)) return <CompareSkeleton />;

    const from = fromFor(
      queries.flatMap((query) => (query.data ? [query.data] : [])),
      range,
    );
    const series = queries.flatMap((query, index) =>
      query.data ? [seriesOf(query.data, active[index].slot, from)] : [],
    );
    const drawable = series.filter((line) => line.visible.length >= MIN_POINTS);
    const rangeLong = RANGES.find((candidate) => candidate.key === range)?.long ?? range;
    const label = `Score de ${series.length} ${series.length === 1 ? "empresa" : "empresas"} (${series
      .map((line) => line.name)
      .join(", ")}), rango ${rangeLong}`;

    /* `key` por pareja: el bloque entra con cross-fade al cambiar de empresas y NO se
       remonta al cambiar de rango o de Base 100: esos cambios se pintan de golpe. */
    return (
      <div
        key={`${a}|${b ?? ""}`}
        className="animate-crossfade motion-reduce:animate-none flex min-h-0 flex-1 flex-col"
      >
        <ul className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 pt-1 pb-2">
          {series.map((line) => (
            <LegendItem key={line.slot} series={line} />
          ))}
        </ul>
        <div ref={chartRef} className="min-h-0 flex-1">
          {drawable.length > 0 ? (
            <LineNoAxes
              series={drawable.map(({ name, color, points }) => ({ id: name, color, points }))}
              from={from}
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

  const b = slots[1];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2"
        style={{ minHeight: "var(--size-row)" }}
      >
        <div className="flex min-w-0 items-center gap-1">
          <CompanyPicker
            label="Empresa A"
            value={valueOf(slots[0])}
            color={SLOT_COLORS[0]}
            onPick={pickInto(0)}
          />
          <span className="px-1 text-[length:var(--text-micro)] text-content-secondary">vs</span>
          <CompanyPicker
            label="Empresa B"
            value={valueOf(b)}
            placeholder="Elegir empresa"
            color={SLOT_COLORS[1]}
            onPick={pickInto(1)}
          />
          {b !== null ? (
            <button
              type="button"
              aria-label={`Quitar ${nameOf(b)}`}
              onClick={() => setCompareSlot(1, null)}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-content-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:hover)]:hover:text-content-primary",
                PRESS_CLASS,
              )}
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Segmented value={range} options={RANGE_OPTIONS} onChange={setRange} label="Rango" />
          <button
            type="button"
            aria-pressed={normalize}
            onClick={() => setNormalize((value) => !value)}
            className={cn(
              "h-[var(--size-segment-sm)] rounded-[var(--radius-pill)] px-2 text-[length:var(--text-control)] font-semibold shadow-[inset_0_0_0_1px_var(--border-glass)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:hover)]:hover:scale-[1.02] [@media(hover:hover)]:hover:bg-surface-glass-hover",
              PRESS_CLASS,
              normalize
                ? "bg-surface-glass-hover text-content-primary"
                : "bg-surface-glass text-content-secondary",
            )}
          >
            Base 100
          </button>
        </div>
      </div>

      {renderBody()}
    </div>
  );
}
