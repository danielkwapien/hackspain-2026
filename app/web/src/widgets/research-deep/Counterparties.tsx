/**
 * Contrapartes bajo los pilares de Pago y Cobros (XR-035).
 *
 * La ficha ya dice que el pilar de cobros de una empresa vale 29,9 puntos y que
 * es el más débil. Nunca decía QUIÉN lo lleva. Este bloque es esa evidencia:
 * en Cobros, los clientes que te deben; en Pago, los proveedores a los que
 * debes. Misma mecánica, mismo componente, los dos lados del libro.
 *
 * Arriba, las dos cifras que resumen la dependencia: cuánto pesa la mayor y
 * cuántas contrapartes de igual peso darían esta misma concentración (`1/HHI`),
 * que es la forma de decir «efectivamente trabajas con tres» sin explicar qué
 * es un índice. Abajo, la tabla ordenable, que es lo que convierte la lista en
 * algo sobre lo que actuar.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkline, fmtPct, fmtSizeShort } from "@/charts";
import { ErrorState } from "@/components/states";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { getCounterparties } from "@/lib/api-v2";
import type { CounterpartyRow, CounterpartySide, CounterpartySort } from "@/lib/api-v2";
import { EMPTY_VALUE, formatCount } from "@/lib/format";
import { counterpartiesKey } from "@/lib/query-keys";

const SORT_OPTIONS: readonly { value: CounterpartySort; label: string }[] = [
  { value: "weight", label: "Peso" },
  { value: "deterioration", label: "Deterioro" },
];

/** Cada lado tiene su vocabulario: ni «contraparte» ni un genérico vacío. */
const COPY: Record<CounterpartySide, { title: string; empty: string; one: string; many: string }> = {
  ap: {
    title: "Proveedores",
    empty: "Sin proveedores en euros en la ventana",
    one: "proveedor",
    many: "proveedores",
  },
  ar: {
    title: "Clientes",
    empty: "Sin clientes en euros en la ventana",
    one: "cliente",
    many: "clientes",
  },
};

/** Cuántas filas se pintan: la mediana son 29 proveedores y 10 clientes, así
 *  que diez llenan la pantalla sin obligar a desplazarse dentro del panel. */
const VISIBLE_ROWS = 10;

export function Counterparties({
  companyId,
  side,
}: {
  companyId: string;
  side: CounterpartySide;
}): ReactElement {
  const [sort, setSort] = useState<CounterpartySort>("weight");
  const copy = COPY[side];
  const query = useQuery({
    queryKey: counterpartiesKey(companyId, side, sort),
    queryFn: () => getCounterparties(companyId, side, sort),
  });

  if (query.isPending) return <CounterpartiesSkeleton title={copy.title} />;

  if (query.isError) {
    return (
      <section aria-label={copy.title} className="flex flex-col gap-2">
        <Header title={copy.title} />
        <ErrorState
          error={query.error}
          context="las contrapartes"
          onRetry={() => void query.refetch()}
        />
      </section>
    );
  }

  const { summary, items } = query.data;

  if (summary.n_counterparties === 0) {
    return (
      <section aria-label={copy.title} className="flex flex-col gap-2">
        <Header title={copy.title} />
        <p className="text-[length:var(--text-micro)] text-content-tertiary">{copy.empty}</p>
      </section>
    );
  }

  const shown = items.slice(0, VISIBLE_ROWS);
  const hidden = summary.n_counterparties - shown.length;

  return (
    <section aria-label={copy.title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Header title={copy.title} />
        <Segmented value={sort} options={SORT_OPTIONS} onChange={setSort} label="Ordenar por" />
      </div>

      <dl className="grid grid-cols-2 gap-x-4">
        <Figure
          label="Peso de la mayor"
          value={summary.top1_weight === null ? EMPTY_VALUE : pct(summary.top1_weight)}
        />
        <Figure
          label="Contrapartes efectivas"
          value={
            summary.effective_counterparties === null
              ? EMPTY_VALUE
              : summary.effective_counterparties.toLocaleString("es-ES", {
                  maximumFractionDigits: 1,
                })
          }
        />
      </dl>

      <table className="w-full border-collapse text-[length:var(--text-micro)]">
        <thead className="text-content-tertiary">
          <tr>
            <th scope="col" className="py-1 text-left font-normal">
              {copy.title}
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              12 m
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Peso
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Desvío
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Vencido
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Tendencia
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((item) => (
            <Row key={item.counterparty_id} item={item} />
          ))}
        </tbody>
      </table>

      <p className="text-[length:var(--text-micro)] text-content-tertiary">
        {hidden > 0 ? `y ${formatCount(hidden)} ${hidden === 1 ? copy.one : copy.many} más · ` : ""}
        {formatCount(summary.n_counterparties)}{" "}
        {summary.n_counterparties === 1 ? copy.one : copy.many} en 12 m
        {/* La cobertura va dicha, no supuesta: las tablas solo llevan euros y
            sin esta frase la pantalla afirmaría enseñar el libro entero. */}
        {summary.eur_share !== null && summary.eur_share < 0.999
          ? ` · ${pct(summary.eur_share)} del importe en euros`
          : " · importes en euros"}
      </p>
    </section>
  );
}

function Header({ title }: { title: string }): ReactElement {
  return (
    <h3 className="text-[length:var(--text-control)] font-semibold text-content-primary">
      {title}
    </h3>
  );
}

function Figure({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex flex-col justify-center gap-1 py-1">
      <dt className="text-[length:var(--text-micro)] text-content-secondary">{label}</dt>
      <dd className="num text-[length:var(--text-control)] text-content-primary">{value}</dd>
    </div>
  );
}

/**
 * Una cuota no es un delta: `fmtPct` antepone «+» a los positivos, que es lo
 * correcto para una variación y engañoso para un peso. Aquí siempre es una
 * parte de un total, así que el signo sobra.
 */
function pct(share: number): string {
  return fmtPct(share * 100).replace("+", "");
}

/** `COUNTERPARTY_09820` no cabe y no dice nada: se enseña su número. */
function shortName(id: string): string {
  const tail = id.replace(/^COUNTERPARTY_/, "");
  return tail === id ? id : `CP ${tail}`;
}

function Row({ item }: { item: CounterpartyRow }): ReactElement {
  // Sin ninguna factura pagada en ventana no hay desvío que enseñar. Un 0 ahí
  // afirmaría puntualidad que nadie ha medido.
  const deviation =
    item.days_late_w === null
      ? EMPTY_VALUE
      : `${item.days_late_w > 0 ? "+" : ""}${item.days_late_w.toLocaleString("es-ES", {
          maximumFractionDigits: 0,
        })} d`;

  return (
    <tr className="border-t border-[var(--border-glass)]">
      <th scope="row" className="py-1 text-left font-normal text-content-primary">
        <span title={item.counterparty_id}>{shortName(item.counterparty_id)}</span>
      </th>
      <td className="num py-1 text-right text-content-secondary">
        {fmtSizeShort(item.amount_12m, "EUR")}
      </td>
      <td className="num py-1 text-right text-content-primary">
        {item.weight === null ? EMPTY_VALUE : pct(item.weight)}
      </td>
      <td
        className={`num py-1 text-right ${
          item.days_late_w !== null && item.days_late_w > 0
            ? "text-content-primary"
            : "text-content-secondary"
        }`}
      >
        {deviation}
      </td>
      <td className="num py-1 text-right text-content-secondary">
        {item.overdue_total ? fmtSizeShort(item.overdue_total, "EUR") : EMPTY_VALUE}
      </td>
      <td className="py-1 text-right">
        <span className="inline-flex justify-end align-middle">
          <Sparkline points={item.sparkline_12} width={56} height={16} />
        </span>
      </td>
    </tr>
  );
}

function CounterpartiesSkeleton({ title }: { title: string }): ReactElement {
  return (
    <section aria-label={title} className="flex flex-col gap-2" aria-busy="true">
      <Header title={title} />
      <div className="grid grid-cols-2 gap-x-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-4 w-full" />
      ))}
    </section>
  );
}
