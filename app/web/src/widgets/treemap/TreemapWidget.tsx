/**
 * Widget Mapa: `/api/v2/treemap` por grupo, país o ERP, y el universo repartido
 * en tres columnas semánticas por la métrica elegida (Δ3m, Δ1m o score).
 *
 * La entidad del mapa es la EMPRESA, no el bucket, y eso se decidió con datos:
 * consolidada por bucket la métrica colapsa al centro (por país el reparto sale
 * 1 / 17 / 0 y por ERP 0 / 19 / 2, o sea una columna gorda y dos vacías, y por
 * grupo la API manda `delta: null` en los 250), mientras que por empresa sale
 * 207 / 446 / 177: eso sí es un mapa. El selector de agrupación sigue vivo
 * porque cambia la petición y el censo del subtítulo, y porque el bucket de la
 * empresa es lo que se lee al pasar el ratón.
 *
 * El contenedor se mide con `ResizeObserver` (como `useChartHeight` en
 * Comparativa) y `TreemapColumns` se pinta al tamaño medido. Una empresa con
 * `color_value: null` no tiene métrica en el corte: no entra en ninguna columna
 * (el contrato prohíbe imputar 0) y el subtítulo dice cuántas quedan fuera. Esa
 * línea es la única de arriba: con hover, la empresa, su bucket y su valor; sin
 * él, el resumen del corte. No hay pie ni leyenda de color: el título de cada
 * columna ya dice lo que diría la leyenda, y se lee sin distinguir los tonos.
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fmtDelta, fmtMonth, fmtPoints } from "@/charts";
import type { ColumnDatum } from "@/charts";
import { ErrorState } from "@/components/states";
import { Segmented } from "@/components/ui/segmented";
import type { SegmentedOption } from "@/components/ui/segmented";
import { select } from "@/dashboard/selection";
import type { TreemapResponse } from "@/lib/api-v2";
import { getMeta, getTreemap } from "@/lib/api-v2";
import { metaKey, treemapKey } from "@/lib/query-keys";
import { TreemapColumns } from "@/widgets/treemap/TreemapColumns";
import type { WidgetContentProps } from "@/widgets/registry";

type Metric = TreemapResponse["metric"];
type GroupBy = TreemapResponse["group_by"];

const METRICS: readonly SegmentedOption<Metric>[] = [
  { value: "delta_3m", label: "Δ3m" },
  { value: "delta_1m", label: "Δ1m" },
  { value: "score", label: "Score" },
];

const GROUPINGS: readonly SegmentedOption<GroupBy>[] = [
  { value: "group", label: "Grupo" },
  { value: "country", label: "País" },
  { value: "erp", label: "ERP" },
];

/** Cómo se cuenta cada agrupación en el subtítulo: «250 grupos», «23 países», «21 ERP». */
const BUCKET_NOUN: Record<GroupBy, readonly [string, string]> = {
  group: ["grupo", "grupos"],
  country: ["país", "países"],
  erp: ["ERP", "ERP"],
};

/** Bucket de la API para las empresas sin país o sin ERP conocidos. */
const UNKNOWN_BUCKET = "unknown";
const UNKNOWN_LABEL = "Sin dato";

/**
 * Empresa del mapa con su bucket: el bucket ya no es una banda dentro del mapa,
 * es el contexto que se lee en la línea de estado. `value: null` = sin métrica
 * en el corte, y entonces la empresa no se pinta.
 */
type Entity = { id: string; name: string; size: number; value: number | null; bucket: string };

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

/** La pill dice «Score»; dentro de una frase, «score». */
function metricInSentence(metric: Metric): string {
  return metric === "score" ? "score" : metricLabel(metric);
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
  const [groupBy, setGroupBy] = useState<GroupBy>("group");
  const meta = useQuery({ queryKey: metaKey, queryFn: getMeta, staleTime: Infinity });
  const snapshots = meta.data?.capabilities?.snapshots_only === true;
  const metric = snapshots ? "score" : chosenMetric;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mapRef, size] = useMeasuredSize();

  const query = { groupBy, metric, ...(snapshots ? { sizeBy: "n_companies" as const } : {}) };
  const treemap = useQuery({
    queryKey: treemapKey(query),
    queryFn: () => getTreemap(query),
    placeholderData: keepPreviousData,
  });

  const { buckets, entities, items, byId, missing, sameSize } = useMemo(() => {
    const source = treemap.data?.groups ?? [];
    // La entidad es la empresa: los buckets se aplanan y solo sobreviven como
    // etiqueta de contexto de cada empresa.
    const entities: Entity[] = source.flatMap((group) =>
      group.items.map((item) => ({
        id: item.id,
        name: item.name,
        size: item.size,
        value: item.color_value,
        bucket: group.key === UNKNOWN_BUCKET ? UNKNOWN_LABEL : group.label,
      })),
    );
    const items: ColumnDatum[] = entities.flatMap((entity) =>
      entity.value === null
        ? []
        : [{ id: entity.id, name: entity.name, size: entity.size, value: entity.value }],
    );
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    // Sin magnitud que repartir el área deja de decir nada y manda el orden:
    // hay que decir por qué está una empresa antes que otra.
    const sameSize = items.length > 0 && items.every((item) => item.size === items[0].size);
    return {
      buckets: source.length,
      entities,
      items,
      byId,
      missing: entities.length - items.length,
      sameSize,
    };
  }, [treemap.data]);

  const hovered = hoveredId === null ? null : (byId.get(hoveredId) ?? null);
  const [singular, plural] = BUCKET_NOUN[groupBy];

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {/*
        La línea de estado y los selectores comparten fila SOLO si caben: con el
        panel estrecho el resumen pide 355 px y le quedaban 29, o sea «456 sin
        métric…». Con `flex-wrap-reverse` y un mínimo de 16rem, cuando no cabe
        al lado de los selectores cae a su propia fila —debajo de ellos, que es
        donde la deja el sentido de lectura— y se lee entera.
      */}
      <div className="flex min-h-6 shrink-0 flex-wrap-reverse items-center justify-between gap-x-2 gap-y-0.5">
        <span className="min-w-64 max-w-full flex-1 truncate text-[length:var(--text-control)] text-content-secondary">
          {hovered ? (
            <>
              <span className="text-content-primary">{hovered.name}</span>
              {` · ${hovered.bucket} · ${metricLabel(metric)} `}
              <span className="num">
                {hovered.value === null ? null : formatMetric(metric, hovered.value)}
              </span>
            </>
          ) : treemap.data ? (
            <>
              <span className="num">{buckets}</span>
              {` ${buckets === 1 ? singular : plural} · `}
              <span className="num">{fmtMonth(treemap.data.as_of)}</span>
              {missing > 0 ? (
                <>
                  {" · "}
                  <span className="num">{missing}</span>
                  {" sin métrica"}
                </>
              ) : null}
              {sameSize ? ` · ordenadas por ${metricInSentence(metric)}` : null}
            </>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Segmented value={groupBy} options={GROUPINGS} onChange={setGroupBy} label="Agrupar" />
          <Segmented value={metric} options={snapshots ? METRICS.filter((option) => option.value === "score") : METRICS} onChange={setMetric} label="Métrica" />
        </div>
      </div>

      {treemap.isPending ? (
        <TreemapSkeleton />
      ) : treemap.isError ? (
        <ErrorState
          error={treemap.error}
          context="el mapa"
          onRetry={() => void treemap.refetch()}
        />
      ) : entities.length === 0 ? (
        <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
          <p>Sin empresas en este corte</p>
          <p>El mapa se pinta cuando el universo tiene cobros que repartir.</p>
        </div>
      ) : (
        <div ref={mapRef} className="min-h-0 flex-1" onMouseLeave={() => setHoveredId(null)}>
          {size.width > 0 && size.height > 0 ? (
            <TreemapColumns
              items={items}
              metric={metric}
              width={size.width}
              height={size.height}
              onSelect={select}
              onHover={setHoveredId}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
