/**
 * «Señales»: las cinco que más mueven el score, con números grandes. Cada celda dice
 * el título corto con ⓘ, el valor legible (`value_fmt`, o «No aplica» si la señal no
 * aplica: nunca un 0) y su contribución en puntos con tono. Sin fórmulas: la
 * metodología vive en el pop-up de Investigación profunda.
 */

import type { ReactElement } from "react";
import { fmtSignedPoints } from "@/charts";
import { InfoTip } from "@/components/ui/info-tip";
import type { Driver } from "@/lib/api-v2";
import type { SignalId } from "@/lib/definitions";
import { SHORT_LABEL, SIGNAL_DEFINITION } from "@/lib/definitions";

const TERM_CLASS =
  "flex items-center gap-1 text-[length:var(--text-micro)] text-content-secondary";

export function TopDrivers({ drivers }: { drivers: readonly Driver[] }): ReactElement {
  return (
    <section
      aria-label="Señales"
      className="flex shrink-0 flex-col gap-2 border-t border-border-glass pt-3"
    >
      <h3 className="text-[length:var(--text-micro)] font-semibold tracking-wide text-content-secondary uppercase">
        Señales
      </h3>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
        {drivers.map((driver) => {
          const label = SHORT_LABEL[driver.signal_id as SignalId] ?? driver.signal_id;
          const definition = SIGNAL_DEFINITION[driver.signal_id as SignalId];
          const contribution = fmtSignedPoints(driver.contribution);
          const available = driver.value !== null;
          return (
            <div key={driver.signal_id} className="flex min-w-0 flex-col gap-0.5">
              <dt className={TERM_CLASS}>
                <span className="truncate" title={label}>
                  {label}
                </span>
                {definition ? <InfoTip title={label} definition={definition} /> : null}
              </dt>
              <dd className="flex min-w-0 flex-col">
                {available ? (
                  <span
                    className="num truncate text-[length:var(--text-panel-title)] font-semibold text-content-primary"
                    title={driver.value_fmt ?? undefined}
                  >
                    {driver.value_fmt}
                  </span>
                ) : (
                  <span className="text-[length:var(--text-panel-title)] text-content-secondary">
                    No aplica
                  </span>
                )}
                <span
                  className="num text-[length:var(--text-micro)]"
                  style={{ color: contribution.tone }}
                >
                  {contribution.text}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
