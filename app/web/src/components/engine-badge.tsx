import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

/**
 * Estado del motor analítico. Toda entidad real está `pending_engine`:
 * el badge no muestra cifras, solo el estado de cálculo.
 */
export function EngineBadge({
  status = "pending_engine",
  className,
}: {
  status?: string;
  className?: string;
}) {
  const pending = status === "pending_engine";
  return (
    <Badge
      variant="outline"
      className={cn(
        pending ? "border-warning/40 text-warning" : "border-border text-muted-foreground",
        className,
      )}
      title={
        pending
          ? "Score pendiente de cálculo (motor analítico en construcción)"
          : "Resultado del motor analítico"
      }
    >
      {pending ? "Pendiente" : status}
    </Badge>
  );
}
