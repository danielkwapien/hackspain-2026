/**
 * Widget Investigación profunda: la entidad fijada en el widget o la seleccionada
 * (`resolveEntity`). Con una empresa, el toggle «Familia» elige entre las
 * estadísticas clave del score (`KeyStats`) y una familia de señales
 * (`PillarSummary`), y al pie las dos tarjetas que abren los pop-ups (`ActionCards`).
 * Con un grupo, solo la lista de filiales (`SubsidiariesList`).
 *
 * La familia vive fuera del contenedor con `key` de empresa: cambiar de empresa no
 * devuelve al score.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/states";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveEntity, useSelection } from "@/dashboard/selection";
import { ApiError } from "@/lib/api";
import { getCompanyV2 } from "@/lib/api-v2";
import { METRIC_OPTIONS } from "@/lib/definitions";
import type { Metric } from "@/lib/definitions";
import { companyKey } from "@/lib/query-keys";
import type { WidgetContentProps } from "@/widgets/registry";
import { ActionCards } from "@/widgets/research-deep/ActionCards";
import { KeyStats } from "@/widgets/research-deep/KeyStats";
import { PillarSummary } from "@/widgets/research-deep/PillarSummary";
import { SubsidiariesList } from "@/widgets/research-deep/SubsidiariesList";

const SKELETON_CELLS = 8;

export function ResearchDeepWidget({ item }: WidgetContentProps): ReactElement {
  const selectedEntity = useSelection((state) => state.selectedEntity);
  const entity = resolveEntity(item.entity, selectedEntity);
  const [metric, setMetric] = useState<Metric>("score");

  if (entity === null) {
    return (
      <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
        <p>Selecciona una empresa o un grupo</p>
        <p>La ficha sigue a la selección salvo que el widget fije una.</p>
      </div>
    );
  }

  if (entity.kind === "group") return <SubsidiariesList id={entity.id} />;

  return <CompanyDeep id={entity.id} metric={metric} onMetric={setMetric} />;
}

function CompanyDeep({
  id,
  metric,
  onMetric,
}: {
  id: string;
  metric: Metric;
  onMetric: (metric: Metric) => void;
}): ReactElement {
  const company = useQuery({ queryKey: companyKey(id), queryFn: () => getCompanyV2(id) });

  if (company.isPending) return <DeepSkeleton />;

  if (company.isError) {
    const notFound = company.error instanceof ApiError && company.error.status === 404;
    return (
      <ErrorState
        error={notFound ? new Error(`No existe ninguna empresa ${id} en este corte.`) : company.error}
        context="la ficha de la empresa"
        onRetry={() => void company.refetch()}
      />
    );
  }

  return (
    <div
      key={id}
      data-company={id}
      className="animate-crossfade motion-reduce:animate-none flex h-full min-h-0 flex-col gap-3"
    >
      <Segmented
        value={metric}
        options={METRIC_OPTIONS}
        onChange={onMetric}
        label="Familia"
        className="self-start"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {metric === "score" ? (
          <KeyStats company={company.data} />
        ) : (
          <PillarSummary company={company.data} family={metric} />
        )}
      </div>
      <ActionCards company={company.data} />
    </div>
  );
}

/** Skeleton con la forma del contenido: toggle, celdas a dos columnas y dos tarjetas. */
function DeepSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-3 pt-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos</span>
      <Skeleton className="h-[var(--size-segment-sm)] w-80" />
      <div className="grid grid-cols-2 gap-x-6">
        {Array.from({ length: SKELETON_CELLS }, (_, index) => (
          <div
            key={index}
            className="flex flex-col justify-center gap-2"
            style={{ minHeight: "var(--size-stat-cell)" }}
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 pt-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
