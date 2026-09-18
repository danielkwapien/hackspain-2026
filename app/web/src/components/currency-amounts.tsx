import { cn } from "cn";
import type { CurrencyAmount } from "@/lib/api";
import { EMPTY_VALUE, formatAmount } from "@/lib/format";

/**
 * Totales por moneda, nunca consolidados: cada moneda se pinta en su propia
 * línea. Sin importes disponibles muestra «—».
 */
export function CurrencyAmounts({
  amounts,
  signed = false,
  className,
}: {
  amounts: CurrencyAmount[];
  signed?: boolean;
  className?: string;
}) {
  if (amounts.length === 0) {
    return <span className="num text-muted-foreground">{EMPTY_VALUE}</span>;
  }

  return (
    <div className={cn("space-y-0.5", className)}>
      {amounts.map((amount) => (
        <div key={amount.currency} className="num whitespace-nowrap">
          {signed && amount.total > 0 ? "+" : ""}
          {formatAmount(amount.total)}{" "}
          <span className="text-muted-foreground">{amount.currency}</span>
        </div>
      ))}
    </div>
  );
}
