import { EngineBadge } from "@/components/engine-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EngineResult } from "@/lib/api";
import { EMPTY_VALUE, formatAmount, formatMonth } from "@/lib/format";

const PENDING_CAPABILITIES = [
  "Score de salud financiera de la sociedad y su trayectoria mensual.",
  "Contribuciones por señal: qué indicador mueve el resultado y cuánto aporta.",
  "Cambio frente al mes anterior, con el detalle del cálculo.",
  "Alertas del motor con dirección, mes y evidencia.",
  "Previsión separada del score, etiquetada como tal.",
];

/**
 * Panel del motor analítico. Cada estado del contrato se pinta distinto:
 * `pending_engine` explica qué llegará, `insufficient_data` lista motivos,
 * `partial` muestra el número con aviso de cobertura y `available` el resultado completo.
 */
export function EnginePanel({ engine }: { engine: EngineResult }) {
  const hasScore = typeof engine.score === "number";
  const months = engine.months ?? [];
  const alerts = engine.alerts ?? [];
  const coverageReasons = engine.quality?.reasons ?? engine.quality?.notes ?? [];
  const isPending = engine.status === "pending_engine";
  const isInsufficient = engine.status === "insufficient_data";
  const direction = typeof engine.trajectory === "string" ? engine.trajectory : engine.trajectory?.direction;
  const trajectory = !direction || direction === "unknown" ? "Sin trayectoria publicada" : direction;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm">Score y trayectoria</CardTitle>
        <EngineBadge status={engine.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <>
            <p className="text-sm font-medium text-warning">Pendiente de cálculo</p>
            <p className="text-xs text-muted-foreground">
              El motor analítico todavía no publica resultados para esta sociedad. Esta pantalla ya
              respeta el contrato de resultados y mostrará, en cuanto existan:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {PENDING_CAPABILITIES.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Mientras no haya resultados no se muestra ningún valor orientativo, estimación ni
              alerta sobre los datos de esta sociedad.
            </p>
          </>
        ) : null}

        {isInsufficient ? (
          <>
            <p className="text-sm font-medium text-warning">Datos insuficientes</p>
            <p className="text-xs text-muted-foreground">
              El motor ha evaluado esta sociedad y no publica número: la cobertura disponible no
              permite calcularlo. No se sustituye por cero ni por una estimación.
            </p>
            {coverageReasons.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {coverageReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                El resultado no detalla motivos de cobertura.
              </p>
            )}
          </>
        ) : null}

        {hasScore ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Score</dt>
              <dd className="num text-base">{formatAmount(engine.score)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Trayectoria</dt>
              <dd>{trajectory}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Estado del resultado</dt>
              <dd>{engine.status}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Versión de contrato</dt>
              <dd className="num">{engine.contract_version ?? EMPTY_VALUE}</dd>
            </div>
          </dl>
        ) : null}

        {hasScore && engine.status === "partial" ? (
          <p className="text-xs text-warning">
            Resultado parcial: el motor lo publica con cobertura incompleta.
            {coverageReasons.length > 0 ? ` Motivos: ${coverageReasons.join("; ")}.` : ""}
          </p>
        ) : null}

        {hasScore && months.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((month, index) => (
                  <TableRow key={`${month.month ?? "sin-mes"}-${index}`}>
                    <TableCell className="num">{formatMonth(month.month)}</TableCell>
                    <TableCell className="num text-right">{formatAmount(month.score)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {!isPending ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">Alertas del motor</p>
            {alerts.length === 0 ? (
              <p>El motor no ha publicado alertas para esta sociedad.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {alerts.map((alert, index) => (
                  <li key={alert.id ?? `${alert.month ?? "sin-mes"}-${index}`}>
                    {`${formatMonth(alert.month)} · ${alert.severity ?? "sin severidad"} · ${alert.message ?? "sin motivo publicado"}`}
                  </li>
                ))}
              </ul>
            )}
            {engine.forecast !== null && engine.forecast !== undefined ? (
              <p>El motor publica también una previsión, separada del score.</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
