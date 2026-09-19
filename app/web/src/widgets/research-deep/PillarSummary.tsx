/**
 * Una familia de señales en Investigación profunda: la línea resumen del pilar
 * («Liquidez · P 0,62 · peso efectivo 0,25 · 4 de 5 señales disponibles») y sus
 * señales con `FamilyStats`, siempre a las cifras del corte.
 *
 * En Pago y Cobros, además, las contrapartes (XR-035). Las señales dicen que la
 * cartera va tarde; las contrapartes dicen quién la lleva tarde, que es lo que
 * faltaba debajo de esos dos pilares y lo que llenaba de vacío el tercio
 * inferior de la pestaña. Las otras tres familias no tienen libro de
 * contrapartes y se quedan exactamente como estaban.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtU } from "@/charts";
import { ErrorState } from "@/components/states";
import type { CompanyV2, CounterpartySide, Pillar } from "@/lib/api-v2";
import { getCompanySignals } from "@/lib/api-v2";
import { FAMILY_LABEL } from "@/lib/definitions";
import { companySignalsKey } from "@/lib/query-keys";
import { FamilyStats, FamilyStatsSkeleton } from "@/panels/research/FamilyStats";
import { Counterparties } from "@/widgets/research-deep/Counterparties";

/**
 * El lado del libro que explica cada pilar. Pago es a quien debes; Cobros,
 * quien te debe. Las otras tres familias no tienen contraparte que enseñar.
 */
const COUNTERPARTY_SIDE: Partial<Record<Pillar, CounterpartySide>> = {
  P: "ap",
  C: "ar",
};

export function PillarSummary({
  company,
  family,
}: {
  company: CompanyV2;
  family: Pillar;
}): ReactElement {
  const id = company.company.company_id;
  const signals = useQuery({
    queryKey: companySignalsKey(id),
    queryFn: () => getCompanySignals(id),
  });
  const pillar = signals.data?.pillars.find((candidate) => candidate.pillar === family);
  const available = pillar ? pillar.signals.filter((signal) => signal.is_available).length : null;
  const current = company.pillars?.[family] ?? null;
  const side = COUNTERPARTY_SIDE[family];

  return (
    <section aria-label={`Familia ${FAMILY_LABEL[family]}`} className="flex flex-col gap-2">
      <p className="num text-[length:var(--text-control)] text-content-secondary">
        {FAMILY_LABEL[family]} · P {fmtU(current?.value)} · peso efectivo {fmtU(current?.weight)}
        {pillar && available !== null
          ? ` · ${available} de ${pillar.signals.length} señales disponibles`
          : ""}
      </p>
      {signals.isPending ? <FamilyStatsSkeleton /> : null}
      {signals.isError ? (
        <ErrorState
          error={signals.error}
          context="las señales"
          onRetry={() => void signals.refetch()}
        />
      ) : null}
      {pillar ? <FamilyStats signals={pillar.signals} activeMonth={null} /> : null}
      {side ? <Counterparties companyId={id} side={side} /> : null}
    </section>
  );
}
