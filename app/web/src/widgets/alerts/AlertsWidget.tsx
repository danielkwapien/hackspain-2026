/**
 * Widget Alertas: la bandeja de `/api/v2/alerts`, la más reciente arriba.
 *
 * Cada fila es un botón a ancho completo: el punto dice la severidad (y un texto
 * `sr-only` la nombra), el mensaje se trunca con `title` y el mes va a la derecha.
 * Pulsar una fila selecciona la empresa en el store global; la fila de la empresa
 * seleccionada lleva `aria-current`.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { fmtMonth } from "@/charts";
import { ErrorState } from "@/components/states";
import { select, useSelection } from "@/dashboard/selection";
import type { AlertRow } from "@/lib/api-v2";
import { getAlerts } from "@/lib/api-v2";
import { alertsKey } from "@/lib/query-keys";
import type { WidgetContentProps } from "@/widgets/registry";

const QUERY = { limit: 50 } as const;

/** Alto de fila en px: es `--size-table-row`. */
const ROW_HEIGHT = 28;
const SKELETON_ROWS = 6;

const SEVERITY: Record<AlertRow["severity"], { label: string; dotClass: string }> = {
  watch: { label: "Vigilar", dotClass: "bg-content-alert" },
  review: { label: "Revisar", dotClass: "bg-content-alert" },
  urgent: { label: "Urgente", dotClass: "bg-content-negative" },
};

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-left transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none";

const MICRO_CLASS = "shrink-0 num text-[length:var(--text-micro)] text-content-secondary";

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

export function AlertsWidget(_props: WidgetContentProps): ReactElement {
  const selected = useSelection((state) => state.selected);
  const alerts = useQuery({
    queryKey: alertsKey(QUERY),
    queryFn: () => getAlerts(QUERY),
  });

  if (alerts.isPending) return <AlertsSkeleton />;

  if (alerts.isError) {
    return (
      <ErrorState
        error={alerts.error}
        context="las alertas"
        onRetry={() => void alerts.refetch()}
      />
    );
  }

  if (alerts.data.items.length === 0) {
    return (
      <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
        <p>Sin alertas en este corte</p>
        <p>El motor no ha detectado deterioros que vigilar.</p>
      </div>
    );
  }

  const rows = [...alerts.data.items].sort(byMostRecent);

  return (
    <div role="list" className="flex flex-col overflow-y-auto">
      {rows.map((alert) => {
        const severity = SEVERITY[alert.severity];
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
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", severity.dotClass)} />
            <span className="sr-only">{severity.label}</span>
            <span className={MICRO_CLASS}>{alert.company_id}</span>
            <span
              className="min-w-0 flex-1 truncate text-[length:var(--text-control)] text-content-primary"
              title={alert.message}
            >
              {alert.message}
            </span>
            <span className={cn(MICRO_CLASS, "ml-auto")}>{fmtMonth(alert.month_detected)}</span>
          </button>
        );
      })}
    </div>
  );
}
