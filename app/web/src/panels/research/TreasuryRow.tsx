/**
 * «Tesorería»: la fila de seis cifras que un director financiero busca primero, bajo
 * la fila de pilares (XR-037, E13).
 *
 * Sustituye a «Señales», que pintaba los cinco drivers de mayor contribución y con eso
 * repetía la fila de pilares de justo encima (tres de las cinco celdas) y las
 * perspectivas de justo debajo (las otras dos, además con «No aplica» en la cifra
 * grande, porque una perspectiva no tiene `value_fmt`).
 *
 * Todo lo que hay aquí está publicado y medido:
 * - cuatro señales de `/signals`, las de mejor cobertura del catálogo (93-99 % de las
 *   1.286 sociedades) y ninguna de ellas visible en la fila de pilares, que enseña el
 *   agregado de la familia y no la señal;
 * - dos cifras del libro de clientes, del endpoint de contrapartes de XR-036.
 *
 * Nada de burn rate: no está publicado como señal y derivarlo pide una query y un
 * endpoint nuevos. `buffer_days` YA es el runway —días de caja sobre salidas
 * operativas—, que es la misma información sin trabajo de backend.
 *
 * La ventana la dice el catálogo, no la memoria: `neg_cash_share` es de 3 meses (de ahí
 * el pie «últimos 3 meses» y no «de 12»), y `cash_trend` compara 3 meses con los 3
 * previos.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtPointsBare, fmtSize, fmtSizeShort } from "@/charts";
import { Skeleton } from "@/components/ui/skeleton";
import type { CounterpartySummary, SignalV2 } from "@/lib/api-v2";
import { getCompanySignals, getCounterparties } from "@/lib/api-v2";
import { EMPTY_VALUE, formatAmount, formatCount } from "@/lib/format";
import { companySignalsKey, counterpartiesKey } from "@/lib/query-keys";
import { CELL_CLASS, CompactValue, compactFigure } from "@/panels/research/KpiRow";

const TERM_CLASS =
  "text-[length:var(--text-micro)] leading-tight text-balance text-content-secondary";
const FIGURE_CLASS = "text-[length:var(--text-figure)] font-semibold leading-tight";

const POSITIVE = "var(--content-positive)";
const NEGATIVE = "var(--content-negative)";
const NEUTRAL = "var(--content-secondary)";

type Card = {
  key: string;
  label: string;
  /** Frase entera (`title` y lector de pantalla); `null` = «No aplica». */
  full: string | null;
  /** Cifra compacta a la vista. */
  figure: string | null;
  /** Color de la cifra; sin tono, el blanco de una cifra cualquiera. */
  tone?: string;
  /** Pie en micro: la ventana de la señal o la variación del mes. */
  caption: string | null;
};

/** La señal por su id, la busque el motor en el pilar que la busque. */
function signalOf(pillars: readonly { signals: readonly SignalV2[] }[], id: string): SignalV2 | null {
  for (const pillar of pillars) {
    const found = pillar.signals.find((signal) => signal.signal_id === id);
    if (found) return found;
  }
  return null;
}

/** La señal solo cuando aplica y trae frase: nunca el 0 crudo que viaja debajo. */
type Available = { value: number | null; fmt: string; deltaVsPrev: number | null };

function available(signal: SignalV2 | null): Available | null {
  if (signal === null || !signal.is_available || signal.value_fmt === null) return null;
  return { value: signal.value, fmt: signal.value_fmt, deltaVsPrev: signal.delta_vs_prev };
}

/**
 * La cifra compacta de una señal, recortada a lo que cabe: a 20 px y a una sexta parte
 * de la fila, «+100,0 %» se sale por siete píxeles. Por encima de las tres cifras la
 * décima es ruido sobre un salto de ese tamaño, así que se va; «+41,4 %» la conserva.
 */
function treasuryFigure(valueFmt: string): string {
  return compactFigure(valueFmt).replace(/(\d{3,}),\d+/u, "$1");
}

/** «+2,4 d» / «−2,4 d»: una decimal y el menos tipográfico del contrato visual. */
function signedDays(value: number): string {
  return `${value > 0 ? "+" : ""}${fmtPointsBare(value)} d`;
}

/** Tono por el signo del valor, con la orientación de la señal («más es mejor»). */
function toneOf(value: number | null | undefined, higherIsBetter: boolean): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return NEUTRAL;
  const good = value > 0 === higherIsBetter;
  return good ? POSITIVE : NEGATIVE;
}

function cards(
  pillars: readonly { signals: readonly SignalV2[] }[],
  summary: CounterpartySummary | null,
  currency: string,
): Card[] {
  const buffer = available(signalOf(pillars, "buffer_days"));
  const trend = available(signalOf(pillars, "cash_trend"));
  const negative = available(signalOf(pillars, "neg_cash_share"));
  const ocf = available(signalOf(pillars, "net_ocf_ratio"));
  const effective = summary?.effective_counterparties ?? null;
  const overdue = summary?.overdue_total ?? null;

  return [
    {
      key: "buffer_days",
      label: "Runway de caja",
      full: buffer?.fmt ?? null,
      figure: buffer === null ? null : treasuryFigure(buffer.fmt),
      caption:
        buffer !== null && buffer.deltaVsPrev !== null
          ? `${signedDays(buffer.deltaVsPrev)} en el mes`
          : null,
    },
    {
      key: "cash_trend",
      label: "Tendencia de caja",
      full: trend?.fmt ?? null,
      figure: trend === null ? null : treasuryFigure(trend.fmt),
      tone: toneOf(trend?.value, true),
      caption: "3 m frente a los 3 previos",
    },
    {
      key: "neg_cash_share",
      label: "Meses en negativo",
      full: negative?.fmt ?? null,
      figure: negative === null ? null : treasuryFigure(negative.fmt),
      tone: negative !== null && (negative.value ?? 0) > 0 ? NEGATIVE : NEUTRAL,
      caption: "últimos 3 meses",
    },
    {
      key: "net_ocf_ratio",
      label: "Flujo operativo neto",
      full: ocf?.fmt ?? null,
      figure: ocf === null ? null : treasuryFigure(ocf.fmt),
      tone: toneOf(ocf?.value, true),
      caption: "cobros menos pagos, 3 m",
    },
    {
      key: "effective_counterparties",
      label: "Concentración de clientes",
      full: effective === null ? null : `${formatAmount(effective)} clientes efectivos`,
      figure: effective === null ? null : formatAmount(effective),
      caption:
        summary && summary.n_counterparties > 0
          ? `de ${formatCount(summary.n_counterparties)} en 12 m`
          : null,
    },
    {
      key: "overdue_total",
      label: "Vencido de clientes",
      full: overdue === null ? null : fmtSize(overdue, currency),
      // `fmtSizeShort` sin moneda: a 20 px «EUR 31,8 k» no cabe en una sexta parte de
      // la fila, así que la moneda baja al pie y la cifra se queda sola.
      figure: overdue === null ? null : fmtSizeShort(overdue, "").trim(),
      tone: overdue !== null && overdue > 0 ? NEGATIVE : NEUTRAL,
      caption: `${currency} · facturas vencidas`,
    },
  ];
}

export function TreasuryRow({ id }: { id: string }): ReactElement | null {
  const signals = useQuery({
    queryKey: companySignalsKey(id),
    queryFn: () => getCompanySignals(id),
  });
  // Solo el lado `ar`: la fila habla del dinero que entra, no del libro de proveedores.
  const counterparties = useQuery({
    queryKey: counterpartiesKey(id, "ar", "weight"),
    queryFn: () => getCounterparties(id, "ar"),
  });

  if (signals.isPending || counterparties.isPending) return <TreasurySkeleton />;
  // Fila accesoria: si la fuente falla, la ficha sigue en pie sin ella. El error de
  // `/signals` ya tiene su `ErrorState` cuando el usuario pide una familia.
  if (signals.isError || signals.data === undefined) return null;

  const summary = counterparties.isError ? null : (counterparties.data?.summary ?? null);
  const currency = counterparties.data?.currency ?? "EUR";

  return (
    <section
      aria-label="Tesorería"
      className="flex shrink-0 flex-col gap-2 border-t border-border-glass pt-3"
    >
      <h3 className="text-[length:var(--text-micro)] font-semibold tracking-wide text-content-secondary uppercase">
        Tesorería
      </h3>
      <dl className="grid grid-cols-6 gap-2" style={{ minHeight: "var(--size-stat-row)" }}>
        {cards(signals.data.pillars, summary, currency).map((card) => (
          <div key={card.key} className={CELL_CLASS}>
            <dt className={TERM_CLASS} title={card.label}>
              {card.label}
            </dt>
            <dd className="flex min-w-0 flex-col">
              {card.full === null || card.figure === null ? (
                <span className="text-[length:var(--text-body)] text-content-secondary">
                  No aplica
                </span>
              ) : (
                <CompactValue
                  full={card.full}
                  figure={card.figure}
                  className={FIGURE_CLASS}
                  style={{ color: card.tone ?? "var(--content-primary)" }}
                />
              )}
              <span className="text-[length:var(--text-micro)] leading-tight text-content-secondary">
                {card.full === null ? EMPTY_VALUE : (card.caption ?? EMPTY_VALUE)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Seis tarjetas con la forma de la fila mientras llegan señales y contrapartes. */
function TreasurySkeleton(): ReactElement {
  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-t border-border-glass pt-3"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando tesorería</span>
      <div className="grid grid-cols-6 gap-2" style={{ minHeight: "var(--size-stat-row)" }}>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={CELL_CLASS}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
