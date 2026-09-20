/**
 * «Últimos movimientos» (XR-038, W2.3): la tabla de evidencia de Actividad.
 *
 * `transactions` es la tabla más rica del dataset (2,5 M de filas) y la que
 * menos se enseñaba. Lo que la hace legible es lo que se deja fuera:
 *
 * - **La descripción NO es la columna principal, ni aparece.** El 77,6 % de las
 *   descripciones lleva marcadores de anonimización (1.636.103 de 2.555.981):
 *   una fila real es «COR [X] PRO ENERGY [IBAN] OS00480 … [COMPANY] [COMPANY]».
 *   Lo que identifica un movimiento aquí es **categoría + banco/producto**, y
 *   por eso la categoría es la cabecera de fila.
 * - **La categoría `-` se etiqueta «Sin clasificar» y no se esconde**: son
 *   635.530 movimientos en 1.213 sociedades, la mayor de todas, y ocultarla
 *   falsearía el desglose.
 * - **El corte manda**: la API filtra `date <= as_of` (`2026-08-01`). Sin
 *   filtrar, el último movimiento de `COMP_0169` es de `2026-09-01`, un mes por
 *   delante de lo que ha visto el score de al lado.
 * - **Un producto fuera de los dos catálogos (1.314 movimientos) da «—»**, no
 *   descarta la fila: el movimiento ocurrió.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/states";
import { getCompanyActivity } from "@/lib/api-v2";
import type { ActivityRow } from "@/lib/api-v2";
import { movementCategoryLabel, movementStatusLabel } from "@/lib/definitions";
import { EMPTY_VALUE, formatAmount, formatCount, formatDate } from "@/lib/format";
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

const TITLE = "Últimos movimientos";

/** Doce filas: las que caben bajo las señales sin convertir el panel en un extracto. */
const LIMIT = 12;

export function activityKey(companyId: string, limit: number) {
  return ["company-activity", companyId, limit] as const;
}

export function RecentActivity({ companyId }: { companyId: string }): ReactElement {
  const query = useQuery({
    queryKey: activityKey(companyId, LIMIT),
    queryFn: () => getCompanyActivity(companyId, LIMIT),
  });

  if (query.isPending) return <EvidenceSkeleton title={TITLE} rows={6} />;

  if (query.isError) {
    return (
      <EvidenceBlock title={TITLE}>
        <ErrorState
          error={query.error}
          context="los movimientos"
          onRetry={() => void query.refetch()}
        />
      </EvidenceBlock>
    );
  }

  const { items, as_of } = query.data;
  const cutoff = as_of ? formatDate(as_of) : null;

  if (items.length === 0) {
    return (
      <EvidenceBlock title={TITLE}>
        <EvidenceNote>
          Sin movimientos registrados{cutoff ? ` hasta el ${cutoff}` : ""}
        </EvidenceNote>
      </EvidenceBlock>
    );
  }

  return (
    <EvidenceBlock title={TITLE}>
      <EvidenceTable>
        <thead className="text-content-tertiary">
          <tr>
            <th scope="col" className={TH_CLASS}>
              Fecha
            </th>
            <th scope="col" className={TH_CLASS}>
              Categoría
            </th>
            <th scope="col" className={TH_CLASS}>
              Banco · producto
            </th>
            <th scope="col" className={TH_NUM_CLASS}>
              Importe
            </th>
            <th scope="col" className={TH_CLASS}>
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <Row key={item.transaction_id} item={item} />
          ))}
        </tbody>
      </EvidenceTable>

      <EvidenceNote>
        {formatCount(items.length)} {items.length === 1 ? "movimiento" : "movimientos"} más
        recientes{cutoff ? ` hasta el corte del ${cutoff}` : ""}
      </EvidenceNote>
    </EvidenceBlock>
  );
}

/** `Caixabank Empresas · LINEOFCREDIT_03`, y «—» si el producto no está en los catálogos. */
function origin(item: ActivityRow): string {
  const parts = [item.bank_name, item.product_label].filter((part) => part !== null);
  return parts.length === 0 ? EMPTY_VALUE : parts.join(" · ");
}

function Row({ item }: { item: ActivityRow }): ReactElement {
  // Tono por signo: una entrada se marca, una salida es lo normal en un extracto
  // y pintarla en rojo convertiría cada pago corriente en una alarma.
  const amountClass = item.amount > 0 ? "text-content-positive" : "text-content-primary";

  return (
    <tr className="border-t border-[var(--border-glass)]">
      <td className={`${TD_CLASS} text-content-secondary`}>{formatDate(item.date)}</td>
      <th scope="row" className={`${TH_CLASS} text-content-primary`}>
        {movementCategoryLabel(item.category)}
      </th>
      <td className={`${TD_CLASS} text-content-secondary`}>{origin(item)}</td>
      <td className={`${TD_NUM_CLASS} ${amountClass}`}>{formatAmount(item.amount)}</td>
      <td className={`${TD_CLASS} text-content-secondary`}>
        {movementStatusLabel(item.status)}
      </td>
    </tr>
  );
}
