import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, REGENERATE_EXPORTS_COMMAND } from "@/lib/api";

/** Carga de una tabla densa: filas de esqueleto con la misma retícula. */
export function LoadingTable({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 py-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos</span>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-3">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cn("h-4", column === 0 ? "w-32" : "w-full max-w-24")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Carga de un bloque de contenido (ficha, panel, lista de alertas). */
export function LoadingPanel({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2 py-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos</span>
      {Array.from({ length: lines }, (_, line) => (
        <Skeleton key={line} className={cn("h-4", line === 0 ? "w-48" : "w-full")} />
      ))}
    </div>
  );
}

/** Estado vacío de una sección o de un listado completo. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-4 py-6">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Inbox aria-hidden="true" className="size-4 text-muted-foreground" />
        {title}
      </div>
      {description ? (
        <p className="max-w-3xl text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Nota breve para secciones sin datos suficientes en esta sociedad. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/** Error de API con causa visible y reintento manual. */
export function ErrorState({
  error,
  onRetry,
  context,
}: {
  error: unknown;
  onRetry?: () => void;
  context?: string;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const message = error instanceof Error ? error.message : "Error desconocido al consultar la API.";

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-4"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {context ? `No se pudieron cargar ${context}.` : "No se pudieron cargar los datos."}
          </p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </div>

      {apiError?.isNoExports ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Faltan los exports del dataset. Genéralos con este comando:</p>
          <code className="block w-fit rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground">
            {REGENERATE_EXPORTS_COMMAND}
          </code>
        </div>
      ) : null}

      {!apiError?.isNoExports && apiError?.hint ? (
        <p className="text-xs text-muted-foreground">{apiError.hint}</p>
      ) : null}

      {apiError?.isUnreachable ? (
        <p className="text-xs text-muted-foreground">
          La dirección de la API se configura con la variable VITE_API_URL.
        </p>
      ) : null}

      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
