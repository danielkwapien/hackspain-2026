/**
 * Widget Alertas: la bandeja de `/api/v2/alerts`, la más reciente arriba.
 *
 * Cada fila es un botón a ancho completo: el punto dice la severidad (y un texto
 * `sr-only` la nombra), la causa y el mensaje se truncan con `title` y el mes va
 * a la derecha. Pulsar una fila selecciona la empresa en el store global; la
 * fila de la empresa seleccionada lleva `aria-current`.
 *
 * Dos cosas que XR-037 (I2) arregla, y no son de estilo:
 *
 * - **Una fila por sociedad.** La bandeja pide 50 ordenadas por mes descendente
 *   y, desde que hay cinco causas sobre 24 meses, esas 50 eran todas del último
 *   mes y muchas de la misma empresa. `latestPerCompany` le pide a la API la
 *   alerta viva más grave de cada sociedad, no su histórico.
 * - **Filtro por causa** en la cabecera: con cinco tipos, leer la bandeja sin
 *   poder aislar uno es leer un revuelto.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { fmtMonth } from "@/charts";
import { ErrorState } from "@/components/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { select, useSelection } from "@/dashboard/selection";
import type { AlertRow } from "@/lib/api-v2";
import { getAlerts } from "@/lib/api-v2";
import { CAUSE_LABEL, causeLabel } from "@/lib/definitions";
import { alertsKey } from "@/lib/query-keys";
import type { WidgetContentProps } from "@/widgets/registry";

/** Valor del desplegable cuando no se filtra: `Select` no admite valor vacío. */
const ALL_CAUSES = "all";

const CAUSE_OPTIONS = Object.entries(CAUSE_LABEL);

/**
 * `latestPerCompany` es el arreglo de P4: sin él, pedir 50 ordenadas por mes
 * descendente devolvía el histórico del último mes, repitiendo sociedad.
 */
const QUERY = { limit: 50, latestPerCompany: true } as const;

/**
 * Alto de fila en px. Sube de 28 a 34 con XR-038 (W5.2): el nombre de la
 * sociedad y la causa pasan a 13 px y en 28 px las dos líneas se tocarían. El
 * esqueleto usa la misma constante, así que la lista no salta al cargar.
 */
const ROW_HEIGHT = 34;
const SKELETON_ROWS = 6;

type SeverityStyle = { label: string; dotClass: string };

const SEVERITY: Record<AlertRow["severity"], SeverityStyle> = {
  watch: { label: "Vigilar", dotClass: "bg-content-alert" },
  review: { label: "Revisar", dotClass: "bg-content-alert" },
  urgent: { label: "Urgente", dotClass: "bg-content-negative" },
};

/**
 * La severidad llega como texto de la API, no como el tipo que declara este
 * fichero. Indexar a pelo costo la pantalla entera en XR-035: el motor publicaba
 * `critical` y leer `.dotClass` de `undefined` desmontaba el arbol. Una
 * severidad que no reconocemos se degrada al escalon mas bajo del vocabulario.
 */
function severityStyle(severity: string): SeverityStyle {
  return SEVERITY[severity as AlertRow["severity"]] ?? SEVERITY.watch;
}

const TRIGGER_CLASS =
  "h-[var(--size-segment-sm)] w-full gap-1 rounded-[var(--radius-control)] border-0 bg-surface-glass px-2 text-[length:var(--text-control)] font-semibold text-content-primary shadow-[inset_0_0_0_1px_var(--border-glass)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 [@media(hover:hover)]:hover:bg-surface-glass-hover";

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-left transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none";

const MICRO_CLASS = "shrink-0 num text-[length:var(--text-micro)] text-content-secondary";

/** La sociedad es de quién va la alerta: es lo primero que hay que poder leer. */
const COMPANY_CLASS =
  "min-w-0 flex-1 truncate text-[length:var(--text-body)] font-semibold text-content-primary";

/** El tipo de alerta acompaña al nombre: mismo cuerpo, un escalón menos de color. */
const CAUSE_CLASS = "shrink-0 text-[length:var(--text-body)] text-content-secondary";

const SKELETON_BAR_CLASS =
  "h-3 animate-pulse rounded-[var(--radius-control)] bg-surface-glass motion-reduce:animate-none";

/** Más reciente primero; la API las sirve en orden ascendente. */
function byMostRecent(a: AlertRow, b: AlertRow): number {
  return b.month_detected.localeCompare(a.month_detected);
}

function AlertsSkeleton(): ReactElement {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col">
      <span className="sr-only">Cargando alertas</span>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <div key={row} className="flex items-center gap-2 px-2" style={{ height: ROW_HEIGHT }}>
          <div className="size-2 shrink-0 rounded-full bg-surface-glass" />
          <div className={cn(SKELETON_BAR_CLASS, "w-16 shrink-0")} />
          <div className={cn(SKELETON_BAR_CLASS, "min-w-0 flex-1")} />
          <div className={cn(SKELETON_BAR_CLASS, "w-12 shrink-0")} />
        </div>
      ))}
    </div>
  );
}

/**
 * Cabecera: el filtro por causa. Vive fuera del estado de la consulta a
 * propósito —se pinta también mientras carga, con error y con cero filas—,
 * porque filtrar a una causa sin alertas y quedarse sin el control con el que
 * volver es un callejón sin salida.
 */
function CauseFilter({
  cause,
  onChange,
}: {
  cause: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className="flex shrink-0 items-center pb-1">
      <Select value={cause} onValueChange={onChange}>
        <SelectTrigger size="sm" aria-label="Causa" className={TRIGGER_CLASS}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_CAUSES}>Todas las causas</SelectItem>
          {CAUSE_OPTIONS.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AlertsWidget(_props: WidgetContentProps): ReactElement {
  const selected = useSelection((state) => state.selected);
  const [cause, setCause] = useState<string>(ALL_CAUSES);
  const query = { ...QUERY, cause: cause === ALL_CAUSES ? undefined : cause };
  const alerts = useQuery({
    queryKey: alertsKey(query),
    queryFn: () => getAlerts(query),
  });

  return (
    <div className="flex min-h-0 flex-col">
      <CauseFilter cause={cause} onChange={setCause} />
      {alerts.isPending ? <AlertsSkeleton /> : null}
      {alerts.isError ? (
        <ErrorState
          error={alerts.error}
          context="las alertas"
          onRetry={() => void alerts.refetch()}
        />
      ) : null}
      {alerts.isSuccess && alerts.data.items.length === 0 ? (
        <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
          <p>Sin alertas en este corte</p>
          <p>No hay alertas publicadas. Esto no implica ausencia de riesgo.</p>
        </div>
      ) : null}
      {alerts.isSuccess && alerts.data.items.length > 0 ? (
        <div role="list" className="flex min-h-0 flex-col overflow-y-auto">
          {[...alerts.data.items].sort(byMostRecent).map((alert) => {
            const severity = severityStyle(alert.severity);
            const isSelected = selected === alert.company_id;
            return (
              <button
                key={alert.alert_id}
                type="button"
                aria-current={isSelected ? "true" : undefined}
                className={cn(ROW_CLASS, isSelected && "bg-fills-accent-thin")}
                style={{ height: ROW_HEIGHT }}
                onClick={() => select(alert.company_id)}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", severity.dotClass)}
                />
                <span className="sr-only">{severity.label}</span>
                {/* El nombre cede antes que la causa y que el mes: truncado
                    sigue identificando la sociedad, y los otros dos no. */}
                <span className={COMPANY_CLASS} title={alert.company_id}>
                  {alert.company_name ?? alert.company_id}
                </span>
                {/* La causa ocupa el sitio que tenía la prosa del motor. En 330
                    px esa prosa se recortaba a una letra («C…») en cuanto el
                    nombre era largo, y una bandeja de cincuenta fragmentos es
                    justo lo que P4 pide evitar. El mensaje entero sigue ahí: en
                    el `title` para el ratón y leído por el lector de pantalla. */}
                <span className={CAUSE_CLASS} title={alert.message}>
                  {causeLabel(alert.cause)}
                </span>
                <span className="sr-only">{alert.message}</span>
                <span className={MICRO_CLASS}>{fmtMonth(alert.month_detected)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
