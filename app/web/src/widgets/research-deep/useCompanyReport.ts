/**
 * Informe de Health pregenerado de una empresa (`/companies/:id/report`). Sin fichero
 * la API responde `404 report_not_found`: no es un fallo que reintentar, es «no
 * disponible», y la tarjeta se deshabilita. Cualquier otro error sí ofrece reintento.
 */

import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { getCompanyReport } from "@/lib/api-v2";
import type { HealthReport } from "@/lib/api-v2";
import { formatDate } from "@/lib/format";
import { reportKey } from "@/lib/query-keys";

export const REPORT_UNAVAILABLE = "Informe no disponible para esta empresa";

export type CompanyReport = {
  query: UseQueryResult<HealthReport>;
  /** `404`: la empresa no tiene informe generado. */
  unavailable: boolean;
};

export function useCompanyReport(id: string): CompanyReport {
  const query = useQuery({
    queryKey: reportKey(id),
    queryFn: () => getCompanyReport(id),
    retry: false,
    staleTime: Infinity,
  });
  const unavailable = query.error instanceof ApiError && query.error.status === 404;
  return { query, unavailable };
}

/** «Generado el 18/09/2026 · modelo claude-opus-5»; la tarjeta omite «modelo». */
export function generatedLine(report: HealthReport, withModelWord: boolean): string {
  return `Generado el ${formatDate(report.generated_at)} · ${withModelWord ? "modelo " : ""}${report.model}`;
}
