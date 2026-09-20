/**
 * Visuales de «Cómo se calcula» en su variante de diálogo: la escala de bandas 0–100
 * con el score como marcador (`BandScale`) y los cinco pesos efectivos de los pilares
 * (`WeightsRow`). Solo pintan lo que ya trae la ficha: los umbrales de banda y el
 * peso base viven en el texto de `Methodology`.
 *
 * Los dos ocupan una fila entera del pop-up, así que sus barras son más gruesas que
 * en la ficha: 10 px en vez de los 6 de `RangeBar`/`PillarBar`. El alto del track lo
 * fijan esos dos primitivos en una constante local con estilo en línea, y media
 * aplicación los comparte; aquí se sube desde fuera, con el mismo recurso que ya usa
 * `PILLAR_FILL_CLASS`: un variante de descendiente sobre el `data-slot`, con `!`
 * porque ha de ganarle al estilo en línea del primitivo.
 */

import type { CSSProperties, ReactElement } from "react";
import { PillarBar, RangeBar, fmtU } from "@/charts";
import type { Band, Pillar, Pillars } from "@/lib/api-v2";
import { FAMILY_LABEL, PILLAR_TOKEN } from "@/lib/definitions";
import { BAND_LABEL } from "@/lib/regime";

/** De peor a mejor, como los tramos de `RangeBar variant="segmented"`. */
const SCALE_BANDS: readonly Band[] = ["stress", "watch", "healthy", "solid"];
const PILLARS: readonly Pillar[] = ["L", "P", "C", "D", "A"];

const SCORE_MIN = 0;
const SCORE_MAX = 100;

/**
 * El relleno de `PillarBar` colorea por tramo de nota; un peso no es una nota, así que
 * aquí se pinta con el token del pilar a través de su `data-slot`.
 */
const PILLAR_FILL_CLASS = "[&_[data-slot=pillar-bar-fill]]:bg-(--pillar-token)!";

/** Escala a 10 px: el track, el punto del score y sus dos extremos, que suben a 13. */
const SCALE_BAR_CLASS =
  "[&_[data-slot=range-bar-track]]:h-[10px]! [&_[data-slot=range-bar-dot]]:size-[12px]! [&_[data-slot=range-bar-label]]:text-[length:var(--text-body)]!";

/** Pesos a 10 px: el track de cada una de las cinco familias. */
const WEIGHT_BAR_CLASS = "[&_[data-slot=pillar-bar-track]]:h-[10px]!";

/** Etiqueta de banda y de familia: a `--text-body` y en blanco, no en secundario. */
const LABEL_CLASS = "text-[length:var(--text-body)] text-content-primary";

export function BandScale({ score }: { score: number | null }): ReactElement {
  return (
    <div className={`flex flex-col gap-1.5 ${SCALE_BAR_CLASS}`}>
      {score === null ? (
        <p className="text-[length:var(--text-body)] text-content-secondary">
          Sin score en este corte
        </p>
      ) : (
        <RangeBar
          min={SCORE_MIN}
          max={SCORE_MAX}
          value={score}
          labels={{ min: String(SCORE_MIN), max: String(SCORE_MAX) }}
          variant="segmented"
        />
      )}
      <div className="grid grid-cols-4 text-center">
        {SCALE_BANDS.map((band) => (
          <span key={band} className={LABEL_CLASS}>
            {BAND_LABEL[band]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function WeightsRow({ pillars }: { pillars: Pillars | null }): ReactElement {
  return (
    <div className={`grid grid-cols-5 gap-3 ${WEIGHT_BAR_CLASS}`}>
      {PILLARS.map((pillar) => (
        <div
          key={pillar}
          className={`flex flex-col gap-1.5 ${PILLAR_FILL_CLASS}`}
          style={{ "--pillar-token": PILLAR_TOKEN[pillar] } as CSSProperties}
        >
          <div className="flex items-baseline justify-between gap-2 text-[length:var(--text-body)]">
            <span className={`truncate ${LABEL_CLASS}`}>{FAMILY_LABEL[pillar]}</span>
            <span className="num text-content-primary">
              {fmtU(pillars?.[pillar].weight ?? null)}
            </span>
          </div>
          <PillarBar
            value={pillars?.[pillar].weight ?? 0}
            label={`Peso efectivo de ${FAMILY_LABEL[pillar]}`}
          />
        </div>
      ))}
    </div>
  );
}
