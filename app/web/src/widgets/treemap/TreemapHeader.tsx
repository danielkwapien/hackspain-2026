/**
 * Cabecera del Mapa: universo · tamaño · color, los tres desplegables del
 * heatmap de Trade Republic (*Nasdaq 100* · *Capitalización bursátil* ·
 * *Variación %*), que son exactamente las tres preguntas de un mapa de calor:
 * qué entra, de qué es el área y de qué es el color.
 *
 * Sustituyen a dos `Segmented`, uno de los cuales era un control muerto: la
 * entidad del mapa es la EMPRESA y el universo era el mismo con Grupo, País o
 * ERP, así que cambiar de agrupación no movía una sola ficha, solo el recuento
 * del subtítulo. Ahora elegir un país o un ERP concreto sí filtra el universo,
 * y de paso fija `group_by` a esa dimensión, que es lo que hace que la API
 * mande esos buckets.
 *
 * Tres decisiones:
 *
 * - **El universo es UN solo desplegable con secciones**, no tres controles.
 *   «Todas», «Mi cartera» y «Favoritos» son listas del cliente; «País» y «ERP»
 *   son dimensiones del corte. Poner las cinco cosas en el mismo sitio es lo
 *   que hace TR y es lo que permite responder «¿y solo mis empresas?» sin
 *   aprender dónde vive cada filtro.
 * - **Las listas de países y de ERP se piden al abrir**, no al montar: son dos
 *   consultas extra al mismo endpoint y el 90 % de las sesiones no las abre.
 *   Cacheadas con `staleTime: Infinity`, porque el censo de buckets de un corte
 *   no cambia mientras se mira.
 * - **La cartera y los favoritos NO se le piden a la API**: el payload ya trae
 *   todas las empresas y la watchlist vive en el cliente (`dashboard/watchlist`),
 *   así que el filtro es local y no hay ni una petición nueva.
 *
 * El «(EUR)» de la etiqueta de tamaño no es decoración: el dataset trae 39
 * monedas y no hay tabla de cambio, así que el pendiente suma SOLO facturas en
 * euros. Quien lee la cifra tiene que saberlo sin preguntar.
 */

import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtSizeShort } from "@/charts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PORTFOLIO } from "@/dashboard/watchlist";
import type { TreemapResponse } from "@/lib/api-v2";
import { getTreemap } from "@/lib/api-v2";
import { formatCount } from "@/lib/format";
import { treemapKey } from "@/lib/query-keys";

type GroupBy = TreemapResponse["group_by"];
type Metric = TreemapResponse["metric"];

/** Dimensiones del corte que además filtran el universo. */
type Dimension = Extract<GroupBy, "country" | "erp">;

/** Magnitud de la que sale el área de la ficha, entre las que el motor emite hoy. */
export type SizeBy = Extract<
  TreemapResponse["size_by"],
  "pending_eur" | "op_in_12m_eur" | "n_invoices" | "n_transactions"
>;

/** Bucket de la API para las empresas sin país o sin ERP conocidos. */
const UNKNOWN_BUCKET = "unknown";
const UNKNOWN_LABEL = "Sin dato";

/** Lo que se lee de un bucket: `unknown` es un hueco de datos, no un nombre. */
export function bucketLabel(key: string, label: string): string {
  return key === UNKNOWN_BUCKET ? UNKNOWN_LABEL : label;
}

/* ------------------------------------------------------------------ */
/* Universo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Universo elegido, como valor de `Select` (una cadena): las tres listas del
 * cliente van sueltas y un bucket va `dimensión:clave` (`country:ES`).
 */
export type UniverseValue = string;

export const UNIVERSE_ALL: UniverseValue = "all";
export const UNIVERSE_PORTFOLIO: UniverseValue = "portfolio";
export const UNIVERSE_FAVORITES: UniverseValue = "favorites";

const BUCKET_SEPARATOR = ":";

/** Valor de un bucket concreto del corte. */
export function bucketUniverse(dimension: Dimension, key: string): UniverseValue {
  return `${dimension}${BUCKET_SEPARATOR}${key}`;
}

/**
 * Agrupación que hay que pedirle a la API para ese universo: la dimensión del
 * bucket cuando se elige uno, y el grupo —el corte por defecto— en lo demás,
 * porque el bucket sigue siendo lo que se lee al pasar el ratón por una ficha.
 */
export function universeGroupBy(universe: UniverseValue): GroupBy {
  const dimension = universe.slice(0, universe.indexOf(BUCKET_SEPARATOR));
  return dimension === "country" || dimension === "erp" ? dimension : "group";
}

/** Empresa tal como la ve el filtro: su id y la clave de su bucket en el corte. */
export type UniverseEntity = { id: string; bucketKey: string };

const PORTFOLIO_IDS: ReadonlySet<string> = new Set(PORTFOLIO.map((position) => position.id));

/**
 * ¿Entra esta empresa en el universo elegido? Cartera y favoritos se resuelven
 * contra el cliente; un bucket, contra la clave que ya trae el payload. En
 * ningún caso hay que pedirle nada nuevo a la API.
 */
export function inUniverse(
  entity: UniverseEntity,
  universe: UniverseValue,
  favorites: readonly string[],
): boolean {
  if (universe === UNIVERSE_ALL) return true;
  if (universe === UNIVERSE_PORTFOLIO) return PORTFOLIO_IDS.has(entity.id);
  if (universe === UNIVERSE_FAVORITES) return favorites.includes(entity.id);
  const separator = universe.indexOf(BUCKET_SEPARATOR);
  return separator > 0 && entity.bucketKey === universe.slice(separator + 1);
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
  size: SizeBy;
  onSizeChange: (value: SizeBy) => void;
  metric: Metric;
  onMetricChange: (value: Metric) => void;
  /** Corte sin historia: el color solo puede ser el score. */
  snapshotsOnly?: boolean;
  /** Línea de estado del widget: vive en la cabecera, debajo de los tres. */
  status?: ReactNode;
};

/**
 * Los tres caben en 432 px porque la fila envuelve: a poco ancho el de color
 * baja de línea entero, nunca truncado. Un desplegable con la etiqueta cortada
 * («Pendiente de cob…») no dice qué está midiendo el mapa, que es justo lo
 * único que tenía que decir.
 */
const TRIGGER_CLASS =
  "max-w-full shrink-0 gap-1 rounded-[var(--radius-control)] border-0 bg-surface-glass px-2 text-[length:var(--text-control)] font-semibold text-content-primary shadow-[inset_0_0_0_1px_var(--border-glass)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 [@media(hover:hover)]:hover:bg-surface-glass-hover";

export function TreemapHeader({
  universe,
  onUniverseChange,
  size,
  onSizeChange,
  metric,
  onMetricChange,
  snapshotsOnly = false,
  status,
}: TreemapHeaderProps): ReactElement {
  // Las dos listas de buckets solo se piden cuando el usuario abre el
  // desplegable; una vez traídas se quedan (`staleTime: Infinity`).
  const [open, setOpen] = useState(false);
  const countries = useBuckets("country", open);
  const erps = useBuckets("erp", open);

  const metrics = snapshotsOnly
    ? METRIC_OPTIONS.filter((option) => option.value === "score")
    : METRIC_OPTIONS;

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <Select value={universe} onValueChange={onUniverseChange} onOpenChange={setOpen}>
          <SelectTrigger size="sm" aria-label="Universo" className={TRIGGER_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNIVERSE_ALL}>Todas las empresas</SelectItem>
            {/* El universo entero, las dos listas del usuario y las dos
                dimensiones del corte son cuatro bloques distintos. */}
            <SelectSeparator />
            <SelectItem value={UNIVERSE_PORTFOLIO}>Mi cartera</SelectItem>
            <SelectItem value={UNIVERSE_FAVORITES}>Favoritos</SelectItem>
            {countries.length > 0 ? (
              <SelectGroup>
                <SelectLabel>País</SelectLabel>
                {countries.map((bucket) => (
                  <SelectItem key={bucket.key} value={bucketUniverse("country", bucket.key)}>
                    {bucketLabel(bucket.key, bucket.label)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {erps.length > 0 ? (
              <SelectGroup>
                <SelectLabel>ERP</SelectLabel>
                {erps.map((bucket) => (
                  <SelectItem key={bucket.key} value={bucketUniverse("erp", bucket.key)}>
                    {bucketLabel(bucket.key, bucket.label)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>

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

/** Buckets de una dimensión, pedidos solo cuando hace falta enseñarlos. */
function useBuckets(dimension: Dimension, enabled: boolean): readonly { key: string; label: string }[] {
  const query = useQuery({
    queryKey: treemapKey({ groupBy: dimension }),
    queryFn: () => getTreemap({ groupBy: dimension }),
    enabled,
    staleTime: Infinity,
  });
  return query.data?.groups ?? [];
}
