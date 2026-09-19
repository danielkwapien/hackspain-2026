/**
 * Árbol de grupos → filiales (o tabla plana) extraído del panel Empresas para que
 * el buscador central pinte el mismo treegrid. Es tonto: las filas vienen de
 * `flattenTree`/`flatRows` y el despliegue, la selección y la ordenación viven en
 * el padre, que decide qué hace Enter sobre un grupo (el panel lo despliega y lo
 * selecciona; el buscador solo lo elige). Aquí queda lo que se ve y se teclea.
 *
 * Decisiones que se notan al leer el fichero:
 * - La retícula es `div` con roles ARIA explícitos (`treegrid` / `table`), no
 *   `<table>`: virtualizar exige posicionar cada fila y `display:flex`, y un
 *   `<table>` con ese display pierde igualmente sus roles nativos en el navegador.
 * - Roving tabindex sobre la lista aplanada: una sola fila entra en el orden de
 *   tabulación (la última enfocada; si no, la seleccionada; si no, la primera).
 * - Las columnas no caben todas en el panel a 1440 px (12/24 = 668 px útiles):
 *   Régimen y Operativa solo aparecen desde `@3xl` (768 px del contenedor) y Δ3m
 *   desde 656 px, para que el nombre conserve ≥ 300 px; el id vive solo en el
 *   `title` del nombre. Nada se solapa y nada desplaza en horizontal. La variante
 *   `compact` (buscador) deja nombre · Score · Δ1m · 12 m.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { fmtConfidence, fmtDelta, fmtSizeShort, Sparkline } from "@/charts";
import type { Band, UniverseQuery } from "@/lib/api-v2";
import { EMPTY_VALUE } from "@/lib/format";
import { BAND_LABEL, REGIME_CLASS, REGIME_LABEL } from "@/lib/regime";
import type { TreeRow } from "@/panels/companies/tree";

/* Medidas de la tabla. Las que solo pinta el CSS van por token (`--size-segment`,
   `--radius-control`). Estas siguen en píxeles porque el JS las necesita como
   número: el virtualizador estima con `ROW_HEIGHT` y la página se calcula con él.
   Debe cuadrar con `--size-table-row`; la cabecera de la tabla no tiene token. */
const TABLE_HEADER_HEIGHT = 26;
export const ROW_HEIGHT = 28;
const SKELETON_ROWS = 8;

/** Anchos fijos de las columnas cortas, medidos en Chrome sobre su contenido más
    largo (punto de banda + `100,0` a 12 px = 56; `▲ +10,9` = 50,4;
    `Deteriorándose` a 12 px = 83,8; `86 %` a 11 px = 30; `EUR 26,2 M` = 70);
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

export type SortColumn = NonNullable<UniverseQuery["sort"]>;

export type TreeColumns = "full" | "compact";

export type CompanyTreeProps = {
  rows: readonly TreeRow[];
  /** `true`: treegrid de grupos con desglose, `n` y Operativa; `false`: tabla plana. */
  treeView: boolean;
  expanded: ReadonlySet<string>;
  onExpand: (id: string) => void;
  onCollapse: (id: string) => void;
  selected: string | null;
  selectedGroup: string | null;
  /** Enter o clic sobre una filial o una fila plana. */
  onPickCompany: (id: string) => void;
  /** Enter o clic sobre un grupo: el ▸ y → despliegan por su cuenta. */
  onPickGroup: (id: string) => void;
  /** «Reintentar» de la fila de error de un grupo. */
  onRetryGroup: (id: string) => void;
  /** Sin `sort` las cabeceras no son botones. */
  sort?: { query: UniverseQuery; onSort: (column: SortColumn) => void };
  /** El `rowgroup` que scrollea, para quien lo mide (paginado por alto). */
  scrollRef?: (element: HTMLDivElement | null) => void;
  label?: string;
  columns?: TreeColumns;
};

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

const FOCUS_RING_CLASS = "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

/** Feedback de pulsación: encoge un 3 % mientras se mantiene, y vuelve en 150 ms. */
const PRESS_CLASS =
  "transition-[color,background-color,opacity,transform] duration-[var(--duration-fast)] active:scale-[.97]";

/** Cifra secundaria de la fila: `n`, confianza y operativa. */
const FIGURE_CLASS =
  "shrink-0 text-right num text-[length:var(--text-micro)] text-content-secondary";

const HEADER_CLASS = "shrink-0 text-right";

/** Cabecera ordenable: un clic ordena descendente, el segundo invierte. Sin `sort`, texto. */
function SortableHeader({
  label,
  column,
  sort,
  width,
  className,
}: {
  label: string;
  column: SortColumn;
  sort: CompanyTreeProps["sort"];
  width: number;
  className?: string;
}): ReactElement {
  if (!sort) {
    return (
      <div role="columnheader" className={cn(HEADER_CLASS, className)} style={{ width }}>
        {label}
      </div>
    );
  }
  const isActive = sort.query.sort === column;
  const order = isActive ? (sort.query.order === "asc" ? "ascending" : "descending") : "none";

  return (
    <div
      role="columnheader"
      aria-sort={order}
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
        onClick={() => sort.onSort(column)}
      >
        {label}
      </button>
    </div>
  );
}

const SKELETON_BAR_CLASS =
  "h-3 animate-pulse rounded-[var(--radius-control)] bg-surface-glass motion-reduce:animate-none";

const SKELETON_COLUMNS: Record<TreeColumns, number[]> = {
  full: [
    COLUMN_WIDTH.n,
    COLUMN_WIDTH.score,
    COLUMN_WIDTH.delta,
    COLUMN_WIDTH.delta,
    COLUMN_WIDTH.spark,
    COLUMN_WIDTH.confidence,
  ],
  compact: [COLUMN_WIDTH.score, COLUMN_WIDTH.delta, COLUMN_WIDTH.spark],
};

/** Carga con la forma de la tabla: filas de 28 px con una barra glass por columna. */
export function TableSkeleton({ columns = "full" }: { columns?: TreeColumns }): ReactElement {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col">
      <span className="sr-only">Cargando empresas</span>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <div key={row} className="flex items-center gap-2" style={{ height: ROW_HEIGHT }}>
          <div className="min-w-0 flex-1 pr-4">
            <div className={cn(SKELETON_BAR_CLASS, "max-w-48")} />
          </div>
          {SKELETON_COLUMNS[columns].map((width, column) => (
            <div key={column} className={cn(SKELETON_BAR_CLASS, "shrink-0")} style={{ width }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Celdas de una fila con datos (grupo o empresa). Solo el árbol lleva desglose,
 * `n` y Operativa: en la vista plana serían columnas enteras de `—`. En `compact`
 * quedan nombre, Score, Δ1m y 12 m.
 */
function ItemCells({
  row,
  treeView,
  full,
  isExpanded,
  onToggle,
}: {
  row: Extract<TreeRow, { kind: "group" | "company" }>;
  treeView: boolean;
  full: boolean;
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
      {treeView && full ? (
        <div role={cellRole} className={FIGURE_CLASS} style={{ width: COLUMN_WIDTH.n }}>
          {row.kind === "group" ? row.item.n_companies_scored : EMPTY_VALUE}
        </div>
      ) : null}
      <div
        role={cellRole}
        className="flex shrink-0 items-center justify-end gap-1.5 num text-content-primary"
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
        className="shrink-0 text-right num"
        style={{ width: COLUMN_WIDTH.delta, color: delta1m.tone }}
      >
        {delta1m.text}
      </div>
      {full ? (
        <div
          role={cellRole}
          className={cn("shrink-0 text-right num", MID_ONLY)}
          style={{ width: COLUMN_WIDTH.delta, color: delta3m.tone }}
        >
          {delta3m.text}
        </div>
      ) : null}
      {full ? (
        <div
          role={cellRole}
          className={cn("shrink-0 truncate", WIDE_ONLY, REGIME_CLASS[item.regime])}
          style={{ width: COLUMN_WIDTH.regime }}
          title={REGIME_LABEL[item.regime]}
        >
          {REGIME_LABEL[item.regime]}
        </div>
      ) : null}
      <div
        role={cellRole}
        className="flex shrink-0 justify-end"
        style={{ width: COLUMN_WIDTH.spark }}
      >
        <Sparkline points={item.sparkline_12} regime={item.regime} />
        <span className="sr-only">{REGIME_LABEL[item.regime]}</span>
      </div>
      {full ? (
        <div role={cellRole} className={FIGURE_CLASS} style={{ width: COLUMN_WIDTH.confidence }}>
          {fmtConfidence(item.confidence)}
        </div>
      ) : null}
      {treeView && full ? (
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

export function CompanyTree({
  rows,
  treeView,
  expanded,
  onExpand,
  onCollapse,
  selected,
  selectedGroup,
  onPickCompany,
  onPickGroup,
  onRetryGroup,
  sort,
  scrollRef,
  label = "Empresas",
  columns = "full",
}: CompanyTreeProps): ReactElement {
  const full = columns === "full";
  /* El `rowgroup` que scrollea se monta con los datos: el ref es un callback y el
     virtualizador (y quien mida el alto desde fuera) se enganchan en cuanto existe. */
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const attachScroll = useCallback(
    (element: HTMLDivElement | null) => {
      setScrollElement(element);
      scrollRef?.(element);
    },
    [scrollRef],
  );

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

  /** Enter o clic: el padre decide qué significa elegir un grupo. */
  function activate(row: TreeRow): void {
    if (row.kind === "group") onPickGroup(row.item.id);
    else if (row.kind === "company") onPickCompany(row.item.id);
  }

  function handleRowKey(event: KeyboardEvent<HTMLDivElement>, index: number, row: TreeRow) {
    // Las teclas dentro de un botón de la fila son suyas: Enter no debe seleccionar además.
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case "Enter":
        // Sin `keypress` posterior: si elegir cierra el buscador y el foco vuelve al
        // disparador, ese Enter no debe pulsarlo y reabrirlo.
        event.preventDefault();
        activate(row);
        break;
      case "ArrowRight":
        if (row.kind !== "group") break;
        event.preventDefault();
        if (expanded.has(row.item.id)) focusRow(index + 1);
        else onExpand(row.item.id);
        break;
      case "ArrowLeft":
        if (row.kind === "group") {
          if (!expanded.has(row.item.id)) break;
          event.preventDefault();
          onCollapse(row.item.id);
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

  const cellRole = treeView ? "gridcell" : "cell";

  return (
    <div
      role={treeView ? "treegrid" : "table"}
      aria-label={label}
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
          {treeView && full ? (
            <div role="columnheader" className={HEADER_CLASS} style={{ width: COLUMN_WIDTH.n }}>
              n
            </div>
          ) : null}
          <SortableHeader label="Score" column="score" sort={sort} width={COLUMN_WIDTH.score} />
          <SortableHeader label="Δ1m" column="delta_1m" sort={sort} width={COLUMN_WIDTH.delta} />
          {full ? (
            <SortableHeader
              label="Δ3m"
              column="delta_3m"
              sort={sort}
              width={COLUMN_WIDTH.delta}
              className={MID_ONLY}
            />
          ) : null}
          {full ? (
            <div
              role="columnheader"
              className={cn("shrink-0", WIDE_ONLY)}
              style={{ width: COLUMN_WIDTH.regime }}
            >
              Régimen
            </div>
          ) : null}
          <div role="columnheader" className={HEADER_CLASS} style={{ width: COLUMN_WIDTH.spark }}>
            12 m
          </div>
          {full ? (
            <div
              role="columnheader"
              className={HEADER_CLASS}
              style={{ width: COLUMN_WIDTH.confidence }}
            >
              Conf.
            </div>
          ) : null}
          {treeView && full ? (
            <div
              role="columnheader"
              className={cn(HEADER_CLASS, "truncate", WIDE_ONLY)}
              style={{ width: COLUMN_WIDTH.size }}
            >
              Operativa 12 m
            </div>
          ) : null}
        </div>
      </div>

      <div ref={attachScroll} role="rowgroup" className="min-h-0 flex-1 overflow-y-auto">
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
                    full={full}
                    isExpanded={isExpanded}
                    onToggle={() =>
                      isExpanded ? onCollapse(row.item.id) : onExpand(row.item.id)
                    }
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
                        onRetryGroup(row.parent);
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
  );
}
