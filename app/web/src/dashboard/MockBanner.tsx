/**
 * Aviso de dato simulado bajo la topbar. No se puede ocultar: quien mira el
 * tablero tiene que saber siempre si las cifras son del dataset mock.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMeta } from "@/lib/api-v2";

/** `2026-08` -> `08/2026`. */
function formatCutoff(month: string | undefined): string {
  if (!month) return "";
  const [year, value] = month.split("-");
  if (!year || !value) return "";
  return ` · corte ${value}/${year}`;
}

export function MockBanner(): ReactElement | null {
  const meta = useQuery({ queryKey: ["meta"], queryFn: getMeta });

  // Mientras la meta carga o falla no se afirma nada sobre el origen del dato.
  if (!meta.data || meta.data.data_kind !== "mock") return null;

  return (
    <div
      role="status"
      className="shrink-0 border-b border-warning/40 bg-warning/10 px-4 py-1 text-xs text-warning"
    >
      Datos simulados (mock v1){formatCutoff(meta.data.months.at(-1))}
    </div>
  );
}
