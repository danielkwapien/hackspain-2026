/**
 * Panel Empresas: el universo por grupos sobre `/api/v2/universe`, el «Research»
 * de Trade Republic.
 *
 * Decisiones que se notan al leer el fichero:
 * - La consulta es un solo objeto de estado y es la clave de React Query: cada
 *   filtro y la ordenación la reescriben y resetean `offset`. La búsqueda NO vive
 *   aquí: el buscador del panel escribe el `search` del store, y el `offset`
 *   guarda para qué búsqueda vale (`page.search`), así que cambiar la búsqueda
 *   vuelve a la primera página sin efectos ni consultas dobles.
 * - Vista `Grupo` (por defecto): una sola página de hasta 500 grupos, sin
 *   paginador. Cada grupo desplegado pide `/groups/:id` (`useGroupChildren`) y sus
 *   `companies[]` entran como filas hijas sangradas. `tree.ts` aplana el árbol y
 *   `CompanyTree` lo pinta (treegrid, virtualizador, teclado).
 * - Vista `Empresa`: plana y paginada por el alto. `pageSizeFor(alto / 28)` se mide
 *   con `ResizeObserver` sobre el `rowgroup` que scrollea; otro tamaño de página
 *   vuelve a `offset 0`.
 * - El servidor ordena y filtra. Aquí no se reordena nada: se manda el parámetro
 *   y se pinta la respuesta tal cual llega.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "cn";
import { ErrorState } from "@/components/states";
import { select, selectGroup, setSearch, useSelection } from "@/dashboard/selection";
import type { Band, GroupUniverseItem, Regime, UniverseQuery, Unit } from "@/lib/api-v2";
import { getUniverse } from "@/lib/api-v2";
import { universeKey } from "@/lib/query-keys";
import { BAND_LABEL, REGIME_LABEL } from "@/lib/regime";
import { CompanyTree, ROW_HEIGHT, TableSkeleton } from "@/panels/companies/CompanyTree";
import type { SortColumn } from "@/panels/companies/CompanyTree";
import { flatRows, flattenTree, pageSizeFor } from "@/panels/companies/tree";
import type { TreeRow } from "@/panels/companies/tree";
import { useGroupChildren } from "@/panels/companies/useGroupChildren";

/** Vista `Grupo`: todos los grupos en una página, el tope que admite la API. */
const GROUP_PAGE_SIZE = 500;

const BANDS: Band[] = ["solid", "healthy", "watch", "stress"];

const REGIMES: Regime[] = [
  "improving",
  "stable",
  "recovering",
  "blip",
  "deteriorating",
  "shock_pending",
  "warmup",
];

const UNITS: { value: Unit; label: string }[] = [
  { value: "company", label: "Empresa" },
  { value: "group", label: "Grupo" },
];

const GLASS_CLASS =
  "bg-surface-glass shadow-[inset_0_0_0_1px_var(--border-glass)] backdrop-blur-[var(--blur-glass)]";

const FOCUS_RING_CLASS = "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

/** Feedback de pulsación: encoge un 3 % mientras se mantiene, y vuelve en 150 ms. */
const PRESS_CLASS =
  "transition-[color,background-color,opacity,transform] duration-[var(--duration-fast)] active:scale-[.97]";

const PILL_CLASS = cn(
  "flex items-center gap-1 rounded-[var(--radius-control)] px-2 text-[length:var(--text-control)] text-content-secondary [@media(hover:hover)]:hover:bg-surface-glass-hover hover:text-content-primary",
  GLASS_CLASS,
  PRESS_CLASS,
  FOCUS_RING_CLASS,
);

const MENU_CLASS =
  "animate-menu-enter motion-reduce:animate-none absolute top-full z-[var(--z-dropdown)] mt-1 max-h-64 w-48 overflow-y-auto rounded-lg bg-surface-elevated p-1 shadow-[inset_0_0_0_1px_var(--border-glass)]";

const MENU_ITEM_CLASS = cn(
  "flex w-full items-center rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[length:var(--text-control)] text-content-primary transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover",
  FOCUS_RING_CLASS,
);

const PAGER_BUTTON_CLASS = cn(
  "h-6 rounded-[var(--radius-control)] px-1 hover:text-content-primary disabled:pointer-events-none disabled:opacity-40",
  PRESS_CLASS,
  FOCUS_RING_CLASS,
);

type Option = { value: string; label: string };

/**
 * Pill de filtro: botón glass de 32 px con lista propia, hecha a mano
 * (en jsdom el popover de Radix es frágil).
 */
function FilterPill({
  label,
  value,
  options,
  onSelect,
  onClear,
}: {
  label: string;
  value: string | undefined;
  options: Option[];
  onSelect: (value: string) => void;
  onClear: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  /* El marco del panel recorta (`overflow-hidden`): una pill en la mitad derecha
     ancla su menú por la derecha. Se mide al abrir, contra el `region` del panel. */
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function toggleMenu(button: HTMLButtonElement): void {
    if (!open) {
      const frame = button.closest('[role="region"]');
      if (frame) {
        const pill = button.getBoundingClientRect();
        const box = frame.getBoundingClientRect();
        setAlignRight(pill.left + pill.width / 2 - box.left > box.width / 2);
      }
    }
    setOpen(!open);
  }

  /** Cierra el menú y devuelve el foco al disparador: quien lo abrió sigue donde estaba. */
  function closeMenu(): void {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  // Al abrir, el foco entra en el primer item: el menú se recorre con ↑/↓ desde ahí.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  function menuItems(): HTMLElement[] {
    return [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  }

  function handleMenuKey(event: KeyboardEvent<HTMLDivElement>): void {
    const items = menuItems();
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        next = (current + 1) % items.length;
        break;
      case "ArrowUp":
        next = (current - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  const active = options.find((option) => option.value === value);

  return (
    <div
      ref={wrapRef}
      className="relative flex shrink-0 items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(PILL_CLASS, active && "pr-1 text-content-primary")}
        style={{ height: "var(--size-segment)" }}
        onClick={(event) => toggleMenu(event.currentTarget)}
      >
        {active ? `${label}: ${active.label}` : label}
        <ChevronDown aria-hidden="true" className="size-3" />
      </button>

      {active ? (
        <button
          type="button"
          aria-label={`Quitar filtro de ${label.toLowerCase()}`}
          className={cn(
            "ml-1 flex size-6 items-center justify-center rounded-[var(--radius-control)] text-content-secondary [@media(hover:hover)]:hover:bg-surface-glass-hover hover:text-content-primary",
            PRESS_CLASS,
            FOCUS_RING_CLASS,
          )}
          onClick={() => {
            onClear();
            closeMenu();
          }}
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      ) : null}

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className={cn(
            MENU_CLASS,
            alignRight ? "right-0 origin-top-right" : "left-0 origin-top-left",
          )}
          onKeyDown={handleMenuKey}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitem"
              className={MENU_ITEM_CLASS}
              onClick={() => {
                onSelect(option.value);
                closeMenu();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CompaniesPanel(): ReactElement {
  /* El `rowgroup` que scrollea lo monta `CompanyTree` después de cargar: el ref es
     un callback y el `ResizeObserver` del tamaño de página se engancha en cuanto existe. */
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const search = useSelection((state) => state.search);
  const selected = useSelection((state) => state.selected);
  const selectedGroup = useSelection((state) => state.selectedGroup);

  const [filters, setFilters] = useState<Omit<UniverseQuery, "q" | "offset" | "limit">>({
    unit: "group",
  });
  /** El `offset` vale para la búsqueda y el tamaño con los que se pidió; otra
      búsqueda u otro tamaño lo devuelven a 0. */
  const [page, setPage] = useState({ search, offset: 0, size: pageSizeFor(0, ROW_HEIGHT) });
  const offset = page.search === search ? page.offset : 0;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const query: UniverseQuery =
    filters.unit === "group"
      ? { ...filters, q: search, limit: GROUP_PAGE_SIZE, offset: 0 }
      : { ...filters, q: search, limit: page.size, offset };

  const universe = useQuery({
    queryKey: universeKey(query),
    queryFn: () => getUniverse(query),
    // Reordenar no debe parpadear a esqueleto: la tabla anterior aguanta hasta que llega la nueva.
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!scrollElement) return;
    const observer = new ResizeObserver(([entry]) => {
      const size = pageSizeFor(entry.contentRect.height, ROW_HEIGHT);
      setPage((previous) =>
        previous.size === size ? previous : { search: previous.search, offset: 0, size },
      );
    });
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [scrollElement]);

  const { children, failed, retry } = useGroupChildren(expanded);

  /* Las filas siguen a la `unit` de la respuesta, no a la del filtro: con
     `keepPreviousData` la tabla anterior sigue en pantalla mientras llega la nueva. */
  const data = universe.data;
  const treeView = data?.unit === "group";
  let rows: TreeRow[] = [];
  if (data && treeView) {
    // Con `unit=group` la API publica `GroupUniverseItem`; el cliente tipa `items` como empresa.
    rows = flattenTree(data.items as unknown as GroupUniverseItem[], expanded, children, failed);
  } else if (data) {
    rows = flatRows(data.items);
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

  /** Enter o clic en un grupo: se despliega y se selecciona. */
  function pickGroup(id: string): void {
    expand(id);
    selectGroup(id);
  }

  /** Cualquier cambio de filtro vuelve a la primera página. */
  function patchFilters(partial: Partial<typeof filters>): void {
    setFilters((previous) => ({ ...previous, ...partial }));
    setPage((previous) => ({ ...previous, search, offset: 0 }));
  }

  function toggleSort(column: SortColumn): void {
    patchFilters({
      sort: column,
      order: filters.sort === column && filters.order === "desc" ? "asc" : "desc",
    });
  }

  // Los grupos que ofrece la pill salen de las empresas en pantalla; el elegido
  // se queda siempre, aunque el filtro haya dejado fuera a los demás.
  const groupOptions: Option[] = useMemo(() => {
    const ids = new Set(data?.unit === "company" ? data.items.map((item) => item.group_id) : []);
    if (filters.groupId) ids.add(filters.groupId);
    return [...ids].sort().map((id) => ({ value: id, label: id }));
  }, [data, filters.groupId]);

  const total = data?.total ?? 0;
  const hasPages = !treeView && total > rows.length;

  return (
    <div className="@container flex h-full flex-col gap-2 pt-1">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div
          className={cn(
            "flex min-w-40 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-2 focus-within:ring-1 focus-within:ring-ring",
            GLASS_CLASS,
          )}
          style={{ height: "var(--size-input)" }}
        >
          <Search aria-hidden="true" className="size-3.5 shrink-0 text-content-secondary" />
          <input
            type="text"
            aria-label="Filtrar empresas"
            placeholder="Nombre, id o grupo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-full w-full bg-transparent text-[length:var(--text-control)] text-content-primary outline-none placeholder:text-content-secondary"
          />
        </div>

        <FilterPill
          label="Banda"
          value={filters.band}
          options={BANDS.map((band) => ({ value: band, label: BAND_LABEL[band] }))}
          onSelect={(value) => patchFilters({ band: value as Band })}
          onClear={() => patchFilters({ band: undefined })}
        />
        <FilterPill
          label="Régimen"
          value={filters.regime}
          options={REGIMES.map((regime) => ({ value: regime, label: REGIME_LABEL[regime] }))}
          onSelect={(value) => patchFilters({ regime: value as Regime })}
          onClear={() => patchFilters({ regime: undefined })}
        />
        {/* En la vista por grupos el árbol ya agrupa: la pill solo tiene sentido en la plana. */}
        {filters.unit === "company" ? (
          <FilterPill
            label="Grupo"
            value={filters.groupId}
            options={groupOptions}
            onSelect={(value) => patchFilters({ groupId: value })}
            onClear={() => patchFilters({ groupId: undefined })}
          />
        ) : null}

        <div
          role="group"
          aria-label="Unidad"
          className={cn(
            "flex shrink-0 items-center gap-0.5 rounded-[var(--radius-control)] p-0.5 text-[length:var(--text-control)] text-content-secondary",
            GLASS_CLASS,
          )}
          style={{ height: "var(--size-segment)" }}
        >
          {UNITS.map((unit) => (
            <button
              key={unit.value}
              type="button"
              aria-pressed={filters.unit === unit.value}
              className={cn(
                "h-full rounded-[var(--radius-control)] px-2 hover:text-content-primary",
                PRESS_CLASS,
                FOCUS_RING_CLASS,
                filters.unit === unit.value && "bg-surface-glass-hover text-content-primary",
              )}
              onClick={() => patchFilters({ unit: unit.value, groupId: undefined })}
            >
              {unit.label}
            </button>
          ))}
        </div>
      </div>

      {universe.isPending ? (
        <TableSkeleton />
      ) : universe.isError ? (
        <ErrorState
          error={universe.error}
          onRetry={() => void universe.refetch()}
          context="las empresas del universo"
        />
      ) : rows.length === 0 ? (
        <p className="py-6 text-[length:var(--text-body)] text-content-secondary">
          Ninguna empresa cumple los filtros
        </p>
      ) : (
        <CompanyTree
          rows={rows}
          treeView={treeView}
          expanded={expanded}
          onExpand={expand}
          onCollapse={collapse}
          selected={selected}
          selectedGroup={selectedGroup}
          onPickCompany={select}
          onPickGroup={pickGroup}
          onRetryGroup={retry}
          sort={{ query, onSort: toggleSort }}
          scrollRef={setScrollElement}
        />
      )}

      {hasPages ? (
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border-glass pt-1 text-[length:var(--text-micro)] text-content-secondary">
          <span className="num">{`${offset + 1}-${offset + rows.length} de ${total}`}</span>
          <button
            type="button"
            disabled={offset === 0}
            className={PAGER_BUTTON_CLASS}
            onClick={() =>
              setPage((previous) => ({
                ...previous,
                search,
                offset: Math.max(0, offset - previous.size),
              }))
            }
          >
            Anteriores
          </button>
          <button
            type="button"
            disabled={offset + rows.length >= total}
            className={PAGER_BUTTON_CLASS}
            onClick={() =>
              setPage((previous) => ({ ...previous, search, offset: offset + previous.size }))
            }
          >
            Siguientes
          </button>
        </div>
      ) : null}
    </div>
  );
}
