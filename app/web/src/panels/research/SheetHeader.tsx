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

/** Presupuesto de la narrativa: unas dos líneas a `--text-micro` en la cabecera. */
const NARRATIVE_BUDGET = 180;

/**
 * Narrativa de la cabecera por frases enteras. Antes la línea llevaba `truncate` y
 * se cortaba a media palabra («… el pila…»): una frase mutilada engaña más que una
 * frase de menos. Se añaden frases mientras quepan en el presupuesto y la primera
 * se enseña siempre, aunque se pase.
 */
export function narrativeLine(headline: string, body: string | null): string {
  const full = body ? `${headline} · ${body}` : headline;
  if (full.length <= NARRATIVE_BUDGET) return full;
  const [first, ...rest] = full.split(/(?<=\.)\s+/);
  let text = first;
  for (const sentence of rest) {
    if (text.length + 1 + sentence.length > NARRATIVE_BUDGET) break;
    text = `${text} ${sentence}`;
  }
  return text;
}

export function SheetHeader({
  name,
  score,
  delta,
  rangeLabel,
  confidence,
  outlook6,
  month,
  narrative,
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
  /** Lectura publicada del mes; sin ella no se pinta nada. */
  narrative?: { headline: string | null; body: string | null } | null;
}): ReactElement {
  const change = fmtDelta(delta);

  return (
    <header className="flex shrink-0 items-baseline justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className="min-w-0 truncate text-[length:var(--text-panel-title)] font-semibold text-content-primary"
          title={name}
        >
          {name}
        </span>
        {narrative?.headline ? (
          <span
            className="min-w-0 text-[length:var(--text-micro)] text-pretty text-content-secondary"
            title={narrative.body ? `${narrative.headline} · ${narrative.body}` : narrative.headline}
          >
            {narrativeLine(narrative.headline, narrative.body)}
          </span>
        ) : null}
      </div>

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
