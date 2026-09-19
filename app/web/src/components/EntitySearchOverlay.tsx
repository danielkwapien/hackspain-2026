/**
 * Buscador central: el mismo árbol grupos → filiales del panel Empresas dentro de
 * un `Dialog size="overlay"` (50 vw × 70 vh bajo la topbar). Elegir una filial
 * escribe `select`, elegir un grupo escribe `selectGroup`; las dos cosas cierran.
 * El ▸ y → solo despliegan.
 *
 * El filtro `q` es local: el `search` global queda para la tabla Empresas, y
 * escribirlo desde aquí reordenaría tablas de otros tableros.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ErrorState } from "@/components/states";
import { Dialog } from "@/components/ui/dialog";
import { select, selectGroup } from "@/dashboard/selection";
import type { GroupUniverseItem, UniverseQuery } from "@/lib/api-v2";
import { getUniverse } from "@/lib/api-v2";
import { universeKey } from "@/lib/query-keys";
import { CompanyTree, TableSkeleton } from "@/panels/companies/CompanyTree";
import { flattenTree } from "@/panels/companies/tree";
import { useGroupChildren } from "@/panels/companies/useGroupChildren";

/** Todos los grupos en una página, el tope que admite la API. */
const GROUP_PAGE_SIZE = 500;

/* Cabecera (input de 32 px con 12 px arriba y abajo) y pie (una línea micro) en
   píxeles: el árbol se queda el resto del alto del diálogo y su `rowgroup`
   scrollea con el virtualizador. */
const HEADER_HEIGHT = 56;
const FOOTER_HEIGHT = 32;

const GLASS_CLASS =
  "bg-surface-glass shadow-[inset_0_0_0_1px_var(--border-glass)] backdrop-blur-[var(--blur-glass)]";

export function EntitySearchOverlay({ onClose }: { onClose: () => void }): ReactElement {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const query: UniverseQuery = { unit: "group", q, limit: GROUP_PAGE_SIZE, offset: 0 };
  const universe = useQuery({
    queryKey: universeKey(query),
    queryFn: () => getUniverse(query),
    // Teclear no debe parpadear a esqueleto: la lista anterior aguanta hasta que llega la nueva.
    placeholderData: keepPreviousData,
  });
  const { children, failed, retry } = useGroupChildren(expanded);

  // Con `unit=group` la API publica `GroupUniverseItem`; el cliente tipa `items` como empresa.
  const rows = universe.data
    ? flattenTree(universe.data.items as unknown as GroupUniverseItem[], expanded, children, failed)
    : [];

  function expand(id: string): void {
    setExpanded((previous) => (previous.has(id) ? previous : new Set(previous).add(id)));
  }

  function collapse(id: string): void {
    setExpanded((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  }

  function pickCompany(id: string): void {
    select(id);
    onClose();
  }

  function pickGroup(id: string): void {
    selectGroup(id);
    onClose();
  }

  return (
    <Dialog label="Buscar empresa o grupo" size="overlay" onClose={onClose}>
      <div className="flex shrink-0 items-center px-3" style={{ height: HEADER_HEIGHT }}>
        <div
          className={`flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 focus-within:ring-1 focus-within:ring-ring ${GLASS_CLASS}`}
          style={{ height: "var(--size-input)" }}
        >
          <Search aria-hidden="true" className="size-3.5 shrink-0 text-content-secondary" />
          {/* Sin `autoFocus`: React lo aplicaría antes de que `Dialog` anote quién abrió y
              el foco no volvería al disparador. El diálogo enfoca el primer enfocable: este input. */}
          <input
            type="text"
            aria-label="Filtrar empresas y grupos"
            placeholder="Nombre, id o grupo"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="h-full w-full bg-transparent text-[length:var(--text-control)] text-content-primary outline-none placeholder:text-content-secondary"
          />
        </div>
      </div>

      <div
        className="@container flex flex-col px-3"
        style={{ height: `calc(var(--size-overlay-h) - ${HEADER_HEIGHT + FOOTER_HEIGHT}px)` }}
      >
        {universe.isPending ? (
          <TableSkeleton columns="compact" />
        ) : universe.isError ? (
          <ErrorState
            error={universe.error}
            onRetry={() => void universe.refetch()}
            context="las empresas y grupos"
          />
        ) : rows.length === 0 ? (
          <p className="py-6 text-[length:var(--text-body)] text-content-secondary">
            Sin resultados
          </p>
        ) : (
          <CompanyTree
            rows={rows}
            treeView
            expanded={expanded}
            onExpand={expand}
            onCollapse={collapse}
            selected={null}
            selectedGroup={null}
            onPickCompany={pickCompany}
            onPickGroup={pickGroup}
            onRetryGroup={retry}
            label="Resultados"
            columns="compact"
          />
        )}
      </div>

      <p
        className="flex shrink-0 items-center px-3 text-[length:var(--text-micro)] text-content-secondary"
        style={{ height: FOOTER_HEIGHT }}
      >
        ↑↓ navegar · → desplegar · Enter elegir · Esc cerrar
      </p>
    </Dialog>
  );
}
