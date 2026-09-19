/**
 * Widget Mapa: `/api/v2/treemap` por grupo, tamaño por cobros de 12 meses y color
 * por la métrica elegida (Δ3m, Δ1m o score).
 *
 * El contenedor se mide con `ResizeObserver` (como `useChartHeight` en Comparativa)
 * y el `Treemap` se pinta al tamaño medido. Un item con `color_value: null` no tiene
 * métrica en el corte: no se pinta (el contrato prohíbe imputar 0) y el pie dice
 * cuántas empresas quedan fuera.
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Treemap, fmtDelta, fmtPoints } from "@/charts";
import type { TreemapDatum, TreemapDatumGroup } from "@/charts";
import { ErrorState } from "@/components/states";
import { Segmented } from "@/components/ui/segmented";
import type { SegmentedOption } from "@/components/ui/segmented";
import { select } from "@/dashboard/selection";
import type { TreemapItem, TreemapResponse } from "@/lib/api-v2";
import { getMeta, getTreemap } from "@/lib/api-v2";
import { metaKey, treemapKey } from "@/lib/query-keys";
import type { WidgetContentProps } from "@/widgets/registry";

type Metric = TreemapResponse["metric"];

const METRICS: readonly SegmentedOption<Metric>[] = [
  { value: "delta_3m", label: "Δ3m" },
  { value: "delta_1m", label: "Δ1m" },
  { value: "score", label: "Score" },
];

const GROUP_BY = "group" as const;

/** Alto de la banda de título de cada grupo dentro del mapa. */
const GROUP_HEADER_HEIGHT = 16;

type Size = { width: number; height: number };

/** Mide el hueco del mapa; sin medida todavía, no se pinta nada. */
function useMeasuredSize(): [(element: HTMLDivElement | null) => void, Size] {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, size];
}

/** Valor de la métrica como texto: el score lleva unidad, los Δ llevan glifo. */
function formatMetric(metric: Metric, value: number): string {
  return metric === "score" ? fmtPoints(value) : fmtDelta(value).text;
}

function metricLabel(metric: Metric): string {
  return METRICS.find((option) => option.value === metric)?.label ?? metric;
}

function TreemapSkeleton(): ReactElement {
  return (
    <div aria-busy="true" aria-live="polite" className="min-h-0 flex-1 py-1">
      <span className="sr-only">Cargando mapa</span>
      <div className="h-full w-full animate-pulse rounded-[var(--radius-control)] bg-surface-glass motion-reduce:animate-none" />
    </div>
  );
}

export function TreemapWidget(_props: WidgetContentProps): ReactElement {
  const [chosenMetric, setMetric] = useState<Metric>("delta_3m");
  const meta = useQuery({ queryKey: metaKey, queryFn: getMeta, staleTime: Infinity });
  const snapshots = meta.data?.capabilities?.snapshots_only === true;
  const metric = snapshots ? "score" : chosenMetric;
  const [hovered, setHovered] = useState<TreemapItem | null>(null);
  const [mapRef, size] = useMeasuredSize();

  const query = { groupBy: GROUP_BY, metric, ...(snapshots ? { sizeBy: "n_companies" as const } : {}) };
  const treemap = useQuery({
    queryKey: treemapKey(query),
    queryFn: () => getTreemap(query),
    placeholderData: keepPreviousData,
  });

  const { groups, byId, missing } = useMemo(() => {
    const source = treemap.data?.groups ?? [];
    const groups: TreemapDatumGroup[] = source.map((group) => ({
      id: group.key,
      items: group.items.flatMap((item): TreemapDatum[] =>
        item.color_value === null
          ? []
          : [{ id: item.id, size: item.size, color_value: item.color_value }],
      ),
    }));
    const byId = new Map<string, TreemapItem>(
      source.flatMap((group) => group.items.map((item) => [item.id, item] as const)),
    );
    const missing = source.reduce(
      (sum, group) => sum + group.items.filter((item) => item.color_value === null).length,
      0,
    );
    return { groups, byId, missing };
  }, [treemap.data]);

  function handleHover(datum: TreemapDatum): void {
    setHovered(byId.get(datum.id) ?? null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {snapshots ? <p className="text-[length:var(--text-micro)] text-content-secondary">Área igual por empresa · color por score al corte</p> : null}
      <div className="flex h-6 shrink-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[length:var(--text-control)] text-content-secondary">
          {hovered ? (
            <>
              <span className="text-content-primary">{hovered.name}</span>
              {` · ${metricLabel(metric)} `}
              <span className="font-mono tabular-nums">
                {hovered.color_value === null ? null : formatMetric(metric, hovered.color_value)}
              </span>
            </>
          ) : (
            "Pasa por encima de una empresa"
          )}
        </span>
        <Segmented value={metric} options={snapshots ? METRICS.filter(option => option.value === "score") : METRICS} onChange={setMetric} label="Métrica" />
      </div>

      {treemap.isPending ? (
        <TreemapSkeleton />
      ) : treemap.isError ? (
        <ErrorState
          error={treemap.error}
          context="el mapa"
          onRetry={() => void treemap.refetch()}
        />
      ) : groups.length === 0 ? (
        <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
          <p>Sin empresas en este corte</p>
          <p>El mapa se pinta cuando el universo tiene cobros que repartir.</p>
        </div>
      ) : (
        <div ref={mapRef} className="min-h-0 flex-1" onMouseLeave={() => setHovered(null)}>
          {size.width > 0 && size.height > 0 ? (
            <Treemap
              groups={groups}
              width={size.width}
              height={size.height}
              unit="pts"
              label={`Mapa de empresas por grupo, color por ${metricLabel(metric)}`}
              headerHeight={GROUP_HEADER_HEIGHT}
              onSelect={(datum) => select(datum.id)}
              onHover={handleHover}
            />
          ) : null}
        </div>
      )}

      {missing > 0 ? (
        <details className="shrink-0 text-[length:var(--text-micro)] text-content-secondary"><summary className="cursor-pointer">{`${missing} ${missing === 1 ? "empresa" : "empresas"} sin ${metricLabel(metric)} en este corte`}</summary><div className="max-h-24 overflow-y-auto">{[...byId.values()].filter(item => item.color_value === null).map(item => <button type="button" key={item.id} className="block py-1 text-left hover:text-content-primary" onClick={() => select(item.id)}>{item.name} · Sin score</button>)}</div></details>
      ) : null}
    </div>
  );
}
