/**
 * Widget Investigación profunda: la entidad fijada en el widget o la seleccionada
 * (`resolveEntity`). Con una empresa, el toggle «Familia» elige una de las cinco
 * familias de señales (`PillarSummary`) y abre en Liquidez, y al pie las dos tarjetas
 * que abren los pop-ups (`ActionCards`). Con un grupo, solo la lista de filiales
 * (`SubsidiariesList`).
 *
 * El toggle perdió «Health score» (XR-037, E16): de las 22 celdas de sus estadísticas
 * clave, Score, Banda, Régimen, Confianza y Outlook ya están en la cabecera de la ficha
 * de al lado, y Grupo, País, Moneda e industria en su línea de identidad; lo único
 * exclusivo era el bloque «Motor», que es metadato de ingeniería.
 *
 * La familia vive fuera del contenedor con `key` de empresa: cambiar de empresa no
 * devuelve a Liquidez.
 *
 * XR-038 (W2.2): el toggle ocupa el ancho entero con las cinco opciones a partes
 * iguales y en mayúsculas, y eso va por `className` en esta llamada, no en
 * `components/ui/segmented.tsx`: el primitivo lo comparten el rango de la gráfica,
 * el orden de contrapartes y el de unidad, y a ancho completo «1M 3M 6M 1A TOTAL»
 * se estiraría por toda la ficha.
 *
 * XR-038 (W2.1): la cobertura de señales de la familia activa («3 de 4 señales con
 * dato») era lo único que se perdía al borrar la línea resumen del pilar, y en la
 * peor familia del dataset lo normal es que falten. Se lee en el `title` del
 * toggle; `useQuery` comparte caché con `PillarSummary`, así que no hay una segunda
 * petición.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/states";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveEntity, useSelection } from "@/dashboard/selection";
import { ApiError } from "@/lib/api";
import { getCompanySignals, getCompanyV2 } from "@/lib/api-v2";
import type { Pillar, PillarSignals } from "@/lib/api-v2";
import { FAMILY_LABEL, FAMILY_OPTIONS } from "@/lib/definitions";
import { companyKey, companySignalsKey } from "@/lib/query-keys";
import type { WidgetContentProps } from "@/widgets/registry";
import { ActionCards } from "@/widgets/research-deep/ActionCards";
import { PillarSummary } from "@/widgets/research-deep/PillarSummary";
import { SubsidiariesList } from "@/widgets/research-deep/SubsidiariesList";

const SKELETON_CELLS = 8;

/** Ancho completo, cinco opciones a partes iguales y en mayúsculas: solo aquí. */
const FAMILY_CLASS = [
  "w-full",
  "[&>button]:flex-1 [&>button]:justify-center",
  "[&>button]:text-[length:var(--text-body)] [&>button]:uppercase [&>button]:tracking-wide",
].join(" ");

/** Cuántas señales de la familia traen dato: la cifra que W2.1 saca del cuerpo. */
function coverageTitle(
  pillars: readonly PillarSignals[] | undefined,
  family: Pillar,
): string | undefined {
  const pillar = pillars?.find((candidate) => candidate.pillar === family);
  if (pillar === undefined) return undefined;
  const available = pillar.signals.filter((signal) => signal.is_available).length;
  return `${FAMILY_LABEL[family]}: ${available} de ${pillar.signals.length} señales con dato`;
}

export function ResearchDeepWidget({ item }: WidgetContentProps): ReactElement {
  const selectedEntity = useSelection((state) => state.selectedEntity);
  const entity = resolveEntity(item.entity, selectedEntity);
  const [family, setFamily] = useState<Pillar>("L");

  if (entity === null) {
    return (
      <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
        <p>Selecciona una empresa o un grupo</p>
        <p>La ficha sigue a la selección salvo que el widget fije una.</p>
      </div>
    );
  }

  if (entity.kind === "group") return <SubsidiariesList id={entity.id} />;

  return <CompanyDeep id={entity.id} family={family} onFamily={setFamily} />;
}

function CompanyDeep({
  id,
  family,
  onFamily,
}: {
  id: string;
  family: Pillar;
  onFamily: (family: Pillar) => void;
}): ReactElement {
  const company = useQuery({ queryKey: companyKey(id), queryFn: () => getCompanyV2(id) });
  // Misma clave que `PillarSummary`: React Query la comparte y no repite la llamada.
  const signals = useQuery({
    queryKey: companySignalsKey(id),
    queryFn: () => getCompanySignals(id),
  });

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
      <div title={coverageTitle(signals.data?.pillars, family)}>
        <Segmented
          value={family}
          options={FAMILY_OPTIONS}
          onChange={onFamily}
          label="Familia"
          className={FAMILY_CLASS}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PillarSummary company={company.data} family={family} />
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
      <Skeleton className="h-[var(--size-segment-sm)] w-full" />
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
