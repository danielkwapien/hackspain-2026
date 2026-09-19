/**
 * «Estadísticas clave» de la empresa al estilo de Trade Republic: dos columnas de
 * etiqueta gris sobre valor blanco, en tres grupos (Score · Motor · Empresa). Cada
 * término con definición lleva su ⓘ. Ninguna ausencia se pinta como 0: país, ERP o
 * fortalezas sin dato van «—», sin techo «sin techo», sin alerta «sin alertas».
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { fmtConfidence, fmtMonth, fmtPoints, fmtSizeShort } from "@/charts";
import { InfoTip } from "@/components/ui/info-tip";
import type { AlertRow, CompanyV2 } from "@/lib/api-v2";
import { getGroupV2 } from "@/lib/api-v2";
import {
  BRANCH_LABEL,
  FAMILY_LABEL,
  KPI_DEFINITION,
  STRENGTH_LABEL,
  humanizeCode,
} from "@/lib/definitions";
import { EMPTY_VALUE, formatCount } from "@/lib/format";
import { groupKey } from "@/lib/query-keys";
import { BAND_CLASS, BAND_LABEL, REGIME_CLASS, REGIME_LABEL } from "@/lib/regime";

const TITLE = "Estadísticas clave";
const MINUS_SIGN = "−";

const SEVERITY_LABEL: Record<AlertRow["severity"], string> = {
  watch: "Vigilar",
  review: "Revisar",
  urgent: "Urgente",
};

type Stat = {
  label: string;
  value: string;
  /** Tono del valor (banda, régimen); por defecto primario. */
  className?: string;
  definition?: string;
};

type StatGroup = { title: string; stats: Stat[] };

function scoreStats(company: CompanyV2): Stat[] {
  const band = company.band;
  const regime = company.regime;
  const outlook = company.outlook;
  return [
    { label: "Score", value: fmtPoints(company.score), definition: KPI_DEFINITION.score },
    {
      label: "Banda",
      value: band ? BAND_LABEL[band] : EMPTY_VALUE,
      className: band ? BAND_CLASS[band] : undefined,
      definition: KPI_DEFINITION.band,
    },
    {
      label: "Régimen",
      value: regime ? REGIME_LABEL[regime] : EMPTY_VALUE,
      className: regime ? REGIME_CLASS[regime] : undefined,
      definition: KPI_DEFINITION.regime,
    },
    { label: "Outlook 3 m", value: fmtPoints(outlook?.h3) },
    { label: "Outlook 6 m", value: fmtPoints(outlook?.h6), definition: KPI_DEFINITION.outlook },
    {
      label: "Banda outlook",
      value: outlook ? `[${fmtPoints(outlook.low)}, ${fmtPoints(outlook.high)}]` : EMPTY_VALUE,
      definition: KPI_DEFINITION.outlook,
    },
    {
      label: "Confianza",
      value: fmtConfidence(company.confidence),
      definition: KPI_DEFINITION.confidence,
    },
    { label: "Warm-up", value: company.warmup ? "Sí" : "No" },
  ];
}

function engineStats(company: CompanyV2): Stat[] {
  const weakest = company.penalty?.weakest_pillar ?? null;
  const penalty =
    company.penalty === null
      ? EMPTY_VALUE
      : company.penalty.points > 0 && weakest
        ? `${MINUS_SIGN}${fmtPoints(company.penalty.points)} (${FAMILY_LABEL[weakest]})`
        : "sin penalización";
  const alert = company.alert
    ? `${SEVERITY_LABEL[company.alert.severity]} · ${fmtMonth(company.alert.month_detected)}`
    : "sin alertas";
  return [
    { label: "Base", value: fmtPoints(company.base), definition: KPI_DEFINITION.base },
    { label: "Penalización", value: penalty, definition: KPI_DEFINITION.penalty },
    {
      label: "Techo",
      value: company.cap ? `${company.cap.code} ${fmtPoints(company.cap.value)}` : "sin techo",
      definition: KPI_DEFINITION.cap,
    },
    { label: "Meses de historia", value: formatCount(company.company.months_hist) },
    {
      label: "Rama de cobertura",
      value: company.branch === null ? EMPTY_VALUE : (BRANCH_LABEL[company.branch] ?? humanizeCode(company.branch)),
    },
    { label: "Última alerta", value: alert },
    {
      label: "Fortalezas",
      value:
        company.strength_flags.length > 0
          ? company.strength_flags.map((flag) => STRENGTH_LABEL[flag] ?? humanizeCode(flag)).join(", ")
          : EMPTY_VALUE,
    },
  ];
}

function companyStats(company: CompanyV2, groupName: string | undefined): Stat[] {
  const row = company.company;
  return [
    { label: "Grupo", value: groupName ?? row.group_id },
    { label: "País", value: row.country ?? EMPTY_VALUE },
    { label: "Moneda", value: row.currency },
    { label: "ERP", value: row.erp ?? EMPTY_VALUE },
    { label: "Operativa 12 m", value: fmtSizeShort(row.op_in_12m, row.currency) },
    {
      label: "Facturas · Productos",
      value: `${row.has_invoices ? formatCount(row.n_invoices) : EMPTY_VALUE} · ${formatCount(row.n_banking_products)}`,
    },
    { label: "Calidad de caja", value: row.cash_quality ?? EMPTY_VALUE },
  ];
}

export function KeyStats({ company }: { company: CompanyV2 }): ReactElement {
  const groupId = company.company.group_id;
  const groupName = useQuery({
    queryKey: groupKey(groupId),
    queryFn: () => getGroupV2(groupId),
    select: (group) => group.group.name,
  });

  const groups: StatGroup[] = [
    { title: "Score", stats: scoreStats(company) },
    { title: "Motor", stats: engineStats(company) },
    { title: "Empresa", stats: companyStats(company, groupName.data) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[length:var(--text-body)] font-semibold text-content-primary">{TITLE}</h3>
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-1">
          <h4 className="text-[length:var(--text-micro)] font-semibold tracking-wide text-content-secondary uppercase">
            {group.title}
          </h4>
          <dl className="grid grid-cols-2 gap-x-6">
            {group.stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col justify-center gap-0.5"
                style={{ minHeight: "var(--size-stat-cell)" }}
              >
                <dt className="flex items-center gap-1 text-[length:var(--text-micro)] text-content-secondary">
                  <span className="truncate">{stat.label}</span>
                  {stat.definition ? (
                    <InfoTip title={stat.label} definition={stat.definition} />
                  ) : null}
                </dt>
                <dd
                  className={cn(
                    "num truncate text-[length:var(--text-body)]",
                    stat.className ?? "text-content-primary",
                  )}
                  title={stat.value}
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
