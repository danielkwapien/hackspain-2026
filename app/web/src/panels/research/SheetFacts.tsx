/**
 * Línea de contexto de la ficha: las etiquetas de fortaleza del mes (condiciones
 * observables del motor, `core/publication_rows.STRENGTH_FLAGS`). Nada se recalcula
 * aquí y un valor ausente no pinta nada en vez de un cero.
 *
 * La operativa de los doce meses se mudó a la fila de identidad (XR-037, E8), que es
 * donde vive el resto de lo que describe a la entidad. Los tres campos del dinero
 * siguen siendo opcionales aquí porque la ficha de grupo todavía los pasa; la de
 * empresa ya no.
 */

import type { ReactElement } from "react";
import { STRENGTH_LABEL, humanizeCode } from "@/lib/definitions";
import { EMPTY_VALUE, formatAmount } from "@/lib/format";

/**
 * La operativa 12 m con su moneda explícita: la de la entidad cuando la publica y,
 * si no (grano grupo), la consolidada en EUR. `null` cuando no hay cifra.
 */
export function entityMoney({
  opIn12m,
  currency,
  opIn12mEur,
}: {
  opIn12m: number | null | undefined;
  currency: string | null | undefined;
  opIn12mEur?: number | null;
}): string | null {
  const amount = opIn12m ?? opIn12mEur;
  if (amount == null) return null;
  const unit = opIn12m == null ? "EUR" : (currency ?? EMPTY_VALUE);
  return `${formatAmount(amount)} ${unit}`;
}

export function SheetFacts({
  opIn12m,
  currency,
  opIn12mEur,
  flags,
}: {
  /** Cifra en la moneda de la entidad; el grano grupo solo trae `opIn12mEur`. */
  opIn12m?: number | null;
  currency?: string | null;
  /** Cifra consolidada en EUR (tabla constante §3.3). */
  opIn12mEur?: number | null;
  flags: readonly string[] | undefined;
}): ReactElement | null {
  const money = entityMoney({ opIn12m, currency, opIn12mEur });
  const labels = flags ?? [];
  if (money === null && labels.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-micro)] text-content-secondary">
      {money === null ? null : <span className="num">Operativa 12 m {money}</span>}
      {labels.map((flag) => (
        <span
          key={flag}
          className="rounded-[var(--radius-control)] bg-surface-glass px-1.5 py-0.5 shadow-[inset_0_0_0_1px_var(--border-glass)]"
        >
          {STRENGTH_LABEL[flag] ?? humanizeCode(flag)}
        </span>
      ))}
    </div>
  );
}
