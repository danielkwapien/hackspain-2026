import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyNote, EmptyState, ErrorState, LoadingPanel } from "@/components/states";
import { getMonitor } from "@/lib/api";
import type { MonitorAlert } from "@/lib/api";
import { formatDateTime, formatMonth } from "@/lib/format";

const DEMO_BANNER_FALLBACK =
  "DEMO — datos sintéticos de ejemplo; no son resultados del motor ni del dataset";

const SEVERITY_LABELS: Record<string, string> = {
  high: "Severidad alta",
  medium: "Severidad media",
  low: "Severidad baja",
};

const DIRECTION_LABELS: Record<string, string> = {
  improvement: "Mejora",
  deterioration: "Deterioro",
};

const INBOX_CONTENT = [
  "Alertas del motor analítico con la sociedad afectada y enlace a su ficha.",
  "Dirección del cambio (mejora o deterioro) y mes de referencia.",
  "Motivo redactado y evidencia numérica que lo respalda.",
  "Severidad asignada por el motor.",
];

function AlertCard({ alert }: { alert: MonitorAlert }) {
  const direction = DIRECTION_LABELS[alert.kind] ?? alert.kind;
  const severity = SEVERITY_LABELS[alert.severity] ?? alert.severity;
  const evidence = Object.entries(alert.evidence ?? {});

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num text-xs text-muted-foreground">{formatMonth(alert.month)}</span>
          <Badge variant="outline" className="border-warning/40 text-warning">
            {direction}
          </Badge>
          <Badge variant="secondary">{severity}</Badge>
          <Link
            to={`/companies/${alert.company_id}`}
            className="num text-xs text-primary hover:underline"
          >
            {alert.company_id}
          </Link>
        </div>
        <CardTitle className="text-sm font-medium">{alert.message}</CardTitle>
      </CardHeader>
      <CardContent>
        {evidence.length === 0 ? (
          <EmptyNote>Sin evidencia publicada para esta alerta de ejemplo.</EmptyNote>
        ) : (
          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium">Evidencia</summary>
            <dl className="mt-2 space-y-1 text-xs">
              {evidence.map(([key, value]) => (
                <div key={key} className="flex flex-wrap justify-between gap-2">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="num">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export function MonitorPage() {
  const [params, setParams] = useSearchParams();
  const demo = params.get("demo") === "1";

  const monitorQuery = useQuery({
    queryKey: ["monitor", demo],
    queryFn: () => getMonitor(demo),
  });

  const alerts = useMemo(
    () =>
      [...(monitorQuery.data?.alerts ?? [])].sort((a, b) =>
        String(b.month).localeCompare(String(a.month)),
      ),
    [monitorQuery.data],
  );

  const setDemo = (enabled: boolean) => {
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        if (enabled) updated.set("demo", "1");
        else updated.delete("demo");
        return updated;
      },
      { replace: true },
    );
  };

  const isDemoPayload = demo && monitorQuery.data?.demo === true;
  const isMotherDuck = monitorQuery.data?.source === "motherduck";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Monitor</h1>
          <p className="text-xs text-muted-foreground">
            Bandeja de alertas publicadas por el motor, por sociedad.
          </p>
        </div>
        {!isMotherDuck && <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Modo demostración (fixtures)</span>
          <Button
            type="button"
            size="sm"
            variant={demo ? "default" : "outline"}
            aria-pressed={demo}
            onClick={() => setDemo(!demo)}
          >
            {demo ? "Activado" : "Desactivado"}
          </Button>
        </div>}
      </div>

      {demo && !isMotherDuck ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-xs text-warning"
        >
          <span>{monitorQuery.data?.banner ?? DEMO_BANNER_FALLBACK}</span>
          {monitorQuery.data?.generated_at ? (
            <span className="num">
              {`Fixture generado ${formatDateTime(monitorQuery.data.generated_at)}`}
            </span>
          ) : null}
        </div>
      ) : null}

      {monitorQuery.isError ? (
        <ErrorState
          error={monitorQuery.error}
          context="la bandeja del monitor"
          onRetry={() => monitorQuery.refetch()}
        />
      ) : !monitorQuery.data ? (
        <LoadingPanel lines={6} />
      ) : isMotherDuck ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sin alertas publicadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <p>{monitorQuery.data.note ?? "El modelo importado contiene una foto por empresa, sin detección temporal de alertas."}</p>
            <p>Una bandeja vacía no implica ausencia de riesgo. Consulta el score, su cobertura y los factores de cada empresa.</p>
          </CardContent>
        </Card>
      ) : demo ? (
        <div className="space-y-3">
          {monitorQuery.data.note ? (
            <EmptyNote>{monitorQuery.data.note}</EmptyNote>
          ) : null}

          {!isDemoPayload ? (
            <ErrorState
              error={new Error(
                "La API no ha devuelto el modo demostración: la respuesta no está marcada como fixture.",
              )}
            />
          ) : alerts.length === 0 ? (
            <EmptyState
              title="El fixture de demostración no contiene alertas"
              description="Comprueba el contenido de app/fixtures/v1/monitor-demo.json."
            />
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="text-sm">Motor pendiente</CardTitle>
            <p className="text-xs text-muted-foreground">
              El motor analítico todavía no publica resultados, así que no hay alertas que mostrar.
              No se generan alertas a partir de los datos observados ni se muestran ejemplos como si
              fueran resultados.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cuando el motor publique resultados, esta bandeja se llenará con:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {INBOX_CONTENT.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {monitorQuery.data.note ? <EmptyNote>{monitorQuery.data.note}</EmptyNote> : null}
            <EmptyNote>
              El modo demostración carga alertas sintéticas identificadas como fixture y siempre
              aparece con su propio aviso. No está activo por defecto.
            </EmptyNote>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
