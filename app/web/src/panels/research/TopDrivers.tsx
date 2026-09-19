/**
 * «Señales»: las cinco que más mueven el score, con números grandes. Cada celda dice
 * el título corto con ⓘ, la cifra compacta de `value_fmt` (la frase entera en `title`
 * y para el lector de pantalla; «No aplica» si la señal no aplica: nunca un 0) y su
 * contribución en puntos con tono. Los drivers del motor (`PENALTY`, `CAP`) también
 * llevan etiqueta; un id sin etiqueta cae al código en minúsculas. Sin fórmulas: la
 * metodología vive en el pop-up de Investigación profunda.
 */

import type { ReactElement } from "react";
import { fmtSignedPoints } from "@/charts";
import { InfoTip } from "@/components/ui/info-tip";
import type { Driver, Pillar } from "@/lib/api-v2";
import type { DriverId } from "@/lib/definitions";
import { FAMILY_LABEL, SIGNAL_DEFINITION, driverLabel } from "@/lib/definitions";
import { CompactValue, compactFigure } from "@/panels/research/KpiRow";

const TERM_CLASS =
  "flex items-center gap-1 text-[length:var(--text-micro)] text-content-secondary";

/** «pilar mas debil Deuda y coste de financiacion en 0,39» → «pilar más débil: Deuda». */
function driverFigure(driver: Driver, full: string): string {
  if (driver.signal_id === "PENALTY" && driver.pillar in FAMILY_LABEL) {
    return `pilar más débil: ${FAMILY_LABEL[driver.pillar as Pillar]}`;
  }
  return compactFigure(full);
}

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
          const label = driverLabel(driver);
          const definition = SIGNAL_DEFINITION[driver.signal_id as DriverId];
          const contribution = fmtSignedPoints(driver.contribution);
          const valueFmt = driver.value === null ? null : driver.value_fmt;
          return (
            <div key={driver.signal_id} className="flex min-w-0 flex-col gap-0.5">
              <dt className={TERM_CLASS}>
                <span className="truncate" title={label}>
                  {label}
                </span>
                {definition ? <InfoTip title={label} definition={definition} /> : null}
              </dt>
              <dd className="flex min-w-0 flex-col">
                {valueFmt !== null ? (
                  <CompactValue
                    full={valueFmt}
                    figure={driverFigure(driver, valueFmt)}
                    className="text-[length:var(--text-panel-title)] font-semibold text-content-primary"
                  />
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
