/**
 * «Posiciones de financiación» (XR-038, W2.3): la tabla de evidencia de Deuda.
 *
 * Lo importante de esta tabla es lo que NO hace.
 *
 * - **No calcula ninguna ratio de utilización** con `granted` y `outstanding`.
 *   Los signos de origen están mezclados y no significan lo mismo en las dos
 *   columnas (`granted` es negativo en 2.043 de 2.239 filas; `outstanding` es
 *   negativo en 1.351, positivo en 155 y cero en 743), así que
 *   `outstanding / granted` daría un número con apariencia de porcentaje y sin
 *   significado. La utilización que el producto enseña es la señal
 *   `loc_utilisation` del motor, que está unas líneas más arriba.
 * - **No pinta una tabla de ceros** para las 908 sociedades (el 70,6 %) que no
 *   tienen ni un producto de financiación: dicen que no hay ninguno.
 * - **No usa `debt_schedule_config`** para el tipo de interés ni el próximo
 *   pago: cubre 40 sociedades (3,1 %) y en `COMP_0169`, con diez productos de
 *   deuda, llega nulo.
 *
 * Los importes vienen en magnitud desde la API y el pie lo dice, porque una
 * cifra sin signo en una tabla de deuda es una afirmación sobre el dato.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/states";
import { getCompanyDebt } from "@/lib/api-v2";
import type { DebtRow } from "@/lib/api-v2";
import { productTypeLabel } from "@/lib/definitions";
import { EMPTY_VALUE, formatAmount, formatCount } from "@/lib/format";
import {
  EvidenceBlock,
  EvidenceNote,
  EvidenceSkeleton,
  EvidenceTable,
  TD_CLASS,
  TD_NUM_CLASS,
  TH_CLASS,
  TH_NUM_CLASS,
} from "@/widgets/research-deep/EvidenceBlock";

const TITLE = "Posiciones de financiación";

/** La media son 5,9 productos y el máximo 123: diez filas y el resto, contado. */
const VISIBLE_ROWS = 10;

const GRANTED_HINT = "Límite concedido por el banco, en magnitud";
const OUTSTANDING_HINT = "Importe dispuesto pendiente de devolver, en magnitud";

export function debtKey(companyId: string) {
  return ["company-debt", companyId] as const;
}

export function DebtPositions({ companyId }: { companyId: string }): ReactElement {
  const query = useQuery({
    queryKey: debtKey(companyId),
    queryFn: () => getCompanyDebt(companyId),
  });

  if (query.isPending) return <EvidenceSkeleton title={TITLE} />;

  if (query.isError) {
    return (
      <EvidenceBlock title={TITLE}>
        <ErrorState
          error={query.error}
          context="los productos de financiación"
          onRetry={() => void query.refetch()}
        />
      </EvidenceBlock>
    );
  }

  const { summary, items } = query.data;

  // El 70,6 % de las sociedades está aquí: no tener deuda es un hecho, no un hueco.
  if (summary.n_products === 0) {
    return (
      <EvidenceBlock title={TITLE}>
        <EvidenceNote>Sin productos de financiación registrados</EvidenceNote>
      </EvidenceBlock>
    );
  }

  const shown = items.slice(0, VISIBLE_ROWS);
  const hidden = summary.n_products - shown.length;

  return (
    <EvidenceBlock title={TITLE}>
      <EvidenceTable>
        <thead className="text-content-tertiary">
          <tr>
            <th scope="col" className={TH_CLASS}>
              Producto
            </th>
            <th scope="col" className={TH_CLASS}>
              Tipo
            </th>
            <th scope="col" className={TH_CLASS}>
              Banco
            </th>
            <th scope="col" className={TH_CLASS}>
              Moneda
            </th>
            <th scope="col" className={TH_NUM_CLASS} title={GRANTED_HINT}>
              Concedido
            </th>
            <th scope="col" className={TH_NUM_CLASS} title={OUTSTANDING_HINT}>
              Saldo vivo
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
        {formatCount(summary.n_banks)} {summary.n_banks === 1 ? "banco" : "bancos"} ·{" "}
        {summary.currencies.join(", ")}
      </EvidenceNote>

      {/* Sin esta frase la tabla afirmaría un signo que el origen no tiene. */}
      <EvidenceNote>
        Concedido es el límite y saldo vivo el dispuesto pendiente, los dos en magnitud: los
        signos de origen están mezclados y de estas dos columnas no sale una utilización.
      </EvidenceNote>
    </EvidenceBlock>
  );
}

function Row({ item }: { item: DebtRow }): ReactElement {
  return (
    <tr className="border-t border-[var(--border-glass)]">
      <th scope="row" className={`${TH_CLASS} text-content-primary`}>
        {item.label}
      </th>
      <td className={`${TD_CLASS} text-content-secondary`}>{productTypeLabel(item.type)}</td>
      <td className={`${TD_CLASS} text-content-primary`}>{item.bank_name}</td>
      <td className={`${TD_CLASS} text-content-secondary`}>{item.currency}</td>
      <td className={`${TD_NUM_CLASS} text-content-secondary`} title={GRANTED_HINT}>
        {item.granted_abs === null ? EMPTY_VALUE : formatAmount(item.granted_abs)}
      </td>
      <td className={`${TD_NUM_CLASS} text-content-primary`} title={OUTSTANDING_HINT}>
        {item.outstanding_abs === null ? EMPTY_VALUE : formatAmount(item.outstanding_abs)}
      </td>
    </tr>
  );
}
