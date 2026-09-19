/**
 * Buscador de empresas: tabla densa y virtualizada sobre `/api/v2/universe`.
 *
 * Tres decisiones que se notan al leer el fichero:
 * - La consulta es un solo objeto de estado y es la clave de React Query: cada
 *   filtro, la búsqueda y la ordenación la reescriben y resetean `offset`.
 * - El servidor ordena y filtra. Aquí no se reordena nada: se manda el parámetro
 *   y se pinta la respuesta tal cual llega.
 * - La retícula es `div` con roles ARIA explícitos, no `<table>`: virtualizar
 *   exige posicionar cada fila y `display:flex`, y un `<table>` con ese display
 *   pierde igualmente sus roles nativos en el navegador.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "cn";
import { EmptyState, ErrorState, LoadingTable } from "@/components/states";
import { setEntities } from "@/dashboard/store";
import type { Band, Regime, UniverseItem, UniverseQuery, Unit } from "@/lib/api-v2";
import { getUniverse } from "@/lib/api-v2";
import { BAND_CLASS, BAND_LABEL, REGIME_CLASS, REGIME_LABEL } from "../regime";
import { Sparkline } from "../Sparkline";
import type { WidgetContentProps } from "../registry";

/* Medidas de la tabla. Las que solo pinta el CSS van por token (`--size-segment`,
   `--radius-control`). Estas tres siguen en píxeles porque el JS las necesita
   como número: el virtualizador estima con `ROW_HEIGHT` y el SVG de la sparkline
   calcula sus puntos. Deben cuadrar con `--size-table-row`, `--size-sparkline-w`
   y `--size-sparkline-h`; la cabecera de la tabla no tiene token. */
const TABLE_HEADER_HEIGHT = 26;
const ROW_HEIGHT = 24;
const SPARKLINE_WIDTH = 64;
const SPARKLINE_HEIGHT = 16;

/** Anchos fijos de las columnas cortas; `Empresa` se queda el resto. */
const COLUMN_WIDTH = {
  group: 88,
  score: 44,
  delta: 56,
  regime: 108,
  spark: SPARKLINE_WIDTH,
  band: 76,
  open: 56,
};

/** Una página cabe de sobra en la tabla virtualizada; el resto se pagina. */
const PAGE_SIZE = 200;

type SortColumn = NonNullable<UniverseQuery["sort"]>;

const BANDS: Band[] = ["A", "B", "C", "D"];

const REGIMES: Regime[] = [
  "improving",
  "stable",
  "recovering",
  "blip",
  "deteriorating",
  "shock_pending",
  "warmup",
];

const DELTA_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** Color por signo: verde sube, rojo baja, gris cuando no se ha movido. */
function signClass(value: number): string {
  if (value > 0) return "text-content-positive";
  if (value < 0) return "text-content-negative";
  return "text-content-secondary";
}

const PILL_CLASS =
  "flex items-center gap-1 border border-border bg-surface-primary px-2 text-xs text-content-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const MENU_CLASS =
  "absolute left-0 top-full z-30 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-border bg-surface-elevated p-1 shadow-lg";

const MENU_ITEM_CLASS =
  "flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised";

type Option = { value: string; label: string };

/**
 * Pill de filtro: botón de 32 px con lista propia, hecha a mano como los menús
 * del marco de widget (en jsdom el popover de Radix es frágil).
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
        className={cn(PILL_CLASS, active && "text-foreground", active && "pr-1")}
        style={{ height: "var(--size-segment)", borderRadius: "var(--radius-control)" }}
        onClick={() => setOpen(!open)}
      >
        {active ? `${label}: ${active.label}` : label}
        <ChevronDown aria-hidden="true" className="size-3" />
      </button>

      {active ? (
        <button
          type="button"
          aria-label={`Quitar filtro de ${label.toLowerCase()}`}
          className="ml-1 flex items-center justify-center rounded-md p-1 text-content-secondary transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
}: {
  label: string;
  column: SortColumn;
  query: UniverseQuery;
  onSort: (column: SortColumn) => void;
  width: number;
}): ReactElement {
  const isActive = query.sort === column;
  const sort = isActive ? (query.order === "asc" ? "ascending" : "descending") : "none";

  return (
    <div role="columnheader" aria-sort={sort} className="shrink-0" style={{ width }}>
      <button
        type="button"
        className={cn(
          "w-full text-right hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          isActive && "text-foreground",
        )}
        onClick={() => onSort(column)}
      >
        {label}
      </button>
    </div>
  );
}

export function Screener({ item }: WidgetContentProps): ReactElement {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<UniverseQuery>({
    unit: "company",
    limit: PAGE_SIZE,
    offset: 0,
  });

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

  /** Cualquier cambio de filtro vuelve a la primera página. */
  function patchQuery(partial: Partial<UniverseQuery>): void {
    setQuery((previous) => ({ ...previous, ...partial, offset: 0 }));
  }

  function toggleSort(column: SortColumn): void {
    setQuery((previous) => ({
      ...previous,
      sort: column,
      order: previous.sort === column && previous.order === "desc" ? "asc" : "desc",
      offset: 0,
    }));
  }

  function selectRow(row: UniverseItem): void {
    setEntities(item.i, [{ kind: "company", id: row.id, name: row.name }]);
  }

  function openRow(row: UniverseItem): void {
    void navigate(`/company/${row.id}`);
  }

  // Los grupos que ofrece la pill salen de lo que hay en pantalla; el elegido
  // se queda siempre, aunque el filtro haya dejado fuera a los demás.
  const groupOptions: Option[] = useMemo(() => {
    const ids = new Set(rows.map((row) => row.group_id));
    if (query.groupId) ids.add(query.groupId);
    return [...ids].sort().map((id) => ({ value: id, label: id }));
  }, [rows, query.groupId]);

  const offset = query.offset ?? 0;
  const total = universe.data?.total ?? 0;
  const hasPages = total > rows.length;

  return (
    <div className="flex h-full flex-col gap-1 pt-1">
      <div className="flex shrink-0 items-center gap-2 rounded-md border border-border px-2">
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-content-secondary" />
        <input
          type="search"
          aria-label="Buscar empresa"
          placeholder="Nombre, id o grupo"
          value={query.q ?? ""}
          onChange={(event) => patchQuery({ q: event.target.value })}
          className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-content-secondary"
          style={{ height: "var(--size-input)" }}
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <FilterPill
          label="Banda"
          value={query.band}
          options={BANDS.map((band) => ({ value: band, label: `${band} · ${BAND_LABEL[band]}` }))}
          onSelect={(value) => patchQuery({ band: value as Band })}
          onClear={() => patchQuery({ band: undefined })}
        />
        <FilterPill
          label="Régimen"
          value={query.regime}
          options={REGIMES.map((regime) => ({ value: regime, label: REGIME_LABEL[regime] }))}
          onSelect={(value) => patchQuery({ regime: value as Regime })}
          onClear={() => patchQuery({ regime: undefined })}
        />
        <FilterPill
          label="Grupo"
          value={query.groupId}
          options={groupOptions}
          onSelect={(value) => patchQuery({ groupId: value })}
          onClear={() => patchQuery({ groupId: undefined })}
        />

        <div
          role="group"
          aria-label="Unidad"
          className="flex shrink-0 items-center gap-1 border border-border px-1 text-xs text-content-secondary"
          style={{ height: "var(--size-segment)", borderRadius: "var(--radius-control)" }}
        >
          <span className="px-1">Unidad</span>
          {(["company", "group"] as Unit[]).map((unit) => (
            <button
              key={unit}
              type="button"
              aria-pressed={query.unit === unit}
              className={cn(
                "px-2 py-1 transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                query.unit === unit && "bg-surface-raised text-foreground",
              )}
              style={{ borderRadius: "var(--radius-control)" }}
              onClick={() => patchQuery({ unit, groupId: undefined })}
            >
              {unit === "company" ? "Empresa" : "Grupo"}
            </button>
          ))}
        </div>
      </div>

      {universe.isPending ? (
        <LoadingTable rows={8} columns={8} />
      ) : universe.isError ? (
        <ErrorState
          error={universe.error}
          onRetry={() => void universe.refetch()}
          context="las empresas del universo"
        />
      ) : rows.length === 0 ? (
        <EmptyState title="Ninguna empresa cumple los filtros" />
      ) : (
        <div role="table" aria-label="Empresas" className="flex min-h-0 flex-1 flex-col text-xs">
          <div role="rowgroup" className="shrink-0">
            <div
              role="row"
              className="flex items-center gap-2 border-b border-border px-2 text-content-secondary"
              style={{ height: TABLE_HEADER_HEIGHT }}
            >
              <div role="columnheader" className="min-w-0 flex-1">
                Empresa
              </div>
              <div
                role="columnheader"
                className="shrink-0 text-right"
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
              />
              <div
                role="columnheader"
                className="shrink-0 text-right"
                style={{ width: COLUMN_WIDTH.regime }}
              >
                Régimen
              </div>
              <div
                role="columnheader"
                className="shrink-0 text-right"
                style={{ width: COLUMN_WIDTH.spark }}
              >
                Serie
              </div>
              <div
                role="columnheader"
                className="shrink-0 text-right"
                style={{ width: COLUMN_WIDTH.band }}
              >
                Banda
              </div>
              <div role="columnheader" className="shrink-0" style={{ width: COLUMN_WIDTH.open }}>
                <span className="sr-only">Acciones</span>
              </div>
            </div>
          </div>

          <div ref={scrollRef} role="rowgroup" className="min-h-0 flex-1 overflow-y-auto">
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                return (
                <div
                  key={row.id}
                  role="row"
                  tabIndex={0}
                  className="group/row absolute left-0 flex w-full items-center gap-2 px-2 hover:bg-surface-raised focus-visible:bg-surface-raised focus-visible:outline-none"
                  style={{
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => selectRow(row)}
                  onDoubleClick={() => openRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") selectRow(row);
                  }}
                >
                  <div
                    role="cell"
                    className="flex min-w-0 flex-1 flex-col justify-center leading-none"
                  >
                    <span className="truncate text-foreground">{row.name}</span>
                    <span className="truncate font-mono text-[length:var(--text-micro)] text-content-secondary">
                      {row.id}
                    </span>
                  </div>
                  <div
                    role="cell"
                    className="shrink-0 truncate text-right font-mono text-content-secondary"
                    style={{ width: COLUMN_WIDTH.group }}
                  >
                    {row.group_id}
                  </div>
                  <div
                    role="cell"
                    className="shrink-0 text-right font-mono tabular-nums text-foreground"
                    style={{ width: COLUMN_WIDTH.score }}
                  >
                    {row.score}
                  </div>
                  <div
                    role="cell"
                    className={cn(
                      "shrink-0 text-right font-mono tabular-nums",
                      signClass(row.delta_1m),
                    )}
                    style={{ width: COLUMN_WIDTH.delta }}
                  >
                    {DELTA_FORMAT.format(row.delta_1m)}
                  </div>
                  <div
                    role="cell"
                    className={cn(
                      "shrink-0 text-right font-mono tabular-nums",
                      signClass(row.delta_3m),
                    )}
                    style={{ width: COLUMN_WIDTH.delta }}
                  >
                    {DELTA_FORMAT.format(row.delta_3m)}
                  </div>
                  <div
                    role="cell"
                    className={cn("shrink-0 truncate text-right", REGIME_CLASS[row.regime])}
                    style={{ width: COLUMN_WIDTH.regime }}
                  >
                    {REGIME_LABEL[row.regime]}
                  </div>
                  <div
                    role="cell"
                    className="flex shrink-0 justify-end"
                    style={{ width: COLUMN_WIDTH.spark }}
                  >
                    <Sparkline
                      values={row.sparkline_12}
                      width={SPARKLINE_WIDTH}
                      height={SPARKLINE_HEIGHT}
                      className={signClass(row.delta_3m)}
                    />
                  </div>
                  <div
                    role="cell"
                    className={cn("shrink-0 truncate text-right", BAND_CLASS[row.band])}
                    style={{ width: COLUMN_WIDTH.band }}
                  >
                    {BAND_LABEL[row.band]}
                  </div>
                  <div
                    role="cell"
                    className="flex shrink-0 justify-end"
                    style={{ width: COLUMN_WIDTH.open }}
                  >
                    <button
                      type="button"
                      className="rounded-md px-1.5 py-0.5 text-[length:var(--text-micro)] text-content-secondary opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover/row:opacity-100 hover:bg-surface-raised hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={(event) => {
                        event.stopPropagation();
                        openRow(row);
                      }}
                    >
                      Abrir
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
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-1 text-[length:var(--text-micro)] text-content-secondary">
          <span className="font-mono tabular-nums">
            {`${offset + 1}-${offset + rows.length} de ${total}`}
          </span>
          <button
            type="button"
            disabled={offset === 0}
            className="rounded-md px-1.5 py-0.5 hover:bg-surface-raised hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            onClick={() => setQuery({ ...query, offset: Math.max(0, offset - PAGE_SIZE) })}
          >
            Anteriores
          </button>
          <button
            type="button"
            disabled={offset + rows.length >= total}
            className="rounded-md px-1.5 py-0.5 hover:bg-surface-raised hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            onClick={() => setQuery({ ...query, offset: offset + PAGE_SIZE })}
          >
            Siguientes
          </button>
        </div>
      ) : null}
    </div>
  );
}
