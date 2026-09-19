/**
 * «Cómo se calcula»: el contenido del pop-up homónimo. Cuatro apartados en prosa —qué
 * mide el score, cómo se comporta en el tiempo, qué lo limita y qué significa la
 * confianza— en tarjetas glass a dos columnas por dos filas.
 *
 * Ninguna fórmula: el cliente no ha pedido el modelo término a término, y las que había
 * dependían de `meta.params` y `meta.reference`, que la publicación real nunca rellenó
 * (H2), así que salían con «…» en pantalla. Lo único que se conserva del pop-up viejo
 * son sus dos elementos visuales, que sí funcionaban: la escala de bandas con el score
 * (`BandScale`) y la fila de pesos por pilar (`WeightsRow`), ahora de cabecera.
 *
 * La rejilla no scrollea (`overflow-hidden`, cada tarjeta `min-h-0 overflow-hidden`): si
 * el texto no cupiera a un ancho concreto se recorta el texto, porque que no quepa sería
 * un fallo de redacción y no de layout.
 */

import type { ReactElement } from "react";
import { fmtConfidence } from "@/charts";
import type { Pillar, Pillars, TemporalCompanyV2 } from "@/lib/api-v2";
import { EMPTY_VALUE } from "@/lib/format";
import { BandScale, WeightsRow } from "@/panels/research/MethodologyVisuals";

const TITLE = "Cómo se calcula";

const PILLARS: readonly Pillar[] = ["L", "P", "C", "D", "A"];

/** Los cuatro apartados, en el orden en que se leen: de qué es el score a qué vale. */
const CARDS: readonly { title: string; body: string }[] = [
  {
    title: "Qué mide el Health Score",
    body:
      "Una sola cifra de 0 a 100 que resume la salud financiera observable de la sociedad a " +
      "partir de su operativa bancaria: cinco familias —liquidez, disciplina de pago, calidad " +
      "de cartera, deuda y actividad— ponderadas según su relevancia y según cuánta evidencia " +
      "real hay detrás de cada una. Una familia sin datos suficientes no se inventa: cede su " +
      "peso a las que sí los tienen.",
  },
  {
    title: "Cómo se comporta en el tiempo",
    body:
      "El score no reacciona a un mes aislado. Cada señal se suaviza sobre su propia historia, " +
      "de modo que un pico puntual no mueve la cifra y un cambio sostenido sí. Sobre esa " +
      "lectura estable, el motor identifica el régimen —mejora, deterioro, bache, recuperación " +
      "o estabilidad— para distinguir un vaivén de una tendencia.",
  },
  {
    title: "Qué puede limitar la cifra",
    body:
      "Determinados hechos duros —caja negativa persistente, líneas de crédito agotadas— ponen " +
      "un techo a la puntuación con independencia del resto: una sociedad no puede compensar " +
      "una posición de caja insostenible con buenos indicadores en otra familia. Además, la " +
      "familia más débil descuenta puntos del conjunto, porque la salud financiera la marca el " +
      "eslabón más frágil, no la media.",
  },
  {
    title: "Qué significa la confianza",
    body:
      "Acompaña siempre al score y dice cuánta evidencia lo sostiene: meses de historia " +
      "disponibles, familias con datos y calidad de la información bancaria. Un score alto con " +
      "confianza baja es una lectura provisional, no un veredicto.",
  },
];

const CARD_CLASS =
  "flex min-h-0 flex-col gap-2 overflow-hidden rounded-[var(--radius-card)] bg-surface-glass p-4 shadow-[inset_0_0_0_1px_var(--border-glass)]";

/** Meses publicados de la sociedad; `1 mes` no es `1 meses`. */
function historyText(months: number): string {
  return `${months} ${months === 1 ? "mes" : "meses"}`;
}

/** Cuántas de las cinco familias tienen nota en este corte. */
function coverageText(pillars: Pillars | null): string {
  if (pillars === null) return EMPTY_VALUE;
  const withData = PILLARS.filter((pillar) => pillars[pillar].value !== null).length;
  return withData === PILLARS.length ? "completa" : `${withData} de ${PILLARS.length} familias`;
}

/** Las tres cifras que sostienen el score, con los valores reales de la empresa. */
function Evidence({ company }: { company: TemporalCompanyV2 }): ReactElement {
  const facts: readonly [string, string][] = [
    ["Confianza", fmtConfidence(company.confidence)],
    ["Historia", historyText(company.company.months_hist)],
    ["Cobertura", coverageText(company.pillars)],
  ];
  return (
    <dl className="mt-auto grid shrink-0 grid-cols-3 gap-2 border-t border-border-glass pt-3">
      {facts.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="truncate text-[length:var(--text-micro)] text-content-secondary">
            {label}
          </dt>
          <dd className="num truncate text-[length:var(--text-figure)] text-content-primary">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Methodology({ company }: { company: TemporalCompanyV2 }): ReactElement {
  return (
    <section aria-label={TITLE} className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 items-end gap-4">
        <BandScale score={company.score} />
        <WeightsRow pillars={company.pillars} />
      </div>

      <div
        data-slot="methodology-grid"
        className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3 overflow-hidden"
      >
        {CARDS.map((card, index) => (
          <article key={card.title} data-slot="methodology-card" className={CARD_CLASS}>
            <h4 className="shrink-0 text-[length:var(--text-widget-title)] font-semibold text-content-primary">
              {card.title}
            </h4>
            <p className="min-h-0 overflow-hidden text-[length:var(--text-panel-title)] leading-relaxed text-content-secondary">
              {card.body}
            </p>
            {index === CARDS.length - 1 ? <Evidence company={company} /> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
