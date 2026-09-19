/**
 * Modo grupo de Investigación profunda: las filiales del grupo con su score, Δ 1 m y
 * sparkline (`SubsidiaryRow`, la misma fila que el widget Grupo). Elegir una filial
 * escribe `select(id)` y la ficha pasa a modo empresa.
 */

import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtPoints } from "@/charts";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { select, useSelection } from "@/dashboard/selection";
import { getGroupV2 } from "@/lib/api-v2";
import { groupKey } from "@/lib/query-keys";
import { SUBSIDIARY_ROW_HEIGHT, SubsidiaryRow } from "@/widgets/group/SubsidiaryRow";

const SKELETON_ROWS = 6;

export function SubsidiariesList({ id }: { id: string }): ReactElement {
  const selected = useSelection((state) => state.selected);
  const group = useQuery({ queryKey: groupKey(id), queryFn: () => getGroupV2(id) });

  if (group.isPending) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2 pt-1">
        <span className="sr-only">Cargando filiales</span>
        <Skeleton className="h-4 w-48" />
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <Skeleton key={row} className="w-full" style={{ height: SUBSIDIARY_ROW_HEIGHT }} />
        ))}
      </div>
    );
  }

  if (group.isError) {
    return (
      <ErrorState
        error={group.error}
        context={`el grupo ${id}`}
        onRetry={() => void group.refetch()}
      />
    );
  }

  const data = group.data;

  return (
    <div
      key={id}
      className="animate-crossfade motion-reduce:animate-none flex h-full min-h-0 flex-col gap-2"
    >
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <span
          className="min-w-0 truncate text-[length:var(--text-body)] font-semibold text-content-primary"
          title={data.group.name}
        >
          {data.group.name}
        </span>
        <span className="num shrink-0 text-[length:var(--text-control)] text-content-secondary">
          {`${data.companies.length} filiales · ${fmtPoints(data.score)}`}
        </span>
      </div>

      {data.companies.length === 0 ? (
        <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
          <p>Sin filiales en este corte</p>
          <p>El grupo no tiene empresas puntuadas.</p>
        </div>
      ) : (
        <ul role="listbox" aria-label="Filiales" className="flex min-h-0 flex-col overflow-y-auto">
          {data.companies.map((row) => (
            <SubsidiaryRow
              key={row.id}
              row={row}
              isSelected={selected === row.id}
              onSelect={() => select(row.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
