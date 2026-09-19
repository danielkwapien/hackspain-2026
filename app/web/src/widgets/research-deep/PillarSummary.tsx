/**
 * Una familia de señales en Investigación profunda: la línea resumen del pilar
 * («Liquidez · P 0,62 · peso efectivo 0,25 · 4 de 5 señales disponibles») y sus
 * señales con `FamilyStats`, siempre a las cifras del corte.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtU } from "@/charts";
import { ErrorState } from "@/components/states";
import type { CompanyV2, Pillar } from "@/lib/api-v2";
import { getCompanySignals } from "@/lib/api-v2";
import { FAMILY_LABEL } from "@/lib/definitions";
import { companySignalsKey } from "@/lib/query-keys";
import { FamilyStats, FamilyStatsSkeleton } from "@/panels/research/FamilyStats";

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

  return (
    <section aria-label={`Familia ${FAMILY_LABEL[family]}`} className="flex flex-col gap-2">
      <p className="num text-[length:var(--text-control)] text-content-secondary">
        {FAMILY_LABEL[family]} · P {fmtU(company.pillars[family].value)} · peso efectivo{" "}
        {fmtU(company.pillars[family].weight)}
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
    </section>
  );
}
