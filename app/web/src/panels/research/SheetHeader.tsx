/**
 * Cabecera de la ficha: nombre a la izquierda y, a la derecha, el `dl` con Score ·
 * Confianza · Outlook 6 m. Sin narrativa bajo el nombre (XR-037): repetía el score que
 * está a la derecha y destripaba la mecánica del motor.
 *
 * El nombre es el elemento de mayor peso tipográfico de la ficha (XR-037, E6): la
 * entidad analizada no puede pesar lo mismo que el título del widget que la contiene.
 * El delta del rango viaja dentro de la celda del score, entre paréntesis (E7.b); el
 * rótulo «Δ 1A» sobra porque el selector de rango está 40 px más abajo y es el que
 * manda, y el `title` lo recuerda a quien pase el ratón.
 *
 * Como en Trade Republic, al pasar el ratón por la gráfica las cifras pasan a ser las
 * del mes apuntado y el Score lleva el sufijo `· MM/AAAA`; `aria-live` avisa del
 * cambio a quien no ve el crosshair.
 */

import type { ReactElement } from "react";
import { cn } from "cn";
import { fmtConfidence, fmtDelta, fmtMonth, fmtPoints, fmtPointsBare } from "@/charts";
import { EMPTY_VALUE } from "@/lib/format";
import { confidenceClass } from "@/lib/regime";

const TERM_CLASS = "text-[length:var(--text-control)] text-content-secondary";
const VALUE_CLASS = "num text-[length:var(--text-body)]";

/** La unidad acompaña a la cifra, no compite con ella (XR-038, W1.2). */
const UNIT_CLASS = "text-[length:var(--text-body)] text-content-secondary";

/** El espacio fino del contrato visual, el mismo que pone `fmtPoints`. Va en el
 *  texto y no en un `gap`: «81,1pts» se lee mal y se dicta peor. */
const UNIT_POINTS = "\u2009pts";

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
  const bare = fmtPointsBare(score);

  return (
    <header className="flex shrink-0 items-baseline justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className="min-w-0 truncate text-[length:var(--text-figure)] font-semibold text-content-primary"
          title={name}
        >
          {name}
        </span>
      </div>

      <dl aria-live="polite" className="flex shrink-0 items-baseline gap-4">
        <div className="text-center">
          <dt className={TERM_CLASS}>Score</dt>
          <dd className="flex items-baseline justify-center gap-1.5">
            <span className="flex items-baseline">
              <span className="num text-[length:var(--text-figure-lg)] font-semibold text-content-primary">
                {bare}
              </span>
              {/* El «pts» vuelve (W1.2): la cifra desnuda no dice de qué son
                  81,1. Sin score no hay unidad que poner detrás de un «—». */}
              {bare === EMPTY_VALUE ? null : <span className={UNIT_CLASS}>{UNIT_POINTS}</span>}
            </span>
            {change.text === EMPTY_VALUE ? null : (
              <span
                className="num text-[length:var(--text-control)]"
                style={{ color: change.tone }}
                title={`Δ ${rangeLabel}`}
              >
                {`(${change.text})`}
              </span>
            )}
            {month ? (
              <span className="text-[length:var(--text-control)] text-content-secondary">
                {`· ${fmtMonth(month)}`}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="text-center">
          <dt className={TERM_CLASS}>Confianza</dt>
          {/* El color califica la cifra (E7.c): rojo solo por debajo del 15 %. */}
          <dd
            className={cn(
              "num text-[length:var(--text-figure)] font-semibold",
              confidenceClass(confidence),
            )}
          >
            {fmtConfidence(confidence)}
          </dd>
        </div>
        {/* La perspectiva solo aparece cuando existe. Enseñarla vacía en el sitio
            más visible de la ficha es prometer algo que no se cumple: hoy el
            motor no publica previsión, porque medida no aportaba sobre el nivel
            (ver features/NOTES.md, bloque 4). */}
        {outlook6 === null || outlook6 === undefined ? null : (
          <div className="text-center">
            <dt className={TERM_CLASS}>Outlook 6 m</dt>
            <dd className={cn(VALUE_CLASS, "text-content-primary")}>{fmtPoints(outlook6)}</dd>
          </div>
        )}
      </dl>
    </header>
  );
}
