/**
 * Score de una empresa: la cara visible del vínculo entre widgets.
 *
 * No elige empresa: la recibe en `item.entities`, que el Buscador reescribe para
 * todo el `linkGroup`. Sin entidad no hay cifra, y sin cifra no se rellena con un
 * cero: se dice que falta elegir empresa.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingPanel } from "@/components/states";
import { ApiError } from "@/lib/api";
import { getCompanyV2 } from "@/lib/api-v2";
import { BAND_CLASS, BAND_LABEL, REGIME_CLASS, REGIME_LABEL } from "../regime";
import { Sparkline } from "../Sparkline";
import type { WidgetContentProps } from "../registry";

/* El SVG calcula sus puntos con estos números, así que no pueden ser `var()`.
   Deben cuadrar con `--size-sparkline-w` y `--size-sparkline-h`. */
const SPARKLINE_WIDTH = 64;
const SPARKLINE_HEIGHT = 16;

const DELTA_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** Color por signo: verde sube, rojo baja, gris cuando no se ha movido. */
function signClass(value: number): string {
  if (value > 0) return "text-content-positive";
  if (value < 0) return "text-content-negative";
  return "text-content-secondary";
}

function signArrow(value: number): string {
  if (value > 0) return "▲";
  if (value < 0) return "▼";
  return "";
}

export function ScoreCard({ item }: WidgetContentProps): ReactElement {
  const entity = item.entities[0];
  const id = entity?.id;

  const company = useQuery({
    queryKey: ["company-v2", id],
    queryFn: () => getCompanyV2(id ?? ""),
    enabled: Boolean(id),
  });

  if (!entity || !id) {
    return (
      <EmptyState
        title="Sin empresa seleccionada"
        description="Elige una en la cabecera del widget."
      />
    );
  }

  if (company.isPending) return <LoadingPanel lines={4} />;

  if (company.isError) {
    const notFound = company.error instanceof ApiError && company.error.status === 404;
    if (notFound) {
      return (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-md border border-border px-4 py-4"
        >
          <p className="text-sm text-foreground">{`No hay ficha para ${id}`}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void company.refetch()}
          >
            Reintentar
          </Button>
        </div>
      );
    }
    return (
      <ErrorState
        error={company.error}
        onRetry={() => void company.refetch()}
        context="la ficha de la empresa"
      />
    );
  }

  const data = company.data;
  const delta = data.delta_1m;
  const deltaClass = signClass(delta);

  return (
    <div className="flex h-full flex-col gap-2 pt-1">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{data.company.name}</p>
        <p className="truncate font-mono text-xs text-content-secondary">{data.company.id}</p>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[length:var(--text-figure)] font-semibold tabular-nums text-foreground">
          {data.score}
        </span>
        <span className={cn("font-mono text-xs tabular-nums", deltaClass)}>
          <span aria-hidden="true">{signArrow(delta)}</span> {DELTA_FORMAT.format(delta)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className={REGIME_CLASS[data.regime]}>{REGIME_LABEL[data.regime]}</span>
        <Sparkline
          values={data.company.sparkline_12}
          width={SPARKLINE_WIDTH}
          height={SPARKLINE_HEIGHT}
          className={deltaClass}
        />
        <span className={BAND_CLASS[data.band]}>{`Banda ${data.band} · ${BAND_LABEL[data.band]}`}</span>
      </div>
    </div>
  );
}
