/**
 * Cabecera del Mapa: cartera · filtros · tamaño · color, las preguntas del
 * heatmap de Trade Republic (*Nasdaq 100* · *Capitalización bursátil* ·
 * *Variación %*) traducidas a este universo: qué entra, de qué es el área y de
 * qué es el color.
 *
 * **Qué entra ya no es una cadena, es un objeto** (`UniverseValue`). Antes el
 * universo era `"country:ES"`, un solo valor que mezclaba cinco cosas en una
 * lista y solo dejaba elegir UNA; ahora son cuatro filtros —cartera, país,
 * industria y ERP— que se aplican en **AND**, que es lo que permite preguntar
 * «mis favoritas españolas de hostelería sin ERP» en vez de una de las cuatro.
 * Con los cuatro en su defecto entran las 1.286 sociedades, que es el estado
 * más general posible.
 *
 * Tres decisiones:
 *
 * - **Los tres filtros de dimensión viven en un cajón**, detrás de un botón
 *   `Filtros · 2` que dice cuántos hay puestos. No es preferencia: medido a
 *   1440 × 900, los seis controles en la fila de 432 px del tablero ocupan
 *   TRES renglones y le comen 64 px de alto al mapa —un quinto del mapa— y con
 *   el cajón son dos renglones y 32 px. La cartera se queda fuera porque es la
 *   que más se toca.
 * - **Las opciones salen del propio payload**, de la fila por sociedad que
 *   `/api/v2/treemap` manda en `companies`: cero consultas nuevas, cero
 *   opciones inventadas y ningún desfase entre lo que ofrece la lista y lo que
 *   el filtro puede encontrar. Van por volumen, la de más sociedades primero.
 * - **«Sin ERP» es una opción de verdad**, no un hueco. 541 de 1.286 (el 42 %)
 *   no tienen ERP: sin ella, filtrar por ERP hace desaparecer casi la mitad del
 *   universo y nadie sabe por qué. Por volumen le toca además ir la primera.
 *
 * El país que se filtra es el del perfil (`entity_profile`), completo en las
 * 1.286 y normalizado en 38 valores; el declarado en origen viaja al lado
 * (`country_declared`, 230 filas) y no manda (H1).
 *
 * El «(EUR)» de la etiqueta de tamaño no es decoración: el dataset trae 39
 * monedas y no hay tabla de cambio, así que el pendiente suma SOLO facturas en
 * euros. Quien lee la cifra tiene que saberlo sin preguntar.
 */

import { useMemo } from "react";
import type { ReactElement, ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover } from "radix-ui";
import { fmtSizeShort } from "@/charts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PORTFOLIO } from "@/dashboard/watchlist";
import type { TreemapCompany, TreemapResponse } from "@/lib/api-v2";
import { formatCount } from "@/lib/format";

type Metric = TreemapResponse["metric"];

/** Magnitud de la que sale el área de la ficha, entre las que el motor emite hoy. */
export type SizeBy = Extract<
  TreemapResponse["size_by"],
  "pending_eur" | "op_in_12m_eur" | "n_invoices" | "n_transactions"
>;

/* ------------------------------------------------------------------ */
/* Universo: cuatro filtros en AND                                     */
/* ------------------------------------------------------------------ */

/** Las tres listas del cliente: el universo entero, la cartera o los favoritos. */
export type UniverseList = "all" | "portfolio" | "favorites";

/** «Todos», como valor de `Select`: Radix no admite ni cadena vacía ni `null`. */
export const ANY = "any";

/** Las 541 sociedades sin ERP: un hueco de dato con nombre propio en la lista. */
export const NO_ERP = "none";

/** Lo que filtra el mapa. Los cuatro se cruzan en AND; su defecto deja pasar todo. */
export type UniverseValue = {
  list: UniverseList;
  country: string;
  industry: string;
  erp: string;
};

export type FilterKey = keyof UniverseValue;

export const UNIVERSE_ALL: UniverseValue = {
  list: "all",
  country: ANY,
  industry: ANY,
  erp: ANY,
};

/** Empresa tal como la ve el filtro: su id y las tres dimensiones del perfil. */
export type UniverseEntity = {
  id: string;
  country: string | null;
  industry: string | null;
  erp: string | null;
};

const LIST_LABELS: Record<UniverseList, string> = {
  all: "Todas las empresas",
  portfolio: "Mi cartera",
  favorites: "Favoritos",
};

/** Una industria se publica en minúscula (`hostelería y ocio`); se lee en alta. */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Las tres dimensiones del perfil, cada una con su nombre, su opción «todos» y
 * de qué columna sale. El ERP resuelve el nulo a `NO_ERP` aquí, en un solo
 * sitio: así «Sin ERP» es una clave más y no un caso especial en cada uso.
 */
type Dimension = {
  key: Exclude<FilterKey, "list">;
  name: string;
  all: string;
  of: (entity: UniverseEntity) => string | null;
  label: (key: string) => string;
};

const DIMENSIONS: readonly Dimension[] = [
  {
    key: "country",
    name: "País",
    all: "Todos los países",
    of: (entity) => entity.country,
    label: (key) => key,
  },
  {
    key: "industry",
    name: "Industria",
    all: "Todas las industrias",
    of: (entity) => entity.industry,
    label: capitalize,
  },
  {
    key: "erp",
    name: "ERP",
    all: "Todos los ERP",
    of: (entity) => entity.erp ?? NO_ERP,
    label: (key) => (key === NO_ERP ? "Sin ERP" : key),
  },
];

const PORTFOLIO_IDS: ReadonlySet<string> = new Set(PORTFOLIO.map((position) => position.id));

/**
 * ¿Entra esta empresa en el universo elegido? Los cuatro filtros en AND: la
 * cartera y los favoritos se resuelven contra el cliente y las tres dimensiones
 * contra la fila que el payload ya trae. En ningún caso se pide nada a la API.
 */
export function inUniverse(
  entity: UniverseEntity,
  universe: UniverseValue,
  favorites: readonly string[],
): boolean {
  if (universe.list === "portfolio" && !PORTFOLIO_IDS.has(entity.id)) return false;
  if (universe.list === "favorites" && !favorites.includes(entity.id)) return false;
  for (const dimension of DIMENSIONS) {
    const chosen = universe[dimension.key];
    if (chosen !== ANY && dimension.of(entity) !== chosen) return false;
  }
  return true;
}

/** Un filtro puesto: cómo se llama, qué dice y con qué clave se quita. */
export type ActiveFilter = { key: FilterKey; name: string; value: string };

/**
 * Los filtros puestos, en el orden de la cabecera. Es lo que necesita el estado
 * vacío para decir QUÉ está cortando en vez de enseñar un rectángulo negro.
 */
export function activeFilters(universe: UniverseValue): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  if (universe.list !== "all") {
    active.push({ key: "list", name: "Cartera", value: LIST_LABELS[universe.list] });
  }
  for (const dimension of DIMENSIONS) {
    const chosen = universe[dimension.key];
    if (chosen === ANY) continue;
    active.push({ key: dimension.key, name: dimension.name, value: dimension.label(chosen) });
  }
  return active;
}

/** El mismo universo sin ese filtro: los otros tres siguen en pie. */
export function withoutFilter(universe: UniverseValue, key: FilterKey): UniverseValue {
  switch (key) {
    case "list":
      return { ...universe, list: UNIVERSE_ALL.list };
    case "country":
      return { ...universe, country: ANY };
    case "industry":
      return { ...universe, industry: ANY };
    case "erp":
      return { ...universe, erp: ANY };
  }
}

/** Cuántos de los tres del cajón están puestos: el contador de «Filtros · 2». */
function dimensionCount(universe: UniverseValue): number {
  return DIMENSIONS.filter((dimension) => universe[dimension.key] !== ANY).length;
}

type Option = { key: string; label: string; n: number };

/**
 * Opciones de una dimensión, contadas sobre el corte y ordenadas por volumen:
 * la lista empieza por donde están las empresas. El empate se rompe por nombre
 * para que dos cortes iguales den la misma lista.
 */
function optionsOf(dimension: Dimension, companies: readonly UniverseEntity[]): Option[] {
  const counts = new Map<string, number>();
  for (const company of companies) {
    const key = dimension.of(company);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, n]) => ({ key, label: dimension.label(key), n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "es"));
}

/* ------------------------------------------------------------------ */
/* Tamaño y color                                                      */
/* ------------------------------------------------------------------ */

type SizeOption = {
  value: SizeBy;
  label: string;
  /** Palabra del recuento; `null` cuando la magnitud es dinero y lleva moneda. */
  noun: string | null;
  /** Cómo se nombra la magnitud dentro de una frase del subtítulo. */
  sentence: string;
};

export const SIZE_OPTIONS: readonly SizeOption[] = [
  {
    value: "pending_eur",
    label: "Pendiente de cobro (EUR)",
    noun: null,
    sentence: "pendiente de cobro",
  },
  {
    // XR-033 publica la operativa de 12 meses en dos columnas: `op_in_12m`, en
    // la moneda de la entidad, y esta, ya convertida. Solo la convertida se
    // puede repartir en un mapa: cinco sociedades colombianas suman 18.325
    // millones de pesos y aplastarían a las 1.149 que están en euros.
    value: "op_in_12m_eur",
    label: "Cobros 12m (EUR)",
    noun: null,
    sentence: "cobros de 12 meses",
  },
  { value: "n_invoices", label: "Nº de facturas", noun: "facturas", sentence: "facturas" },
  {
    value: "n_transactions",
    label: "Nº de movimientos",
    noun: "movimientos",
    sentence: "movimientos",
  },
];

/** Moneda del pendiente: la etiqueta la dice y la cifra la repite. */
const CURRENCY = "EUR";

function sizeOption(size: TreemapResponse["size_by"]): SizeOption | undefined {
  return SIZE_OPTIONS.find((option) => option.value === size);
}

/**
 * Total de una magnitud, listo para una cabecera: el dinero con su moneda
 * (`EUR 406,4 M`), el recuento con su palabra (`1.284 facturas`). Nunca un `€`
 * encima de un recuento. `null` = esa magnitud no tiene total que decir
 * (`n_companies` ya está dicho en el censo).
 */
export function fmtSizeTotal(size: TreemapResponse["size_by"], total: number): string | null {
  const option = sizeOption(size);
  if (!option) return null;
  return option.noun === null
    ? fmtSizeShort(total, CURRENCY)
    : `${formatCount(total)} ${option.noun}`;
}

/**
 * Moneda de la magnitud, o `null` cuando es un recuento: con facturas o
 * movimientos no se inventa un EUR. Lo usa la tabla accesible del treemap,
 * que sin esto imprimía `1.536.174,39` a secas mientras la cabecera visible
 * decía «EUR 1,5 M».
 */
export function sizeCurrency(size: TreemapResponse["size_by"]): string | null {
  const option = sizeOption(size);
  return option !== undefined && option.noun === null ? CURRENCY : null;
}

/** Nombre de la magnitud dentro de una frase: «sin pendiente de cobro». */
export function sizeInSentence(size: TreemapResponse["size_by"]): string | null {
  return sizeOption(size)?.sentence ?? null;
}

type MetricOption = { value: Metric; label: string };

/** Color de la ficha. Score primero: es el único que existe en todos los cortes. */
export const METRIC_OPTIONS: readonly MetricOption[] = [
  { value: "score", label: "Score" },
  { value: "delta_3m", label: "Δ3m" },
  { value: "delta_1m", label: "Δ1m" },
];

export function metricLabel(metric: Metric): string {
  return METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? metric;
}

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

export type TreemapHeaderProps = {
  universe: UniverseValue;
  onUniverseChange: (value: UniverseValue) => void;
  /** Sociedades del corte: de aquí salen las opciones de los tres del cajón. */
  companies?: readonly TreemapCompany[];
  size: SizeBy;
  onSizeChange: (value: SizeBy) => void;
  metric: Metric;
  onMetricChange: (value: Metric) => void;
  /** Corte sin historia: el color solo puede ser el score. */
  snapshotsOnly?: boolean;
  /** Línea de estado del widget: vive en la cabecera, debajo de los controles. */
  status?: ReactNode;
};

/**
 * Los cuatro caben en dos renglones de 432 px porque la fila envuelve: a poco
 * ancho el control baja de línea entero, nunca truncado. Un desplegable con la
 * etiqueta cortada («Pendiente de cob…») no dice qué está midiendo el mapa, que
 * es justo lo único que tenía que decir.
 */
const TRIGGER_CLASS =
  "max-w-full shrink-0 gap-1 rounded-[var(--radius-control)] border-0 bg-surface-glass px-2 text-[length:var(--text-control)] font-semibold text-content-primary shadow-[inset_0_0_0_1px_var(--border-glass)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 [@media(hover:hover)]:hover:bg-surface-glass-hover";

/** El botón del cajón se pinta como un desplegable más: misma altura, mismo peso. */
const FILTERS_CLASS = `${TRIGGER_CLASS} inline-flex h-7 items-center whitespace-nowrap outline-none data-[state=open]:bg-surface-glass-hover`;

const PANEL_CLASS =
  "z-[var(--z-popover)] flex w-[var(--size-popover-w)] flex-col gap-2 rounded-[var(--radius-card)] bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10";

const CLEAR_CLASS =
  "self-start rounded-[var(--radius-control)] px-1 text-[length:var(--text-control)] font-semibold text-content-accent underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [@media(hover:hover)]:hover:underline";

export function TreemapHeader({
  universe,
  onUniverseChange,
  companies,
  size,
  onSizeChange,
  metric,
  onMetricChange,
  snapshotsOnly = false,
  status,
}: TreemapHeaderProps): ReactElement {
  // Las tres listas salen de las 1.286 filas del propio corte: recorrerlas es
  // más barato que las dos consultas extra que costaban antes.
  const options = useMemo(
    () => DIMENSIONS.map((dimension) => ({ dimension, items: optionsOf(dimension, companies ?? []) })),
    [companies],
  );
  const chosen = dimensionCount(universe);

  const metrics = snapshotsOnly
    ? METRIC_OPTIONS.filter((option) => option.value === "score")
    : METRIC_OPTIONS;

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <Select
          value={universe.list}
          onValueChange={(value) => onUniverseChange({ ...universe, list: value as UniverseList })}
        >
          <SelectTrigger size="sm" aria-label="Cartera" className={TRIGGER_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{LIST_LABELS.all}</SelectItem>
            {/* El universo entero y las dos listas del usuario son dos cosas. */}
            <SelectSeparator />
            <SelectItem value="portfolio">{LIST_LABELS.portfolio}</SelectItem>
            <SelectItem value="favorites">{LIST_LABELS.favorites}</SelectItem>
          </SelectContent>
        </Select>

        <Popover.Root>
          <Popover.Trigger className={FILTERS_CLASS}>
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            {chosen > 0 ? `Filtros · ${chosen}` : "Filtros"}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="start" sideOffset={4} className={PANEL_CLASS}>
              {options.map(({ dimension, items }) => (
                <div key={dimension.key} className="flex flex-col gap-1">
                  <span className="text-[length:var(--text-micro)] text-content-secondary">
                    {dimension.name}
                  </span>
                  <Select
                    value={universe[dimension.key]}
                    onValueChange={(value) =>
                      onUniverseChange({ ...universe, [dimension.key]: value })
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={dimension.name}
                      className={`${TRIGGER_CLASS} w-full`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>{dimension.all}</SelectItem>
                      {items.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {chosen > 0 ? (
                <button
                  type="button"
                  className={CLEAR_CLASS}
                  onClick={() => onUniverseChange({ ...UNIVERSE_ALL, list: universe.list })}
                >
                  Quitar los filtros
                </button>
              ) : null}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Select value={size} onValueChange={(value) => onSizeChange(value as SizeBy)}>
          <SelectTrigger size="sm" aria-label="Tamaño" className={TRIGGER_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIZE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={metric} onValueChange={(value) => onMetricChange(value as Metric)}>
          <SelectTrigger size="sm" aria-label="Color" className={TRIGGER_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {metrics.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {status}
    </div>
  );
}
