/**
 * La ruta `/monitor`: la bandeja entera de `/api/v2/alerts`, la más reciente
 * arriba. Es la versión a pantalla completa de lo que el widget «Alertas» enseña
 * en el tablero (`@/widgets/alerts/AlertsWidget`), así que comparte cliente,
 * orden y tolerancia de severidad con él.
 *
 * Hasta XR-035 leía el contrato v1 (`getMonitor`) y, contra datos reales, pintaba
 * un cartel fijo de «Motor pendiente»: el motor ya publica miles de alertas, así
 * que el cartel mentía. El modo demostración por fixtures se fue con él.
 *
 * A esta ruta solo se llega por dirección: no tiene entrada en la navegación.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { fmtMonth } from "@/charts";
import { ErrorState, LoadingPanel } from "@/components/states";
import type { AlertRow } from "@/lib/api-v2";
import { getAlerts } from "@/lib/api-v2";
import { alertsKey } from "@/lib/query-keys";

/** La bandeja completa: el tope de la API es 500 y esta pantalla no pagina. */
const QUERY = { limit: 200 } as const;

/** Alto de fila en px: es `--size-table-row`. */
const ROW_HEIGHT = 28;

type SeverityStyle = { label: string; dotClass: string };

const SEVERITY: Record<AlertRow["severity"], SeverityStyle> = {
  watch: { label: "Vigilar", dotClass: "bg-content-alert" },
  review: { label: "Revisar", dotClass: "bg-content-alert" },
  urgent: { label: "Urgente", dotClass: "bg-content-negative" },
};

/**
 * Mismo patrón que `severityStyle()` en el widget de alertas: la severidad llega
 * como texto de la API, no como el tipo que declara el cliente. Indexar a ciegas
 * costó la pantalla entera en XR-035 (el motor publicaba `critical`), así que una
 * severidad que no reconocemos se degrada al escalón más bajo en vez de reventar.
 */
function severityStyle(severity: string): SeverityStyle {
  return SEVERITY[severity as AlertRow["severity"]] ?? SEVERITY.watch;
}

/** Más reciente primero; la API las sirve en orden ascendente. */
function byMostRecent(a: AlertRow, b: AlertRow): number {
  return b.month_detected.localeCompare(a.month_detected);
}

const ROW_CLASS =
  "flex items-center gap-3 px-2 text-[length:var(--text-control)] border-b border-border last:border-b-0";

const MICRO_CLASS = "shrink-0 num text-[length:var(--text-micro)] text-content-secondary";

export function MonitorPage(): ReactElement {
  const alerts = useQuery({
    queryKey: alertsKey(QUERY),
    queryFn: () => getAlerts(QUERY),
  });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-[length:var(--text-panel-title)] font-semibold tracking-tight text-content-primary">
          Monitor
        </h1>
        <p className="text-[length:var(--text-micro)] text-content-secondary">
          Bandeja de alertas publicadas por el motor, por sociedad.
        </p>
      </div>

      {alerts.isError ? (
        <ErrorState
          error={alerts.error}
          context="la bandeja del monitor"
          onRetry={() => void alerts.refetch()}
        />
      ) : alerts.isPending ? (
        <LoadingPanel lines={6} />
      ) : alerts.data.items.length === 0 ? (
        <div className="space-y-1 text-[length:var(--text-body)] text-content-secondary">
          <p>Sin alertas publicadas en este corte</p>
          <p>
            Una bandeja vacía no implica ausencia de riesgo. Consulta el score, su cobertura y los
            factores de cada empresa.
          </p>
        </div>
      ) : (
        <div role="list" className="flex flex-col">
          {[...alerts.data.items].sort(byMostRecent).map((alert) => {
            const severity = severityStyle(alert.severity);
            return (
              <div
                key={alert.alert_id}
                role="listitem"
                className={ROW_CLASS}
                style={{ height: ROW_HEIGHT }}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", severity.dotClass)}
                />
                <span className="w-16 shrink-0 text-[length:var(--text-micro)] text-content-secondary">
                  {severity.label}
                </span>
                <span className={cn(MICRO_CLASS, "w-28 truncate")} title={alert.company_id}>
                  {alert.company_name ?? alert.company_id}
                </span>
                <span className="min-w-0 flex-1 truncate text-content-primary" title={alert.message}>
                  {alert.message}
                </span>
                <span className={cn(MICRO_CLASS, "ml-auto")}>{fmtMonth(alert.month_detected)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
