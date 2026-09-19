/**
 * Buscador central: el mismo árbol grupos → filiales del panel Empresas dentro de
 * un `Dialog size="overlay"` (50 vw × 70 vh bajo la topbar). Elegir una filial
 * escribe `select`, elegir un grupo escribe `selectGroup`; las dos cosas cierran.
 * El ▸ y → solo despliegan.
 *
 * El filtro `q` es local: el `search` global queda para la tabla Empresas, y
 * escribirlo desde aquí reordenaría tablas de otros tableros. La API filtra los
 * grupos por su propio nombre, así que con `q` se piden dos cosas en paralelo:
 * los grupos que casan (desplegables) y las empresas que casan, que van detrás
 * como filas de nivel 1 con su `group_name` bajo una cabecera «Empresas» cuando
 * hay de las dos. Una empresa que ya cuelga de un grupo desplegado no se repite.
 *
 * Teclado desde el input: ↓ baja a la fila con `tabIndex 0`, Enter elige el primer
 * resultado y ↑ desde la primera fila vuelve al input (`onExitTop`).
 */

import { useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
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
import type { TreeRow } from "@/panels/companies/tree";
import { useGroupChildren } from "@/panels/companies/useGroupChildren";

/** Todos los grupos en una página, el tope que admite la API. */
const GROUP_PAGE_SIZE = 500;

/** Empresas que casan con `q`: las 50 mejores por score bastan para elegir una. */
const COMPANY_PAGE_SIZE = 50;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const searching = q !== "";

  const companyQuery: UniverseQuery = {
    unit: "company",
    q,
    sort: "score",
    limit: COMPANY_PAGE_SIZE,
    offset: 0,
  };
  const companies = useQuery({
    queryKey: universeKey(companyQuery),
    queryFn: () => getUniverse(companyQuery),
    // Teclear no debe parpadear a esqueleto: la lista anterior aguanta hasta que llega la nueva.
    placeholderData: keepPreviousData,
    enabled: searching,
  });
  const groupQuery: UniverseQuery = { unit: "group", q, limit: GROUP_PAGE_SIZE, offset: 0 };
  const groups = useQuery({
    queryKey: universeKey(groupQuery),
    queryFn: () => getUniverse(groupQuery),
    placeholderData: keepPreviousData,
  });
  const { children, failed, retry } = useGroupChildren(expanded);

  // Con `unit=group` la API publica `GroupUniverseItem`; el cliente tipa `items` como empresa.
  const rows: TreeRow[] = groups.data
    ? flattenTree(groups.data.items as unknown as GroupUniverseItem[], expanded, children, failed)
    : [];
  if (searching && companies.data) {
    const shown = new Set([...children.values()].flat().map((item) => item.id));
    const hits = companies.data.items.filter((item) => !shown.has(item.id));
    if (rows.length > 0 && hits.length > 0) rows.push({ kind: "section", label: "Empresas" });
    for (const item of hits) rows.push({ kind: "company", item, parent: null, level: 1 });
  }

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

  function handleInputKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      treeRef.current?.querySelector<HTMLElement>('[role="row"][tabindex="0"]')?.focus();
      return;
    }
    if (event.key !== "Enter") return;
    // Sin `keypress` posterior: al cerrar, el foco vuelve al disparador y no debe pulsarlo.
    event.preventDefault();
    const first = rows[0];
    if (first?.kind === "group") pickGroup(first.item.id);
    else if (first?.kind === "company") pickCompany(first.item.id);
  }

  const error = groups.error ?? companies.error;

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
            ref={inputRef}
            type="text"
            aria-label="Filtrar empresas y grupos"
            placeholder="Nombre, id o grupo"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={handleInputKey}
            className="h-full w-full bg-transparent text-[length:var(--text-control)] text-content-primary outline-none placeholder:text-content-secondary"
          />
        </div>
      </div>

      <div
        ref={treeRef}
        className="@container flex flex-col px-3"
        style={{ height: `calc(var(--size-overlay-h) - ${HEADER_HEIGHT + FOOTER_HEIGHT}px)` }}
      >
        {groups.isPending ? (
          <TableSkeleton columns="compact" />
        ) : error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void groups.refetch();
              if (searching) void companies.refetch();
            }}
            context="las empresas y grupos"
          />
        ) : rows.length === 0 ? (
          searching && companies.isPending ? (
            <TableSkeleton columns="compact" />
          ) : (
            <p className="py-6 text-[length:var(--text-body)] text-content-secondary">
              Sin resultados
            </p>
          )
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
            onExitTop={() => inputRef.current?.focus()}
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
