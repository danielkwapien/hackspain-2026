/**
 * Cabecera de la ficha: nombre a la izquierda y, a la derecha, el `dl` con Score ·
 * Δ del rango · Confianza · Outlook 6 m. Como en Trade Republic, al pasar el ratón por
 * la gráfica las cifras pasan a ser las del mes apuntado y el Score lleva el sufijo
 * `· MM/AAAA`; `aria-live` avisa del cambio a quien no ve el crosshair.
 */

import type { ReactElement } from "react";
import { fmtConfidence, fmtDelta, fmtMonth, fmtPoints } from "@/charts";

const TERM_CLASS = "text-[length:var(--text-micro)] text-content-secondary";
const VALUE_CLASS = "num text-[length:var(--text-body)] text-content-primary";

export function SheetHeader({
  name,
  score,
  delta,
  rangeLabel,
  confidence,
  outlook6,
  month,
}: {
  name: string;
  score: number | null;
  /** Puntos ganados en el rango hasta el mes activo o el corte; `null` sin dos puntos. */
  delta: number | null;
  rangeLabel: string;
  confidence: number | null;
  outlook6: number | null;
  /** Mes apuntado en la gráfica; `null` = el corte. */
  month: string | null;
}): ReactElement {
  const change = fmtDelta(delta);

  return (
    <header className="flex shrink-0 items-baseline justify-between gap-3">
      <span
        className="min-w-0 truncate text-[length:var(--text-panel-title)] font-semibold text-content-primary"
        title={name}
      >
        {name}
      </span>

      <dl aria-live="polite" className="flex shrink-0 items-baseline gap-4 text-right">
        <div>
          <dt className={TERM_CLASS}>Score</dt>
          <dd className="num text-[length:var(--text-figure)] font-semibold text-content-primary">
            {fmtPoints(score)}
            {month ? <span className={TERM_CLASS}>{` · ${fmtMonth(month)}`}</span> : null}
          </dd>
        </div>
        <div>
          <dt className={TERM_CLASS}>{`Δ ${rangeLabel}`}</dt>
          <dd className="num text-[length:var(--text-body)]" style={{ color: change.tone }}>
            {change.text}
          </dd>
        </div>
        <div>
          <dt className={TERM_CLASS}>Confianza</dt>
          <dd className={VALUE_CLASS}>{fmtConfidence(confidence)}</dd>
        </div>
        <div>
          <dt className={TERM_CLASS}>Outlook 6 m</dt>
          <dd className={VALUE_CLASS}>{fmtPoints(outlook6)}</dd>
        </div>
      </dl>
    </header>
  );
}
