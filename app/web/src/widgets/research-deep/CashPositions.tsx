/**
 * «Dónde está la caja» (XR-038, W2.3): la tabla de evidencia de Liquidez.
 *
 * El pilar dice que la empresa tiene 32 días de colchón; esto dice en qué banco
 * está ese colchón y en qué producto, que es lo que un tesorero mira antes de
 * mover nada. Encima, las dos cifras del informe: saldo total en euros y número
 * de bancos.
 *
 * Tres decisiones que vienen medidas y no se negocian:
 *
 * - **No hay columna «Disponible»**: `balances.available` está vacía en las
 *   7.996 filas del dataset. Pintarla sería una columna entera de guiones.
 * - **Multimoneda sin FX**: el total es SOLO de euros. Hay 39 monedas y ninguna
 *   tabla de cambio, así que las demás se listan aparte con su importe y su
 *   moneda; sumarlas daría una cifra que no es dinero.
 * - **Un producto sin fila en `balances` vale «—», nunca 0**: no saber cuánto
 *   hay no es tener cero. `COMP_0169` tiene uno, el Abanca `CHECKING_03`.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtSize } from "@/charts";
import { ErrorState } from "@/components/states";
import { getCompanyCash } from "@/lib/api-v2";
import type { CashCurrencyTotal, CashRow } from "@/lib/api-v2";
import { productTypeLabel } from "@/lib/definitions";
import { EMPTY_VALUE, formatAmount, formatCount, formatDate } from "@/lib/format";
import {
  EvidenceBlock,
  EvidenceFigure,
  EvidenceNote,
  EvidenceSkeleton,
  EvidenceTable,
  TD_CLASS,
  TD_NUM_CLASS,
  TH_CLASS,
  TH_NUM_CLASS,
} from "@/widgets/research-deep/EvidenceBlock";

const TITLE = "Dónde está la caja";

/** La mediana son 2,5 bancos y el máximo 17: diez filas llenan cualquier caso normal. */
const VISIBLE_ROWS = 10;

/** Clave de caché de los saldos; una por sociedad, sin `as_of` (la foto es única). */
export function cashKey(companyId: string) {
  return ["company-cash", companyId] as const;
}

export function CashPositions({ companyId }: { companyId: string }): ReactElement {
  const query = useQuery({
    queryKey: cashKey(companyId),
    queryFn: () => getCompanyCash(companyId),
  });

  if (query.isPending) return <EvidenceSkeleton title={TITLE} figures={2} />;

  if (query.isError) {
    return (
      <EvidenceBlock title={TITLE}>
        <ErrorState
          error={query.error}
          context="los saldos bancarios"
          onRetry={() => void query.refetch()}
        />
      </EvidenceBlock>
    );
  }

  const { summary, items, as_of } = query.data;

  if (summary.n_products === 0) {
    return (
      <EvidenceBlock title={TITLE}>
        <EvidenceNote>Sin productos bancarios registrados</EvidenceNote>
      </EvidenceBlock>
    );
  }

  const shown = items.slice(0, VISIBLE_ROWS);
  const hidden = summary.n_products - shown.length;
  const others = summary.by_currency.filter((total) => total.currency !== "EUR");

  return (
    <EvidenceBlock title={TITLE}>
      <dl className="grid grid-cols-2 gap-x-4">
        <EvidenceFigure
          label="Saldo total en euros"
          value={fmtSize(summary.total_eur, "EUR")}
          hint="Solo los productos en euros: el dataset trae 39 monedas y ninguna tabla de cambio."
        />
        <EvidenceFigure label="Bancos" value={formatCount(summary.n_banks)} />
      </dl>

      {/* Las demás monedas van enteras y por separado: nunca sumadas al total. */}
      {others.length > 0 ? (
        <EvidenceNote>
          Otras monedas, sin convertir: {others.map(currencyTotal).join(" · ")}
        </EvidenceNote>
      ) : null}

      <EvidenceTable>
        <thead className="text-content-tertiary">
          <tr>
            <th scope="col" className={TH_CLASS}>
              Banco
            </th>
            <th scope="col" className={TH_CLASS}>
              Producto
            </th>
            <th scope="col" className={TH_CLASS}>
              Tipo
            </th>
            <th scope="col" className={TH_CLASS}>
              Moneda
            </th>
            <th scope="col" className={TH_NUM_CLASS}>
              Saldo
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((item) => (
            <Row key={item.product_id} item={item} />
          ))}
        </tbody>
      </EvidenceTable>

      <EvidenceNote>
        {hidden > 0 ? `y ${formatCount(hidden)} productos más · ` : ""}
        {formatCount(summary.n_products)} {summary.n_products === 1 ? "producto" : "productos"} en{" "}
        {formatCount(summary.n_banks)} {summary.n_banks === 1 ? "banco" : "bancos"}
        {as_of ? ` · saldos a ${formatDate(as_of)}` : ""}
      </EvidenceNote>
    </EvidenceBlock>
  );
}

/** `USD 0,00 (1 producto)`: importe, moneda y cuántos productos la llevan. */
function currencyTotal(total: CashCurrencyTotal): string {
  const products = `${formatCount(total.n_products)} ${total.n_products === 1 ? "producto" : "productos"}`;
  return `${fmtSize(total.total, total.currency)} (${products})`;
}

function Row({ item }: { item: CashRow }): ReactElement {
  return (
    <tr className="border-t border-[var(--border-glass)]">
      <th scope="row" className={`${TH_CLASS} text-content-primary`}>
        {item.bank_name}
      </th>
      <td className={`${TD_CLASS} text-content-primary`}>{item.label}</td>
      <td className={`${TD_CLASS} text-content-secondary`}>{productTypeLabel(item.type)}</td>
      <td className={`${TD_CLASS} text-content-secondary`}>{item.currency}</td>
      {/* Sin fila en `balances` no hay saldo que enseñar; un 0 ahí afirmaría
          una cuenta vacía que nadie ha medido. */}
      <td
        className={`${TD_NUM_CLASS} ${
          item.balance === null ? "text-content-tertiary" : "text-content-primary"
        }`}
        title={item.balance === null ? "Este producto no tiene saldo publicado" : undefined}
      >
        {item.balance === null ? EMPTY_VALUE : formatAmount(item.balance)}
      </td>
    </tr>
  );
}
