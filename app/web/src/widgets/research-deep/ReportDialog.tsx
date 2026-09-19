/**
 * Pop-up «Informe de Health»: el informe pregenerado por Claude para la empresa.
 * Cabecera con el chip de riesgo, resumen destacado, secciones a dos columnas desde
 * `@3xl`, la lista «Qué vigilar» y el pie con fecha y modelo. Mientras llega,
 * skeleton; si falla (no un 404, que deshabilita la tarjeta), `ErrorState` con reintento.
 */

import type { ReactElement } from "react";
import { cn } from "cn";
import { ErrorState } from "@/components/states";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { CompanyV2, HealthReport, RiskLevel } from "@/lib/api-v2";
import { DialogHeader } from "@/widgets/research-deep/MethodologyDialog";
import { generatedLine } from "@/widgets/research-deep/useCompanyReport";
import type { CompanyReport } from "@/widgets/research-deep/useCompanyReport";

export const REPORT_TITLE = "Informe de Health";

const RISK: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "Riesgo bajo", className: "text-content-positive" },
  medium: { label: "Riesgo medio", className: "text-content-alert" },
  high: { label: "Riesgo alto", className: "text-content-negative" },
};

const SKELETON_SECTIONS = 4;

function ReportBody({ report }: { report: HealthReport }): ReactElement {
  return (
    <div className="@container flex flex-col gap-4">
      <p className="text-[length:var(--text-panel-title)] leading-snug text-content-primary">
        {report.summary}
      </p>
      <div className="grid gap-4 @3xl:grid-cols-2">
        {report.sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-1">
            <h3 className="text-[length:var(--text-control)] font-semibold text-content-primary">
              {section.title}
            </h3>
            <p className="text-[length:var(--text-body)] text-content-secondary">{section.body}</p>
          </section>
        ))}
      </div>
      <section className="flex flex-col gap-1">
        <h3 className="text-[length:var(--text-control)] font-semibold text-content-primary">
          Qué vigilar
        </h3>
        <ul className="list-disc pl-4 text-[length:var(--text-body)] text-content-secondary">
          {report.watch_next.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>
      <p className="num text-[length:var(--text-micro)] text-content-secondary">
        {generatedLine(report, true)}
      </p>
    </div>
  );
}

function ReportSkeleton(): ReactElement {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Cargando informe</span>
      <Skeleton className="h-5 w-3/4" />
      {Array.from({ length: SKELETON_SECTIONS }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ReportDialog({
  company,
  report,
  onClose,
}: {
  company: CompanyV2;
  report: CompanyReport;
  onClose: () => void;
}): ReactElement {
  const { query } = report;
  const risk = query.data ? RISK[query.data.risk_level] : null;

  return (
    <Dialog label={REPORT_TITLE} size="full" onClose={onClose}>
      <DialogHeader title={REPORT_TITLE} company={company.company.name} onClose={onClose}>
        {risk ? (
          <span
            className={cn(
              "shrink-0 rounded-[var(--radius-pill)] bg-surface-glass px-2 py-0.5 text-[length:var(--text-micro)] font-semibold",
              risk.className,
            )}
          >
            {risk.label}
          </span>
        ) : null}
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {query.isPending ? <ReportSkeleton /> : null}
        {query.isError ? (
          <ErrorState
            error={query.error}
            context="el informe de Health"
            onRetry={() => void query.refetch()}
          />
        ) : null}
        {query.data ? <ReportBody report={query.data} /> : null}
      </div>
    </Dialog>
  );
}
