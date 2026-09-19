/**
 * Panel Empresas: el universo por grupos sobre `/api/v2/universe`, el «Research»
 * de Trade Republic.
 *
 * Decisiones que se notan al leer el fichero:
 * - La consulta es un solo objeto de estado y es la clave de React Query: cada
 *   filtro y la ordenación la reescriben y resetean `offset`. La búsqueda NO vive
 *   aquí: la topbar y el buscador del panel escriben el mismo `search` del store,
 *   y el `offset` guarda para qué búsqueda vale (`page.search`), así que cambiar
 *   la búsqueda vuelve a la primera página sin efectos ni consultas dobles.
 * - Vista `Grupo` (por defecto): una sola página de hasta 500 grupos, sin
 *   paginador. Cada grupo desplegado pide `/groups/:id` con `useQueries` y sus
 *   `companies[]` entran como filas hijas sangradas. `tree.ts` aplana el árbol y el
 *   virtualizador recorre esa lista; el roving tabindex indexa la misma lista.
 * - Vista `Empresa`: plana y paginada por el alto. `pageSizeFor(alto / 28)` se mide
 *   con `ResizeObserver` sobre el `rowgroup` que scrollea; otro tamaño de página
 *   vuelve a `offset 0`.
 * - El servidor ordena y filtra. Aquí no se reordena nada: se manda el parámetro
 *   y se pinta la respuesta tal cual llega.
 * - La retícula es `div` con roles ARIA explícitos (`treegrid` / `table`), no
 *   `<table>`: virtualizar exige posicionar cada fila y `display:flex`, y un
 *   `<table>` con ese display pierde igualmente sus roles nativos en el navegador.
 * - Las columnas no caben todas en el panel a 1440 px (12/24 = 668 px útiles):
 *   Régimen y Operativa solo aparecen desde `@3xl` (768 px del contenedor) y Δ3m
 *   desde 656 px, para que el nombre conserve ≥ 300 px; el id vive solo en el
 *   `title` del nombre. Nada se solapa y nada desplaza en horizontal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { cn } from "cn";
import { fmtConfidence, fmtDelta, fmtSizeShort, Sparkline } from "@/charts";
import { ErrorState } from "@/components/states";
import { select, selectGroup, setSearch, useSelection } from "@/dashboard/selection";
import type {
  Band,
  GroupUniverseItem,
  Regime,
  UniverseItem,
  UniverseQuery,
  Unit,
} from "@/lib/api-v2";
import { getGroupV2, getUniverse } from "@/lib/api-v2";
import { EMPTY_VALUE } from "@/lib/format";
import { groupKey, universeKey } from "@/lib/query-keys";
import { BAND_LABEL, REGIME_CLASS, REGIME_LABEL } from "@/lib/regime";
import { flatRows, flattenTree, pageSizeFor } from "@/panels/companies/tree";
import type { TreeRow } from "@/panels/companies/tree";

/* Medidas de la tabla. Las que solo pinta el CSS van por token (`--size-segment`,
   `--radius-control`). Estas siguen en píxeles porque el JS las necesita como
   número: el virtualizador estima con `ROW_HEIGHT` y la página se calcula con él.
   Debe cuadrar con `--size-table-row`; la cabecera de la tabla no tiene token. */
const TABLE_HEADER_HEIGHT = 26;
const ROW_HEIGHT = 28;
const SKELETON_ROWS = 8;

/** Anchos fijos de las columnas cortas, medidos en Chrome sobre su contenido más
    largo (punto de banda + `100,0` a 12 px mono = 56; `▲ +10,9` = 50,4;
    `Deteriorándose` a 12 px = 83,8; `86 %` a 11 px mono = 30; `EUR 26,2 M` = 70);
    el nombre se queda el resto. A 668 px útiles, sin Régimen ni Operativa, las
    fijas suman 304 + 7 huecos de 8 = 360 y dejan 308 px al nombre. */
const COLUMN_WIDTH = {
  disclosure: 16,
  n: 28,
  score: 56,
  delta: 52,
  regime: 88,
  spark: 64,
  confidence: 36,
  size: 76,
};

/** Columnas que solo caben con el contenedor a 768 px o más. */
const WIDE_ONLY = "hidden @3xl:block";

/** Δ3m: desde 656 px de contenedor. A 1440 px el panel da 668 y `@2xl` son 672. */
const MID_ONLY = "hidden @min-[656px]:block";

/** Vista `Grupo`: todos los grupos en una página, el tope que admite la API. */
const GROUP_PAGE_SIZE = 500;

type SortColumn = NonNullable<UniverseQuery["sort"]>;

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

/** Punto de banda delante del score: el color califica el nivel, la etiqueta `sr-only` lo nombra. */
const BAND_DOT_CLASS: Record<Band, string> = {
  solid: "bg-band-solid",
  healthy: "bg-band-healthy",
  watch: "bg-band-watch",
  stress: "bg-band-stress",
};

/** Score con una decimal y coma, sin unidad: la cabecera ya dice qué es. */
const SCORE_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** `fmtDelta` decide glifo, signo y color; en 52 px la unidad no cabe y sobra. */
function deltaLabel(value: number): { text: string; tone: string } {
  const delta = fmtDelta(value);
  return { text: delta.text.replace(/\spts$/u, ""), tone: delta.tone };
}

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

/** Cifra secundaria de la fila: `n`, confianza y operativa. */
const FIGURE_CLASS =
  "shrink-0 text-right font-mono text-[length:var(--text-micro)] tabular-nums text-content-secondary";

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

/** Cabecera ordenable: un clic ordena descendente, el segundo invierte. */
function SortableHeader({
  label,
  column,
  query,
  onSort,
  width,
  className,
}: {
  label: string;
  column: SortColumn;
  query: UniverseQuery;
  onSort: (column: SortColumn) => void;
  width: number;
  className?: string;
}): ReactElement {
  const isActive = query.sort === column;
  const sort = isActive ? (query.order === "asc" ? "ascending" : "descending") : "none";

  return (
    <div
      role="columnheader"
      aria-sort={sort}
      className={cn("shrink-0", className)}
      style={{ width }}
    >
      <button
        type="button"
        className={cn(
          "h-full w-full text-right hover:text-content-primary",
          PRESS_CLASS,
          FOCUS_RING_CLASS,
          isActive && "text-content-primary",
        )}
        onClick={() => onSort(column)}
      >
        {label}
      </button>
    </div>
  );
}

const SKELETON_BAR_CLASS =
  "h-3 animate-pulse rounded-[var(--radius-control)] bg-surface-glass motion-reduce:animate-none";

const SKELETON_COLUMNS = [
  COLUMN_WIDTH.n,
  COLUMN_WIDTH.score,
  COLUMN_WIDTH.delta,
  COLUMN_WIDTH.delta,
  COLUMN_WIDTH.spark,
  COLUMN_WIDTH.confidence,
];

/** Carga con la forma de la tabla: filas de 28 px con una barra glass por columna. */
function TableSkeleton(): ReactElement {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col">
      <span className="sr-only">Cargando empresas</span>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <div key={row} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
          <div className="min-w-0 flex-1 pr-4">
            <div className={cn(SKELETON_BAR_CLASS, "max-w-48")} />
          </div>
          {SKELETON_COLUMNS.map((width, column) => (
            <div key={column} className={cn(SKELETON_BAR_CLASS, "shrink-0")} style={{ width }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Celdas de una fila con datos (grupo o empresa). Solo el árbol lleva desglose,
 * `n` y Operativa: en la vista plana serían columnas enteras de `—`.
 */
function ItemCells({
  row,
  treeView,
  isExpanded,
  onToggle,
}: {
  row: Extract<TreeRow, { kind: "group" | "company" }>;
  treeView: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}): ReactElement {
  const { item } = row;
  const cellRole = treeView ? "gridcell" : "cell";
  const delta1m = deltaLabel(item.delta_1m);
  const delta3m = deltaLabel(item.delta_3m);

  return (
    <>
      {treeView ? (
        <div
          role={cellRole}
          className="flex shrink-0 justify-center"
          style={{ width: COLUMN_WIDTH.disclosure }}
        >
          {row.kind === "group" ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${isExpanded ? "Plegar" : "Desplegar"} ${item.name}`}
              className={cn(
                "flex size-4 items-center justify-center rounded-[var(--radius-control)] text-content-secondary hover:text-content-primary",
                FOCUS_RING_CLASS,
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "size-3 transition-transform duration-[var(--duration-fast)] motion-reduce:transition-none",
                  isExpanded && "rotate-90",
                )}
              />
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        role={cellRole}
        className="flex min-w-0 flex-1 items-center gap-1.5 pr-4 text-[length:var(--text-body)] text-content-primary"
        title={`${item.name} · ${item.id}`}
      >
        {item.alert ? (
          <>
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-content-alert" />
            <span className="sr-only">Alerta</span>
          </>
        ) : null}
        <span className="truncate">{item.name}</span>
      </div>
      {treeView ? (
        <div role={cellRole} className={FIGURE_CLASS} style={{ width: COLUMN_WIDTH.n }}>
          {row.kind === "group" ? row.item.n_companies_scored : EMPTY_VALUE}
        </div>
      ) : null}
      <div
        role={cellRole}
        className="flex shrink-0 items-center justify-end gap-1.5 font-mono tabular-nums text-content-primary"
        style={{ width: COLUMN_WIDTH.score }}
      >
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", BAND_DOT_CLASS[item.band])}
        />
        <span className="sr-only">{BAND_LABEL[item.band]}</span>
        {SCORE_FORMAT.format(item.score)}
      </div>
      <div
        role={cellRole}
        className="shrink-0 text-right font-mono tabular-nums"
        style={{ width: COLUMN_WIDTH.delta, color: delta1m.tone }}
      >
        {delta1m.text}
      </div>
      <div
        role={cellRole}
        className={cn("shrink-0 text-right font-mono tabular-nums", MID_ONLY)}
        style={{ width: COLUMN_WIDTH.delta, color: delta3m.tone }}
      >
        {delta3m.text}
      </div>
      <div
        role={cellRole}
        className={cn("shrink-0 truncate", WIDE_ONLY, REGIME_CLASS[item.regime])}
        style={{ width: COLUMN_WIDTH.regime }}
        title={REGIME_LABEL[item.regime]}
      >
        {REGIME_LABEL[item.regime]}
      </div>
      <div
        role={cellRole}
        className="flex shrink-0 justify-end"
        style={{ width: COLUMN_WIDTH.spark }}
      >
        <Sparkline points={item.sparkline_12} regime={item.regime} />
        <span className="sr-only">{REGIME_LABEL[item.regime]}</span>
      </div>
      <div role={cellRole} className={FIGURE_CLASS} style={{ width: COLUMN_WIDTH.confidence }}>
        {fmtConfidence(item.confidence)}
      </div>
      {treeView ? (
        <div
          role={cellRole}
          className={cn(FIGURE_CLASS, "truncate", WIDE_ONLY)}
          style={{ width: COLUMN_WIDTH.size }}
        >
          {row.kind === "group" ? fmtSizeShort(row.item.op_in_12m_eur, "EUR") : EMPTY_VALUE}
        </div>
      ) : null}
    </>
  );
}

function rowKey(row: TreeRow): string {
  return row.kind === "group" || row.kind === "company" ? row.item.id : `${row.kind}:${row.parent}`;
}

function rowLevel(row: TreeRow): 1 | 2 {
  if (row.kind === "group") return 1;
  return row.kind === "company" ? row.level : 2;
}

export function CompaniesPanel(): ReactElement {
  /* El `rowgroup` que scrollea se monta después de cargar: el ref es un callback y
     el `ResizeObserver` del tamaño de página se engancha en cuanto existe. */
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

  const expandedIds = useMemo(() => [...expanded], [expanded]);
  const groupQueries = useQueries({
    queries: expandedIds.map((id) => ({
      queryKey: groupKey(id),
      queryFn: () => getGroupV2(id),
    })),
  });

  /* Las filas siguen a la `unit` de la respuesta, no a la del filtro: con
     `keepPreviousData` la tabla anterior sigue en pantalla mientras llega la nueva. */
  const data = universe.data;
  const treeView = data?.unit === "group";
  let rows: TreeRow[] = [];
  if (data && treeView) {
    const children = new Map<string, UniverseItem[]>();
    const failed = new Set<string>();
    groupQueries.forEach((groupQuery, index) => {
      const id = expandedIds[index];
      if (groupQuery.data) children.set(id, groupQuery.data.companies);
      else if (groupQuery.isError) failed.add(id);
    });
    // Con `unit=group` la API publica `GroupUniverseItem`; el cliente tipa `items` como empresa.
    rows = flattenTree(data.items as unknown as GroupUniverseItem[], expanded, children, failed);
  } else if (data) {
    rows = flatRows(data.items);
  }

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    useFlushSync: false,
  });

  /* Roving tabindex: una sola fila entra en el orden de tabulación (la última
     enfocada; si no hay, la seleccionada; si no, la primera). ↑/↓ mueven el foco
     entre filas; si la fila destino aún no está montada (virtualizada), se
     desplaza hasta ella y el efecto la enfoca en cuanto exista. */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const pendingFocus = useRef<number | null>(null);
  const selectedIndex = rows.findIndex((row) =>
    row.kind === "company"
      ? row.item.id === selected
      : row.kind === "group" && row.item.id === selectedGroup,
  );
  const trackedIndex =
    focusIndex !== null && focusIndex < rows.length ? focusIndex : Math.max(0, selectedIndex);
  /* Si la fila trackeada se ha desmontado por un scroll con la rueda, la primera
     montada hereda el `tabIndex=0`: sin esto, Tab no entra en la tabla. */
  const virtualItems = virtualizer.getVirtualItems();
  const rovingIndex = virtualItems.some((item) => item.index === trackedIndex)
    ? trackedIndex
    : (virtualItems[0]?.index ?? trackedIndex);

  function rowElement(index: number): HTMLElement | null {
    return scrollElement?.querySelector(`[role="row"][data-index="${index}"]`) ?? null;
  }

  function focusRow(index: number): void {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    setFocusIndex(next);
    const element = rowElement(next);
    if (element) {
      element.focus();
      return;
    }
    pendingFocus.current = next;
    virtualizer.scrollToIndex(next);
  }

  useEffect(() => {
    if (pendingFocus.current === null) return;
    const element = rowElement(pendingFocus.current);
    if (element) {
      element.focus();
      pendingFocus.current = null;
    }
  });

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

  /** Enter o clic: un grupo se despliega y se selecciona; una empresa se selecciona. */
  function activate(row: TreeRow): void {
    if (row.kind === "group") {
      expand(row.item.id);
      selectGroup(row.item.id);
    } else if (row.kind === "company") {
      select(row.item.id);
    }
  }

  function handleRowKey(event: KeyboardEvent<HTMLDivElement>, index: number, row: TreeRow) {
    // Las teclas dentro de un botón de la fila son suyas: Enter no debe seleccionar además.
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case "Enter":
        activate(row);
        break;
      case "ArrowRight":
        if (row.kind !== "group") break;
        event.preventDefault();
        if (expanded.has(row.item.id)) focusRow(index + 1);
        else expand(row.item.id);
        break;
      case "ArrowLeft":
        if (row.kind === "group") {
          if (!expanded.has(row.item.id)) break;
          event.preventDefault();
          collapse(row.item.id);
        } else if (row.parent !== null) {
          event.preventDefault();
          const parent = row.parent;
          focusRow(
            rows.findIndex(
              (candidate) => candidate.kind === "group" && candidate.item.id === parent,
            ),
          );
        }
        break;
      case "ArrowDown":
        event.preventDefault();
        focusRow(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRow(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRow(0);
        break;
      case "End":
        event.preventDefault();
        focusRow(rows.length - 1);
        break;
      default:
        break;
    }
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
  const cellRole = treeView ? "gridcell" : "cell";

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
        <div
          role={treeView ? "treegrid" : "table"}
          aria-label="Empresas"
          className="flex min-h-0 flex-1 flex-col text-[length:var(--text-control)]"
        >
          <div role="rowgroup" className="shrink-0">
            <div
              role="row"
              className="flex items-center gap-2 border-b border-border-glass text-[length:var(--text-micro)] font-medium text-content-secondary"
              style={{ height: TABLE_HEADER_HEIGHT }}
            >
              {treeView ? (
                <div
                  role="columnheader"
                  className="shrink-0"
                  style={{ width: COLUMN_WIDTH.disclosure }}
                >
                  <span className="sr-only">Desglose</span>
                </div>
              ) : null}
              <div role="columnheader" className="min-w-0 flex-1 pr-4">
                {treeView ? "Grupo" : "Empresa"}
              </div>
              {treeView ? (
                <div
                  role="columnheader"
                  className="shrink-0 text-right"
                  style={{ width: COLUMN_WIDTH.n }}
                >
                  n
                </div>
              ) : null}
              <SortableHeader
                label="Score"
                column="score"
                query={query}
                onSort={toggleSort}
                width={COLUMN_WIDTH.score}
              />
              <SortableHeader
                label="Δ1m"
                column="delta_1m"
                query={query}
                onSort={toggleSort}
                width={COLUMN_WIDTH.delta}
              />
              <SortableHeader
                label="Δ3m"
                column="delta_3m"
                query={query}
                onSort={toggleSort}
                width={COLUMN_WIDTH.delta}
                className={MID_ONLY}
              />
              <div
                role="columnheader"
                className={cn("shrink-0", WIDE_ONLY)}
                style={{ width: COLUMN_WIDTH.regime }}
              >
                Régimen
              </div>
              <div
                role="columnheader"
                className="shrink-0 text-right"
                style={{ width: COLUMN_WIDTH.spark }}
              >
                12 m
              </div>
              <div
                role="columnheader"
                className="shrink-0 text-right"
                style={{ width: COLUMN_WIDTH.confidence }}
              >
                Conf.
              </div>
              {treeView ? (
                <div
                  role="columnheader"
                  className={cn("shrink-0 truncate text-right", WIDE_ONLY)}
                  style={{ width: COLUMN_WIDTH.size }}
                >
                  Operativa 12 m
                </div>
              ) : null}
            </div>
          </div>

          <div ref={setScrollElement} role="rowgroup" className="min-h-0 flex-1 overflow-y-auto">
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                const isGroup = row.kind === "group";
                const isExpanded = isGroup && expanded.has(row.item.id);
                const isSelected =
                  row.kind === "company"
                    ? row.item.id === selected
                    : isGroup && row.item.id === selectedGroup;
                const level = rowLevel(row);
                return (
                  <div
                    key={rowKey(row)}
                    role="row"
                    data-index={virtualRow.index}
                    tabIndex={virtualRow.index === rovingIndex ? 0 : -1}
                    aria-level={treeView ? level : undefined}
                    aria-expanded={isGroup ? isExpanded : undefined}
                    aria-selected={
                      row.kind === "group" || row.kind === "company" ? isSelected : undefined
                    }
                    className={cn(
                      "absolute left-0 flex w-full items-center gap-2 rounded-[var(--radius-control)] transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass focus-visible:ring-inset",
                      FOCUS_RING_CLASS,
                      level === 2 && "pl-6",
                      isSelected && (isGroup ? "bg-surface-glass-hover" : "bg-fills-accent-thin"),
                    )}
                    style={{
                      height: ROW_HEIGHT,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => activate(row)}
                    onFocus={(event) => {
                      if (event.target === event.currentTarget) setFocusIndex(virtualRow.index);
                    }}
                    onKeyDown={(event) => handleRowKey(event, virtualRow.index, row)}
                  >
                    {row.kind === "group" || row.kind === "company" ? (
                      <ItemCells
                        row={row}
                        treeView={treeView}
                        isExpanded={isExpanded}
                        onToggle={() => (isExpanded ? collapse(row.item.id) : expand(row.item.id))}
                      />
                    ) : row.kind === "loading" ? (
                      <div
                        role={cellRole}
                        aria-busy="true"
                        className="flex min-w-0 flex-1 items-center gap-2 text-content-secondary"
                      >
                        <span>Cargando filiales…</span>
                        <span aria-hidden="true" className={cn(SKELETON_BAR_CLASS, "w-24")} />
                      </div>
                    ) : (
                      <div
                        role={cellRole}
                        className="flex min-w-0 flex-1 items-center gap-1 text-content-secondary"
                      >
                        <span>No se pudieron cargar las filiales ·</span>
                        <button
                          type="button"
                          className={cn(
                            "rounded-[var(--radius-control)] px-1 text-content-primary hover:text-content-accent",
                            PRESS_CLASS,
                            FOCUS_RING_CLASS,
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            void groupQueries[expandedIds.indexOf(row.parent)]?.refetch();
                          }}
                        >
                          Reintentar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {hasPages ? (
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border-glass pt-1 text-[length:var(--text-micro)] text-content-secondary">
          <span className="font-mono tabular-nums">
            {`${offset + 1}-${offset + rows.length} de ${total}`}
          </span>
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
