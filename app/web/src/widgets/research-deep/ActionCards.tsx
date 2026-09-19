/**
 * Las dos tarjetas al pie de Investigación profunda: «Cómo se calcula» e «Informe de
 * Health». Cada una es un botón glass que abre su pop-up a pantalla completa. La del
 * informe pide `/report` nada más pintarse: con 404 queda deshabilitada y explica por
 * qué; con otro error sigue activa y el diálogo ofrece reintentar.
 */

import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { BookOpen, Sparkles } from "lucide-react";
import type { CompanyV2 } from "@/lib/api-v2";
import { METHODOLOGY_TITLE, MethodologyDialog } from "@/widgets/research-deep/MethodologyDialog";
import { REPORT_TITLE, ReportDialog } from "@/widgets/research-deep/ReportDialog";
import {
  REPORT_UNAVAILABLE,
  generatedLine,
  useCompanyReport,
} from "@/widgets/research-deep/useCompanyReport";

type OpenDialog = "methodology" | "report" | null;

const CARD_CLASS =
  "flex min-w-0 items-center gap-3 rounded-[var(--radius-card)] bg-surface-glass px-3 py-2 text-left shadow-[inset_0_0_0_1px_var(--border-glass)] transition-[background-color,transform,opacity] duration-[var(--duration-fast)] motion-reduce:transition-none [@media(hover:hover)]:hover:bg-surface-glass-hover [@media(hover:hover)]:hover:scale-[1.02] active:scale-[.97] focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:active:scale-100";

function Card({
  icon,
  title,
  subtext,
  onClick,
  disabled = false,
  reason,
  busy = false,
}: {
  icon: ReactNode;
  title: string;
  subtext: string;
  onClick: () => void;
  disabled?: boolean;
  /** `title` nativo que explica por qué está deshabilitada. */
  reason?: string;
  busy?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      className={CARD_CLASS}
      onClick={onClick}
      disabled={disabled}
      title={reason}
      aria-busy={busy || undefined}
    >
      <span className="shrink-0 text-content-secondary">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[length:var(--text-control)] font-semibold text-content-primary">
          {title}
        </span>
        <span className="truncate text-[length:var(--text-micro)] text-content-secondary">
          {subtext}
        </span>
      </span>
    </button>
  );
}

function reportSubtext(report: ReturnType<typeof useCompanyReport>): string {
  if (report.query.data) return generatedLine(report.query.data, false);
  if (report.query.isPending) return "Cargando el informe…";
  if (report.unavailable) return "No disponible para esta empresa";
  return "No se pudo cargar el informe";
}

export function ActionCards({ company }: { company: CompanyV2 }): ReactElement {
  const [open, setOpen] = useState<OpenDialog>(null);
  const report = useCompanyReport(company.company.company_id);

  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border-glass pt-3">
      <Card
        icon={<BookOpen aria-hidden="true" className="size-4" />}
        title={METHODOLOGY_TITLE}
        subtext="Bandas, pesos, techos, outlook y confianza"
        onClick={() => setOpen("methodology")}
      />
      <Card
        icon={<Sparkles aria-hidden="true" className="size-4" />}
        title={REPORT_TITLE}
        subtext={reportSubtext(report)}
        onClick={() => setOpen("report")}
        disabled={report.unavailable}
        reason={report.unavailable ? REPORT_UNAVAILABLE : undefined}
        busy={report.query.isPending}
      />

      {open === "methodology" ? (
        <MethodologyDialog company={company} onClose={() => setOpen(null)} />
      ) : null}
      {open === "report" ? (
        <ReportDialog company={company} report={report} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
