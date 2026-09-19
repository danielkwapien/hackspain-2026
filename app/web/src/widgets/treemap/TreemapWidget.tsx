/**
 * Widget Mapa: `/api/v2/treemap` repartido en tres columnas semánticas por la
 * métrica de color, con la cabecera de tres desplegables de `TreemapHeader`
 * (universo · tamaño · color).
 *
 * La entidad del mapa es la EMPRESA, no el bucket, y eso se decidió con datos:
 * consolidar esconde a los suyos —el Δ3m del bucket ES es −3,89, una sola
 * ficha en «Deteriorando», y sus 142 empresas se reparten 66 / 7 / 68—,
 * mientras que por empresa el reparto es 593 / 81 / 605 sobre las 1.279 con
 * Δ3m, el defecto del mapa; el umbral es estricto, así que `COMP_0672`, con
 * −1,00 clavado, cae en «Estable». El bucket sigue vivo porque elegir uno
 * concreto en el desplegable de universo filtra el mapa a sus empresas.
 *
 * El contenedor se mide con `ResizeObserver` (como `useChartHeight` en
 * Comparativa) y `TreemapColumns` se pinta al tamaño medido. Una empresa con
 * `color_value: null` no tiene métrica en el corte: no entra en ninguna columna
 * (el contrato prohíbe imputar 0) y la línea de estado dice cuántas quedan
 * fuera. Esa línea es la única de arriba y dice siempre el resumen del corte: el
 * ratón ya no la reescribe (XR-037), que la ficha completa está a un clic. No hay
 * pie ni leyenda de color: el título de cada columna ya dice lo que diría la leyenda.
 *
 * El resumen dice SOLO lo que no está dicho ya en otro sitio: cuántas empresas,
 * el corte, cuántas sin métrica y cuántas sin la magnitud elegida. Ni el total
 * global —que es la suma de los tres totales de columna, tres píxeles más
 * abajo— ni «color por Score», que es literalmente lo que se lee en el
 * desplegable de Color. A 432 px esa línea ocupaba dos renglones enteros.
 *
 * Y cuando la magnitud elegida no existe en el corte —`pending_eur` con el
 * origen local, que no tiene esa columna— el mapa no se rompe ni se queda en
 * blanco: las áreas quedan iguales, manda el orden y la línea lo dice.
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fmtMonth } from "@/charts";
import type { ColumnDatum } from "@/charts";
import { ErrorState } from "@/components/states";
import { select } from "@/dashboard/selection";
import { useWatchlist } from "@/dashboard/watchlist";
import type { TreemapResponse } from "@/lib/api-v2";
import { getMeta, getTreemap } from "@/lib/api-v2";
import { formatCount } from "@/lib/format";
import { metaKey, treemapKey } from "@/lib/query-keys";
import { TreemapColumns } from "@/widgets/treemap/TreemapColumns";
import {
  TreemapHeader,
  UNIVERSE_ALL,
  bucketLabel,
  inUniverse,
  metricLabel,
  sizeInSentence,
  universeGroupBy,
} from "@/widgets/treemap/TreemapHeader";
import type { SizeBy, UniverseValue } from "@/widgets/treemap/TreemapHeader";
import type { WidgetContentProps } from "@/widgets/registry";

type Metric = TreemapResponse["metric"];

/**
 * El área por defecto es el pendiente de cobro: es la magnitud que el cliente
 * viene a ver («cuánto dinero tengo en empresas en tensión») y es dinero.
 * `op_in_12m`, el defecto del endpoint, viene en la moneda de cada entidad y no
 * se puede repartir en un mapa sin mentir.
 *
 * Y NO es «Cobros 12m (EUR)» aunque ya esté convertida: la API la devuelve a 0
 * en las 1.286 empresas (la publicación del motor no la trae a grano de
 * sociedad), o sea un mapa plano. El pendiente sí reparte: 633 positivas de
 * 1.286, 1.110,6 M en total, mediana 197 k, p90 3,95 M y máximo 75,7 M, solo
 * 19 veces el p90 — ninguna ficha se come su columna.
 */
const DEFAULT_SIZE: SizeBy = "pending_eur";

/**
 * Empresa del mapa con su bucket: el bucket ya no es una banda dentro del mapa,
 * es el contexto que se lee en la línea de estado y el que filtra el universo.
 * `value: null` = sin métrica en el corte, y entonces la empresa no se pinta.
 */
type Entity = {
  id: string;
  name: string;
  size: number;
  value: number | null;
  bucketKey: string;
  bucket: string;
};

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

/** La pill dice «Score»; dentro de una frase, «score». */
function metricInSentence(metric: Metric): string {
  return metric === "score" ? "score" : metricLabel(metric);
}

/** Magnitud utilizable: la misma regla que el layout, negativos y `NaN` son 0. */
function usableSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 0;
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
  const [universe, setUniverse] = useState<UniverseValue>(UNIVERSE_ALL);
  const [chosenMetric, setMetric] = useState<Metric>("delta_3m");
  const [sizeBy, setSizeBy] = useState<SizeBy>(DEFAULT_SIZE);
  const meta = useQuery({ queryKey: metaKey, queryFn: getMeta, staleTime: Infinity });
  const snapshots = meta.data?.capabilities?.snapshots_only === true;
  const metric = snapshots ? "score" : chosenMetric;
  const favorites = useWatchlist();
  const [mapRef, size] = useMeasuredSize();

  const groupBy = universeGroupBy(universe);
  const query = { groupBy, metric, sizeBy };
  const treemap = useQuery({
    queryKey: treemapKey(query),
    queryFn: () => getTreemap(query),
    placeholderData: keepPreviousData,
  });

  const { entities, items, missing, missingSize, sizeTotal, sameSize } = useMemo(() => {
    const source = treemap.data?.groups ?? [];
    // La entidad es la empresa: los buckets se aplanan y sobreviven como
    // etiqueta de contexto y como filtro de universo.
    const all: Entity[] = source.flatMap((group) =>
      group.items.map((item) => ({
        id: item.id,
        name: item.name,
        size: usableSize(item.size),
        value: item.color_value,
        bucketKey: group.key,
        bucket: bucketLabel(group.key, group.label),
      })),
    );
    // Mientras llega el corte nuevo, `keepPreviousData` sirve buckets de otra
    // dimensión: filtrar por ellos dejaría el mapa vacío un instante.
    const ready = (treemap.data?.group_by ?? "group") === groupBy;
    const entities = ready
      ? all.filter((entity) => inUniverse(entity, universe, favorites))
      : all;
    const items: ColumnDatum[] = entities.flatMap((entity) =>
      entity.value === null
        ? []
        : [{ id: entity.id, name: entity.name, size: entity.size, value: entity.value }],
    );
    // Sin magnitud que repartir el área deja de decir nada y manda el orden:
    // hay que decir por qué está una empresa antes que otra.
    const sameSize = items.length > 0 && items.every((item) => item.size === items[0].size);
    return {
      entities,
      items,
      missing: entities.length - items.length,
      missingSize: entities.filter((entity) => entity.size === 0).length,
      sizeTotal: entities.reduce((sum, entity) => sum + entity.size, 0),
      sameSize,
    };
  }, [treemap.data, groupBy, universe, favorites]);

  // La magnitud no existe en este corte: ni un euro, ni una factura. No se
  // imputa nada, se dice, y el mapa sigue en pie con las áreas iguales.
  const flatSize = entities.length > 0 && sizeTotal === 0;
  const sizeSentence = sizeInSentence(sizeBy);

  const status = (
    <span
      aria-live="polite"
      className="min-h-4 text-[length:var(--text-control)] text-content-secondary"
    >
      {treemap.data ? (
        <>
          <span className="num">{formatCount(entities.length)}</span>
          {entities.length === 1 ? " empresa" : " empresas"}
          {" · "}
          <span className="num">{fmtMonth(treemap.data.as_of)}</span>
          {missing > 0 ? (
            <>
              {" · "}
              <span className="num">{formatCount(missing)}</span>
              {" sin métrica"}
            </>
          ) : null}
          {/* Sin la magnitud entera no tiene sentido contar cuántas la tienen. */}
          {flatSize ? (
            <>{` · sin ${sizeSentence} en este corte: áreas iguales, ordenadas por ${metricInSentence(metric)}`}</>
          ) : (
            <>
              {missingSize > 0 ? (
                <>
                  {" · "}
                  <span className="num">{formatCount(missingSize)}</span>
                  {` sin ${sizeSentence}`}
                </>
              ) : null}
              {sameSize ? ` · ordenadas por ${metricInSentence(metric)}` : null}
            </>
          )}
        </>
      ) : null}
    </span>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      {/*
        Tres desplegables y una línea de estado no caben en una fila de 432 px:
        antes compartían fila con `flex-wrap-reverse` y el resumen se leía
        «456 sin métric…». Ahora es deliberado: los tres juntos arriba, en una
        fila que envuelve sin truncar ninguno, y la línea de estado entera
        debajo, que es donde la deja el sentido de lectura.
      */}
      <TreemapHeader
        universe={universe}
        onUniverseChange={setUniverse}
        size={sizeBy}
        onSizeChange={setSizeBy}
        metric={metric}
        onMetricChange={setMetric}
        snapshotsOnly={snapshots}
        status={status}
      />

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
          <p>Sin empresas en este universo</p>
          <p>El mapa se pinta cuando el universo tiene cobros que repartir.</p>
        </div>
      ) : (
        <div ref={mapRef} className="min-h-0 flex-1">
          {size.width > 0 && size.height > 0 ? (
            <TreemapColumns
              items={items}
              metric={metric}
              sizeBy={sizeBy}
              width={size.width}
              height={size.height}
              onSelect={select}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
