/**
 * Pop-up «Cómo se calcula»: `Dialog size="full"` con cabecera visible (título, nombre
 * de la empresa y cerrar) y `Methodology variant="grid"`. Señales, timeline, meta y
 * catálogo se piden aquí, bajo las mismas claves que Investigación, así que si ese
 * widget ya las cargó no hay ninguna petición nueva.
 */

import type { ReactElement, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import type { CompanyV2 } from "@/lib/api-v2";
import { getCatalogSignals, getCompanySignals, getCompanyTimeline, getMeta, isTemporalCompany } from "@/lib/api-v2";
import { catalogKey, companySignalsKey, companyTimelineKey, metaKey } from "@/lib/query-keys";
import { Methodology } from "@/panels/research/Methodology";
import { SnapshotSheet } from "@/panels/research/SnapshotSheet";

export const METHODOLOGY_TITLE = "Cómo se calcula";

const CLOSE_CLASS =
  "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-content-secondary transition-[background-color,transform] duration-[var(--duration-fast)] motion-reduce:transition-none [@media(hover:hover)]:hover:bg-surface-glass-hover [@media(hover:hover)]:hover:scale-[1.02] active:scale-[.97] focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

/** Cabecera visible de los dos pop-ups: título, nombre de la empresa, extras y cerrar. */
export function DialogHeader({
  title,
  company,
  onClose,
  children,
}: {
  title: string;
  company: string;
  onClose: () => void;
  children?: ReactNode;
}): ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border-glass px-4 py-3">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 text-[length:var(--text-panel-title)] font-semibold text-content-primary">
          {title}
        </span>
        <span
          className="min-w-0 truncate text-[length:var(--text-body)] text-content-secondary"
          title={company}
        >
          {company}
        </span>
      </div>
      {children}
      <button type="button" aria-label="Cerrar" className={CLOSE_CLASS} onClick={onClose}>
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

export function MethodologyDialog({
  company,
  onClose,
}: {
  company: CompanyV2;
  onClose: () => void;
}): ReactElement {
  const id = company.company.company_id;
  const signals = useQuery({
    queryKey: companySignalsKey(id),
    queryFn: () => getCompanySignals(id),
    enabled: isTemporalCompany(company),
  });
  const timeline = useQuery({
    queryKey: companyTimelineKey(id),
    queryFn: () => getCompanyTimeline(id),
    enabled: isTemporalCompany(company),
  });
  const meta = useQuery({ queryKey: metaKey, queryFn: getMeta, staleTime: Infinity });
  const catalog = useQuery({
    queryKey: catalogKey,
    queryFn: getCatalogSignals,
    staleTime: Infinity,
    enabled: isTemporalCompany(company),
  });

  return (
    <Dialog label={METHODOLOGY_TITLE} size="full" onClose={onClose}>
      <DialogHeader title={METHODOLOGY_TITLE} company={company.company.name} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isTemporalCompany(company) ? (
          <Methodology
            company={company}
            signals={signals.data}
            timeline={timeline.data}
            meta={meta.data}
            catalog={catalog.data}
            error={meta.isError || catalog.isError}
            variant="grid"
          />
        ) : (
          <SnapshotSheet company={company} />
        )}
      </div>
    </Dialog>
  );
}
