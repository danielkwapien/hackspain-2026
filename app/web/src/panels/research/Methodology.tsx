/**
 * «Cómo se calcula»: el contenido del pop-up homónimo. Dos filas de cabecera a ancho
 * completo —la escala de bandas con el score (`BandScale`) y los pesos de las cinco
 * familias (`WeightsRow`)— y debajo seis tarjetas: cinco bloques de prosa y la de las
 * fórmulas.
 *
 * La prosa cuenta el motor sin publicar el modelo: se habla de suavizado sobre la
 * propia historia, de reparto de peso por evidencia, de las dos pasadas, de los techos
 * por hechos duros y del eslabón más débil, pero no salen ni los pesos por señal, ni
 * las anclas, ni los umbrales de régimen. De ahí que la prosa no lleve una sola cifra:
 * las únicas del pop-up son las de la empresa (score, pesos, confianza, historia y
 * cobertura), que ya viajan en la ficha.
 *
 * Las dos fórmulas son un elemento visual, no el contenido: enseñan la forma de la
 * cuenta —composición por familias y la identidad del score— y nada de lo que la
 * calibra. Van con `.num` (tabular-nums), que es la monoespaciada de este producto:
 * `design/tokens.test.ts` prohíbe una segunda familia, porque la del sistema es una
 * sola (Inter).
 *
 * Nada scrollea (`overflow-hidden` en la sección, en la rejilla y en cada tarjeta):
 * el criterio dice que el pop-up entra entero a 1440 × 900 y a 1280 × 800, así que si
 * el texto no cupiera se recorta la redacción, nunca se reactiva el scroll.
 */

import type { ReactElement } from "react";
import { fmtConfidence } from "@/charts";
import type { Pillar, Pillars, TemporalCompanyV2 } from "@/lib/api-v2";
import { EMPTY_VALUE } from "@/lib/format";
import { BandScale, WeightsRow } from "@/panels/research/MethodologyVisuals";

const TITLE = "Cómo se calcula";

const PILLARS: readonly Pillar[] = ["L", "P", "C", "D", "A"];

/** Los cinco bloques, en el orden en que se leen: de qué es el score a qué vale. */
const CARDS: readonly { title: string; body: readonly string[] }[] = [
  {
    title: "Qué mide el Health Score",
    body: [
      "El Health Score resume en una sola cifra, de cero a cien, la salud financiera " +
        "observable de una sociedad. No opina sobre su negocio: mide lo que su operativa " +
        "bancaria deja ver mes a mes.",
      "Detrás hay cinco familias —liquidez, disciplina de pago, calidad de cobro, deuda y " +
        "actividad— con sus propias señales. La cifra no es la media de las cinco: es el " +
        "resultado de componerlas y de ajustarlas por lo que la evidencia permite afirmar.",
    ],
  },
  {
    title: "Cómo se lee cada señal",
    body: [
      "Cada señal se normaliza contra la propia historia de la sociedad, no contra una tabla " +
        "externa. Lo que pesa no es el valor absoluto, sino a qué distancia está de como esa " +
        "sociedad suele estar.",
      "Sobre esa lectura se aplica un suavizado que da más peso a los meses recientes sin " +
        "descartar los anteriores: un pico aislado no mueve el score y un desplazamiento " +
        "sostenido sí lo mueve.",
    ],
  },
  {
    title: "Cómo se compone la cifra",
    body: [
      "La composición va en dos pasadas. En la primera las señales se agregan en una nota por " +
        "familia y las notas de familia en un nivel: el peso se reparte por evidencia, de modo " +
        "que una familia sin datos suficientes cede su peso a las que sí los tienen.",
      "En la segunda, las perspectivas —tendencia, aceleración, estacionalidad y ciclo— entran " +
        "como modificadores acotados: matizan la lectura, nunca le dan la vuelta.",
    ],
  },
  {
    title: "Qué limita la cifra",
    body: [
      "Ciertos hechos duros imponen un techo con independencia del resto: una caja negativa " +
        "persistente o unas líneas de crédito agotadas fijan un máximo que ninguna otra familia " +
        "compensa.",
      "Al techo se suma la penalización del eslabón más débil: la familia peor valorada " +
        "descuenta puntos del conjunto. La salud de una tesorería la marca su punto frágil, no " +
        "el promedio de sus virtudes.",
    ],
  },
  {
    title: "Qué significa la confianza",
    body: [
      "La confianza acompaña siempre al score y dice cuánta evidencia lo sostiene: meses de " +
        "historia publicados, familias con datos y calidad de la información bancaria recibida.",
      "Un score alto con confianza baja es una lectura provisional, no un veredicto: conviene " +
        "tratarlo como una hipótesis que la historia todavía no ha confirmado.",
    ],
  },
];

/** Las dos que ilustran la forma de la cuenta sin destriparla. */
const FORMULAS: readonly string[] = [
  "nivel = Σ peso_familia × nota_familia",
  "score = nivel − penalización − techo",
];

const CARD_CLASS =
  "flex min-h-0 flex-col gap-2 overflow-hidden rounded-[var(--radius-card)] bg-surface-glass p-4 shadow-[inset_0_0_0_1px_var(--border-glass)]";

const CARD_TITLE_CLASS =
  "shrink-0 text-[length:var(--text-section)] font-semibold text-content-primary";

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
    <section aria-label={TITLE} className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div data-slot="methodology-visuals" className="flex shrink-0 flex-col gap-3">
        <BandScale score={company.score} />
        <WeightsRow pillars={company.pillars} />
      </div>

      <div
        data-slot="methodology-grid"
        className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-3 overflow-hidden"
      >
        {CARDS.map((card) => (
          <article key={card.title} data-slot="methodology-card" className={CARD_CLASS}>
            <h4 className={CARD_TITLE_CLASS}>{card.title}</h4>
            <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
              {card.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-[length:var(--text-body)] leading-relaxed text-content-secondary"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ))}

        <article data-slot="methodology-formulas" className={CARD_CLASS}>
          <h4 className={CARD_TITLE_CLASS}>La cifra, en dos líneas</h4>
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            {FORMULAS.map((formula) => (
              <code
                key={formula}
                className="num block truncate rounded-[var(--radius-control)] bg-surface-raised px-3 py-2 text-[length:var(--text-body)] text-content-primary"
              >
                {formula}
              </code>
            ))}
            <p className="text-[length:var(--text-body)] leading-relaxed text-content-secondary">
              Los pesos por señal, las anclas y los umbrales de régimen quedan fuera: lo que se
              publica es la forma de la cuenta, no su calibración.
            </p>
          </div>
          <Evidence company={company} />
        </article>
      </div>
    </section>
  );
}
