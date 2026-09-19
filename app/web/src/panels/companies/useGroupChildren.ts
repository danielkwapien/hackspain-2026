/**
 * Filiales de los grupos desplegados: una consulta `/groups/:id` por grupo
 * (`useQueries` sobre `groupKey`), reducida a lo que `flattenTree` necesita:
 * `children` para los que ya llegaron, `failed` para los que fallaron y `retry`
 * para relanzar solo la consulta de un grupo. Lo comparten el panel Empresas y
 * el buscador central.
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { UniverseItem } from "@/lib/api-v2";
import { getGroupV2 } from "@/lib/api-v2";
import { groupKey } from "@/lib/query-keys";

export function useGroupChildren(expanded: ReadonlySet<string>): {
  children: ReadonlyMap<string, readonly UniverseItem[]>;
  failed: ReadonlySet<string>;
  retry: (id: string) => void;
} {
  const expandedIds = useMemo(() => [...expanded], [expanded]);
  const groupQueries = useQueries({
    queries: expandedIds.map((id) => ({
      queryKey: groupKey(id),
      queryFn: () => getGroupV2(id),
    })),
  });

  const children = new Map<string, readonly UniverseItem[]>();
  const failed = new Set<string>();
  groupQueries.forEach((groupQuery, index) => {
    const id = expandedIds[index];
    if (groupQuery.data) children.set(id, groupQuery.data.companies);
    else if (groupQuery.isError) failed.add(id);
  });

  return {
    children,
    failed,
    retry: (id) => void groupQueries[expandedIds.indexOf(id)]?.refetch(),
  };
}
