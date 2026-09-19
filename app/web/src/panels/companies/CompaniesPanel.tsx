/**
 * Panel Empresas: tabla densa y virtualizada sobre `/api/v2/universe`, el
 * «Research» de Trade Republic.
 *
 * Cuatro decisiones que se notan al leer el fichero:
 * - La consulta es un solo objeto de estado y es la clave de React Query: cada
 *   filtro y la ordenación la reescriben y resetean `offset`. La búsqueda NO vive
 *   aquí: la topbar y el buscador del panel escriben el mismo `search` del store,
 *   y el `offset` guarda para qué búsqueda vale (`page.search`), así que cambiar
 *   la búsqueda vuelve a la primera página sin efectos ni consultas dobles.
 * - El servidor ordena y filtra. Aquí no se reordena nada: se manda el parámetro
 *   y se pinta la respuesta tal cual llega.
 * - La retícula es `div` con roles ARIA explícitos, no `<table>`: virtualizar
 *   exige posicionar cada fila y `display:flex`, y un `<table>` con ese display
 *   pierde igualmente sus roles nativos en el navegador.
 * - Las diez columnas no caben en el panel a 1440 px (10/24 ≈ 550 px útiles):
 *   por debajo de `@3xl` (768 px del contenedor) se ocultan Id, Grupo y Δ3m, que
 *   son las que menos decide un tesorero desde la tabla; el nombre lleva el id en
 *   su `title`. Nada se solapa y nada desplaza en horizontal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "cn";
import { fmtDelta, Sparkline } from "@/charts";
import { ErrorState } from "@/components/states";
import { select, setSearch, toggleCompare, useSelection } from "@/dashboard/selection";
import type { Band, Regime, UniverseItem, UniverseQuery, Unit } from "@/lib/api-v2";
import { getUniverse } from "@/lib/api-v2";
import { BAND_CLASS, BAND_LABEL, REGIME_CLASS, REGIME_LABEL } from "@/lib/regime";

/* Medidas de la tabla. Las que solo pinta el CSS van por token (`--size-segment`,
   `--radius-control`). Estas siguen en píxeles porque el JS las necesita como
   número: el virtualizador estima con `ROW_HEIGHT`. Debe cuadrar con
   `--size-table-row`; la cabecera de la tabla no tiene token. */
const TABLE_HEADER_HEIGHT = 26;
const ROW_HEIGHT = 28;
const SKELETON_ROWS = 8;

/** Anchos fijos de las columnas cortas, medidos sobre su contenido más largo
    (`GROUP_0222` a 11 px mono, `Deteriorándose` a 12 px); `Empresa` se queda el resto. */
const COLUMN_WIDTH = {
  id: 62,
  group: 70,
  score: 40,
  delta: 52,
  regime: 88,
  spark: 64,
  band: 64,
  action: 68,
};

/** Columnas que solo caben con el contenedor a 768 px o más. */
const WIDE_ONLY = "hidden @3xl:block";

/** Una página cabe de sobra en la tabla virtualizada; el resto se pagina. */
const PAGE_SIZE = 200;

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

const PILL_CLASS = cn(
  "flex items-center gap-1 rounded-[var(--radius-control)] px-2 text-[length:var(--text-control)] text-content-secondary transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover hover:text-content-primary",
  GLASS_CLASS,
  FOCUS_RING_CLASS,
);

const MENU_CLASS =
  "animate-crossfade motion-reduce:animate-none absolute top-full left-0 z-[var(--z-dropdown)] mt-1 max-h-64 w-48 origin-top-left overflow-y-auto rounded-lg bg-surface-elevated p-1 shadow-[inset_0_0_0_1px_var(--border-glass)]";

const MENU_ITEM_CLASS = cn(
  "flex w-full items-center rounded-[var(--radius-control)] px-2 py-1.5 text-left text-[length:var(--text-control)] text-content-primary transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover",
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
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const active = options.find((option) => option.value === value);

  return (
    <div
      ref={wrapRef}
      className="relative flex shrink-0 items-center"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(PILL_CLASS, active && "pr-1 text-content-primary")}
        style={{ height: "var(--size-segment)" }}
        onClick={() => setOpen(!open)}
      >
        {active ? `${label}: ${active.label}` : label}
        <ChevronDown aria-hidden="true" className="size-3" />
      </button>

      {active ? (
        <button
          type="button"
          aria-label={`Quitar filtro de ${label.toLowerCase()}`}
          className={cn(
            "ml-1 flex items-center justify-center rounded-[var(--radius-control)] p-1 text-content-secondary transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover hover:text-content-primary",
            FOCUS_RING_CLASS,
          )}
          onClick={() => {
            onClear();
            setOpen(false);
          }}
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      ) : null}

      {open ? (
        <div role="menu" aria-label={label} className={MENU_CLASS}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitem"
              className={MENU_ITEM_CLASS}
              onClick={() => {
                onSelect(option.value);
                setOpen(false);
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
          "w-full text-right transition-colors duration-[var(--duration-fast)] hover:text-content-primary",
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
  COLUMN_WIDTH.score,
  COLUMN_WIDTH.delta,
  COLUMN_WIDTH.delta,
  COLUMN_WIDTH.regime,
  COLUMN_WIDTH.spark,
  COLUMN_WIDTH.band,
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

export function CompaniesPanel(): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const search = useSelection((state) => state.search);
  const selected = useSelection((state) => state.selected);
  const compare = useSelection((state) => state.compare);

  const [filters, setFilters] = useState<Omit<UniverseQuery, "q" | "offset" | "limit">>({
    unit: "company",
  });
  /** El `offset` vale para la búsqueda con la que se pidió; otra búsqueda lo devuelve a 0. */
  const [page, setPage] = useState({ search, offset: 0 });
  const offset = page.search === search ? page.offset : 0;

  const query: UniverseQuery = { ...filters, q: search, limit: PAGE_SIZE, offset };

  const universe = useQuery({
    queryKey: ["universe", query],
    queryFn: () => getUniverse(query),
    // Reordenar no debe parpadear a esqueleto: la tabla anterior aguanta hasta que llega la nueva.
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => universe.data?.items ?? [], [universe.data]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
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
  const selectedIndex = rows.findIndex((row) => row.id === selected);
  const rovingIndex =
    focusIndex !== null && focusIndex < rows.length ? focusIndex : Math.max(0, selectedIndex);

  function rowElement(index: number): HTMLElement | null {
    return scrollRef.current?.querySelector(`[role="row"][data-index="${index}"]`) ?? null;
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

  function handleRowKey(event: KeyboardEvent<HTMLDivElement>, index: number, row: UniverseItem) {
    // Las teclas dentro del botón «Comparar» son suyas: Enter no debe seleccionar además.
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case "Enter":
        select(row.id);
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
    setPage({ search, offset: 0 });
  }

  function toggleSort(column: SortColumn): void {
    patchFilters({
      sort: column,
      order: filters.sort === column && filters.order === "desc" ? "asc" : "desc",
    });
  }

  // Los grupos que ofrece la pill salen de lo que hay en pantalla; el elegido
  // se queda siempre, aunque el filtro haya dejado fuera a los demás.
  const groupOptions: Option[] = useMemo(() => {
    const ids = new Set(rows.map((row) => row.group_id));
    if (filters.groupId) ids.add(filters.groupId);
    return [...ids].sort().map((id) => ({ value: id, label: id }));
  }, [rows, filters.groupId]);

  const total = universe.data?.total ?? 0;
  const hasPages = total > rows.length;

  return (
    <div className="@container flex h-full flex-col gap-2 pt-1">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div
          className={cn(
            "flex min-w-40 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-2",
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
        <FilterPill
          label="Grupo"
          value={filters.groupId}
          options={groupOptions}
          onSelect={(value) => patchFilters({ groupId: value })}
          onClear={() => patchFilters({ groupId: undefined })}
        />

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
                "h-full rounded-[var(--radius-control)] px-2 transition-colors duration-[var(--duration-fast)] hover:text-content-primary",
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
        <div className="flex flex-col gap-1 py-6 text-[length:var(--text-body)] text-content-secondary">
          <p>Ninguna empresa cumple los filtros</p>
          <p className="text-[length:var(--text-control)]">Quita un filtro o cambia la búsqueda.</p>
        </div>
      ) : (
        <div
          role="table"
          aria-label="Empresas"
          className="flex min-h-0 flex-1 flex-col text-[length:var(--text-control)]"
        >
          <div role="rowgroup" className="shrink-0">
            <div
              role="row"
              className="flex items-center gap-2 border-b border-border-glass text-[length:var(--text-micro)] font-medium text-content-secondary"
              style={{ height: TABLE_HEADER_HEIGHT }}
            >
              <div role="columnheader" className="min-w-0 flex-1 pr-4">
                Empresa
              </div>
              <div
                role="columnheader"
                className={cn("shrink-0", WIDE_ONLY)}
                style={{ width: COLUMN_WIDTH.id }}
              >
                Id
              </div>
              <div
                role="columnheader"
                className={cn("shrink-0", WIDE_ONLY)}
                style={{ width: COLUMN_WIDTH.group }}
              >
                Grupo
              </div>
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
                className={WIDE_ONLY}
              />
              <div role="columnheader" className="shrink-0" style={{ width: COLUMN_WIDTH.regime }}>
                Régimen
              </div>
              <div
                role="columnheader"
                className="shrink-0 text-right"
                style={{ width: COLUMN_WIDTH.spark }}
              >
                12 m
              </div>
              <div role="columnheader" className="shrink-0" style={{ width: COLUMN_WIDTH.band }}>
                Banda
              </div>
              <div role="columnheader" className="shrink-0" style={{ width: COLUMN_WIDTH.action }}>
                <span className="sr-only">Acciones</span>
              </div>
            </div>
          </div>

          <div ref={scrollRef} role="rowgroup" className="min-h-0 flex-1 overflow-y-auto">
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                const isSelected = selected === row.id;
                const comparing = compare.includes(row.id);
                const delta1m = deltaLabel(row.delta_1m);
                const delta3m = deltaLabel(row.delta_3m);
                return (
                  <div
                    key={row.id}
                    role="row"
                    data-index={virtualRow.index}
                    tabIndex={virtualRow.index === rovingIndex ? 0 : -1}
                    aria-selected={isSelected}
                    className={cn(
                      "group/row absolute left-0 flex w-full items-center gap-2 rounded-[var(--radius-control)] transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass focus-visible:ring-inset",
                      FOCUS_RING_CLASS,
                      isSelected && "bg-fills-accent-thin",
                    )}
                    style={{
                      height: ROW_HEIGHT,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => select(row.id)}
                    onFocus={(event) => {
                      if (event.target === event.currentTarget) setFocusIndex(virtualRow.index);
                    }}
                    onKeyDown={(event) => handleRowKey(event, virtualRow.index, row)}
                  >
                    <div
                      role="cell"
                      className="min-w-0 flex-1 truncate pr-4 text-[length:var(--text-body)] text-content-primary"
                      title={`${row.name} · ${row.id}`}
                    >
                      {row.name}
                    </div>
                    <div
                      role="cell"
                      className={cn(
                        "shrink-0 truncate font-mono text-[length:var(--text-micro)] tabular-nums text-content-secondary",
                        WIDE_ONLY,
                      )}
                      style={{ width: COLUMN_WIDTH.id }}
                    >
                      {row.id}
                    </div>
                    <div
                      role="cell"
                      className={cn(
                        "shrink-0 truncate font-mono text-[length:var(--text-micro)] tabular-nums text-content-secondary",
                        WIDE_ONLY,
                      )}
                      style={{ width: COLUMN_WIDTH.group }}
                      title={row.group_id}
                    >
                      {row.group_id}
                    </div>
                    <div
                      role="cell"
                      className="shrink-0 text-right font-mono tabular-nums text-content-primary"
                      style={{ width: COLUMN_WIDTH.score }}
                    >
                      {SCORE_FORMAT.format(row.score)}
                    </div>
                    <div
                      role="cell"
                      className="shrink-0 text-right font-mono tabular-nums"
                      style={{ width: COLUMN_WIDTH.delta, color: delta1m.tone }}
                    >
                      {delta1m.text}
                    </div>
                    <div
                      role="cell"
                      className={cn("shrink-0 text-right font-mono tabular-nums", WIDE_ONLY)}
                      style={{ width: COLUMN_WIDTH.delta, color: delta3m.tone }}
                    >
                      {delta3m.text}
                    </div>
                    <div
                      role="cell"
                      className={cn("shrink-0 truncate", REGIME_CLASS[row.regime])}
                      style={{ width: COLUMN_WIDTH.regime }}
                    >
                      {REGIME_LABEL[row.regime]}
                    </div>
                    <div
                      role="cell"
                      className="flex shrink-0 justify-end"
                      style={{ width: COLUMN_WIDTH.spark }}
                    >
                      <Sparkline points={row.sparkline_12} regime={row.regime} />
                    </div>
                    <div
                      role="cell"
                      className={cn("shrink-0 truncate", BAND_CLASS[row.band])}
                      style={{ width: COLUMN_WIDTH.band }}
                    >
                      {BAND_LABEL[row.band]}
                    </div>
                    <div
                      role="cell"
                      className="flex shrink-0 justify-end"
                      style={{ width: COLUMN_WIDTH.action }}
                    >
                      {/* Toggle: la etiqueta no cambia, el estado va en `aria-pressed` y en el color.
                          Sin `backdrop-blur`: son 200 filas virtualizadas y el blur se queda en el panel. */}
                      <button
                        type="button"
                        aria-pressed={comparing}
                        className={cn(
                          "h-[22px] rounded-[var(--radius-control)] bg-surface-glass px-1.5 text-[length:var(--text-micro)] text-content-secondary opacity-0 shadow-[inset_0_0_0_1px_var(--border-glass)] transition-opacity duration-[var(--duration-fast)] group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:text-content-primary active:scale-[.97]",
                          FOCUS_RING_CLASS,
                          comparing && "text-content-accent opacity-100",
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCompare(row.id);
                        }}
                      >
                        Comparar
                      </button>
                    </div>
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
            className={cn(
              "rounded-[var(--radius-control)] px-1 transition-colors duration-[var(--duration-fast)] hover:text-content-primary disabled:pointer-events-none disabled:opacity-40",
              FOCUS_RING_CLASS,
            )}
            onClick={() => setPage({ search, offset: Math.max(0, offset - PAGE_SIZE) })}
          >
            Anteriores
          </button>
          <button
            type="button"
            disabled={offset + rows.length >= total}
            className={cn(
              "rounded-[var(--radius-control)] px-1 transition-colors duration-[var(--duration-fast)] hover:text-content-primary disabled:pointer-events-none disabled:opacity-40",
              FOCUS_RING_CLASS,
            )}
            onClick={() => setPage({ search, offset: offset + PAGE_SIZE })}
          >
            Siguientes
          </button>
        </div>
      ) : null}
    </div>
  );
}
