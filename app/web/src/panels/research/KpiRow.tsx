/**
 * Una fila de KPIs bajo la gráfica: un `dl` a tantas columnas como celdas (cinco
 * pilares, cinco o seis señales de una familia, cuatro cifras de grupo). Cada celda
 * es título corto + ⓘ con la definición, el valor en `.num` y, en micro, cuánto ha
 * cambiado en el rango activo («+2,1 pts», «−60,0 %»). El rango no se repite en cada
 * celda: su `Segmented` está justo encima de la fila (XR-037). Sin dato: «No aplica»
 * y sin variación; nunca un 0 de relleno.
 *
 * Las funciones `pillarCells` y `signalCells` construyen las celdas a partir de la
 * ficha y de `/signals`; `KpiRow` solo pinta.
 *
 * A cinco columnas no cabe la frase entera de `value_fmt` («48 dias de colchon de
 * caja»): la celda enseña la cifra compacta (`compactFigure`: «48 d») y deja la frase
 * en `title` y para el lector de pantalla (`CompactValue`).
 *
 * Cada celda vive en una tarjeta glass (XR-037, E15): el mismo envoltorio que la
 * fila de tesorería, para que las dos filas de bajo la gráfica se lean como
 * hermanas. Y `leading` abre un hueco delante del `map` para la columna
 * «Conclusión», cuyo valor es una frase y no una cifra.
 */

import type { CSSProperties, ReactElement, ReactNode } from "react";
import { fmtPct, fmtPoints, fmtSignedPoints } from "@/charts";
import type { DeltaTone } from "@/charts";
import { cn } from "cn";
import { InfoTip } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import type { Pillar, Pillars, SignalV2 } from "@/lib/api-v2";
import type { SignalId } from "@/lib/definitions";
import {
  FAMILY_LABEL,
  PILLAR_DEFINITION,
  SHORT_LABEL,
  SIGNAL_DEFINITION,
  STRENGTH_DEFINITION,
  STRENGTH_LABEL,
  humanizeCode,
} from "@/lib/definitions";
import { EMPTY_VALUE } from "@/lib/format";
import { signalAt } from "@/panels/research/hover";
import { rangeChangePct } from "@/panels/research/series";

export type KpiChange = { text: string; tone: DeltaTone };

export type KpiCell = {
  key: string;
  label: string;
  /** Con definición la celda lleva ⓘ; sin ella (cifras de grupo), solo el título. */
  definition?: string;
  /** `null` = «No aplica». */
  value: string | null;
  /** Cifra compacta de una señal («48 d»); sin ella la celda enseña `value` tal cual. */
  figure?: string;
  /** El valor es un nombre y no una cifra (la filial más débil): no sube a 20 px. */
  prose?: boolean;
  change?: KpiChange | null;
};

/**
 * Primera cifra de la frase de `value_fmt` con su signo, decimales y, si la sigue,
 * su unidad: «48 dias de colchon de caja» → «48 d», «caja minima 1,78 veces las
 * salidas» → «1,78», «cobros +55 % frente a 12 meses» → «+55 %». La unidad sale de la
 * frase y no del catálogo porque `ratio` allí es a veces «veces» y a veces «%».
 * Sin cifra en la frase, la frase entera.
 */
const FIGURE_PATTERN = /([+\u2212-]?\d[\d.]*(?:,\d+)?)\s*(%|d[ií]as?|meses|puntos|pts)?/u;

const UNIT_SUFFIX: Record<string, string> = {
  "%": " %",
  dia: " d",
  dias: " d",
  día: " d",
  días: " d",
  meses: " m",
  puntos: " pts",
  pts: " pts",
};

export function compactFigure(valueFmt: string): string {
  const match = FIGURE_PATTERN.exec(valueFmt);
  if (!match) return valueFmt;
  const [, figure, unit] = match;
  return `${figure}${unit ? (UNIT_SUFFIX[unit] ?? "") : ""}`;
}

/** Cifra compacta a la vista; la frase completa en `title` y para el lector de pantalla. */
export function CompactValue({
  full,
  figure,
  className,
  style,
}: {
  full: string;
  figure: string;
  className?: string;
  /** Tono de la cifra cuando lo decide el dato (tesorería): siempre un token. */
  style?: CSSProperties;
}): ReactElement {
  return (
    <span className={cn("num truncate", className)} style={style} title={full}>
      {figure === full ? (
        full
      ) : (
        <>
          <span aria-hidden="true">{figure}</span>
          <span className="sr-only">{full}</span>
        </>
      )}
    </span>
  );
}

const COLUMNS_CLASS: Record<number, string> = {
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

const NEUTRAL: DeltaTone = "var(--content-secondary)";

/** Tarjeta glass de la celda: el mismo envoltorio que la fila de tesorería (E13). */
export const CELL_CLASS =
  "flex min-w-0 flex-col justify-center gap-0.5 rounded-[var(--radius-card)] bg-surface-glass p-2 shadow-[inset_0_0_0_1px_var(--border-glass)]";
/**
 * El término va blanco, pero a 12 px y peso 400 (XR-038, W1.4): en gris no se
 * leía, y ponerlo blanco con el mismo cuerpo y peso que el valor borraría la
 * jerarquía entre los dos. Jerarquizan el tamaño y el peso, no el color.
 */
const TERM_CLASS =
  "flex items-center gap-1 text-[length:var(--text-control)] font-normal text-content-primary";
/**
 * La cifra del pilar se queda en `--text-figure` (20 px), no sube a 30 como la
 * de Tesorería (W1.6). Medido en la ficha a 1440 x 900: la celda da 105 px y
 * «41,8 pts» a 30 px pide 118, así que las cinco familias se leerían «41,8 p…».
 * Y subirlas empeoraría justo lo que W1.3 viene a arreglar: el contraste entre
 * la columna «Conclusión», que es texto a 13 px, y las cinco cifras de al lado.
 */
const FIGURE_CLASS = "text-[length:var(--text-figure)] font-semibold";

function columnsClass(count: number): string {
  return COLUMNS_CLASS[count] ?? "grid-cols-5";
}

/** «—» a secas cuando no hay base: sin cifra, el color no significa nada. */
function change(text: string, tone: DeltaTone): KpiChange {
  return { text, tone: text === EMPTY_VALUE ? NEUTRAL : tone };
}

/** Cinco celdas L…A en `100·P_k` pts; peso 0 o valor nulo → «No aplica». */
export function pillarCells({
  pillars,
  firstPillars,
}: {
  /** `null` cuando la publicación no trae pilares para ese mes. */
  pillars: Pillars | null;
  /** Pilares del primer mes visible; `null` si el rango no tiene primer mes. */
  firstPillars: Pillars | null;
}): KpiCell[] {
  return (Object.keys(FAMILY_LABEL) as Pillar[]).map((pillar) => {
    const definition = PILLAR_DEFINITION[pillar];
    const label = FAMILY_LABEL[pillar];
    if (pillars === null) {
      return { key: pillar, label, definition, value: null, change: null };
    }
    const { value, weight } = pillars[pillar];
    const available = weight > 0 && value !== null;
    const first = firstPillars?.[pillar].value ?? null;
    const delta = available && first !== null ? (value - first) * 100 : null;
    const points = fmtSignedPoints(delta);
    return {
      key: pillar,
      label,
      definition,
      value: available ? fmtPoints(value * 100) : null,
      change: available ? change(points.text, points.tone) : null,
    };
  });
}

function shortLabel(signal: SignalV2): string {
  return SHORT_LABEL[signal.signal_id as SignalId] ?? signal.name;
}

/** Una celda por señal de la familia: `value_fmt` del mes activo y % frente al primer visible. */
export function signalCells({
  signals,
  activeMonth,
  firstMonth,
}: {
  signals: readonly SignalV2[];
  activeMonth: string | null;
  firstMonth: string | null;
}): KpiCell[] {
  return signals.map((signal) => {
    const figures = signalAt(signal, activeMonth);
    // Sin el mes en la serie no hay base: `signalAt` caería al corte y daría un 0 % falso.
    const first = signal.series_24m.find((point) => point.month === firstMonth)?.value ?? null;
    const pct = figures.is_available ? rangeChangePct(first, figures.value) : null;
    const tone: DeltaTone =
      pct === null || pct === 0
        ? NEUTRAL
        : pct > 0
          ? "var(--content-positive)"
          : "var(--content-negative)";
    return {
      key: signal.signal_id,
      label: shortLabel(signal),
      definition: SIGNAL_DEFINITION[signal.signal_id as SignalId],
      value: figures.is_available ? figures.value_fmt : null,
      figure: figures.is_available && figures.value_fmt ? compactFigure(figures.value_fmt) : undefined,
      change: figures.is_available ? change(fmtPct(pct), tone) : null,
    };
  });
}

/**
 * Las fortalezas del mes como primera columna de la fila, bajo el título
 * «Conclusión» (XR-037, E15): son condiciones observables del motor
 * (`core/publication_rows.STRENGTH_FLAGS`), no dependen de la familia elegida y antes
 * vivían sueltas en la línea de contexto de la cabecera.
 *
 * XR-038 (W1.3) las saca de la cápsula glass: dentro iban a 11 px al lado de
 * cinco cifras a 30, o sea que la columna que se llama «Conclusión» era la que
 * menos se leía. Van sueltas, a `--text-body`, y la celda gana la ⓘ que ya
 * llevan las otras cinco: era la única de las seis sin ella.
 */
export function ConclusionCell({ flags }: { flags: readonly string[] }): ReactElement {
  const labels = flags.map((flag) => STRENGTH_LABEL[flag] ?? humanizeCode(flag));
  return (
    <div className={CELL_CLASS}>
      <dt className={TERM_CLASS}>
        <span className="truncate">Conclusión</span>
        <InfoTip title="Conclusión" definition={STRENGTH_DEFINITION} />
      </dt>
      <dd className="flex min-w-0 flex-col">
        {labels.length === 0 ? (
          <span className="text-[length:var(--text-body)] text-content-secondary">
            Sin señales destacadas
          </span>
        ) : (
          // Con varias, separadas por «·» en la misma celda y hasta dos líneas:
          // es una frase corta, no una lista de etiquetas.
          <span
            className="line-clamp-2 text-[length:var(--text-body)] text-pretty text-content-primary"
            title={labels.join(" · ")}
          >
            {labels.join(" · ")}
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * La misma conclusión cuando la empresa no tiene ninguna fortaleza, que es el caso
 * común: una línea a lo ancho en vez de una sexta columna vacía, para que la fila de
 * pilares vuelva a sus cinco columnas y no quede un hueco a su izquierda.
 */
export function ConclusionNote(): ReactElement {
  return (
    <p className="shrink-0 text-[length:var(--text-micro)] text-content-secondary">
      <span className="text-content-secondary">Conclusión</span>
      {": "}
      Sin señales destacadas
    </p>
  );
}

export function KpiRow({
  cells,
  leading = null,
}: {
  cells: readonly KpiCell[];
  /** Celda que se pinta antes del `map` y cuenta como columna («Conclusión»). */
  leading?: ReactNode;
}): ReactElement {
  return (
    <dl
      className={`grid shrink-0 gap-2 ${columnsClass(cells.length + (leading === null ? 0 : 1))}`}
      style={{ minHeight: "var(--size-stat-row)" }}
    >
      {leading}
      {cells.map((cell) => (
        <div key={cell.key} className={CELL_CLASS}>
          <dt className={TERM_CLASS}>
            <span className="truncate" title={cell.label}>
              {cell.label}
            </span>
            {cell.definition ? <InfoTip title={cell.label} definition={cell.definition} /> : null}
          </dt>
          {/* Espacio entre término y valor: el flex no lo pinta y el texto plano no pega «puntuadas12». */}{" "}
          <dd className="flex min-w-0 flex-col">
            {cell.value === null ? (
              // La ausencia no es una cifra: se queda en el cuerpo, no sube a 20 px.
              <span className="text-[length:var(--text-body)] text-content-secondary">
                No aplica
              </span>
            ) : (
              <CompactValue
                full={cell.value}
                figure={cell.figure ?? cell.value}
                className={cn(
                  cell.prose
                    ? "text-[length:var(--text-body)]"
                    : cn(FIGURE_CLASS, "leading-tight"),
                  "text-content-primary",
                )}
              />
            )}
            {cell.change ? (
              <span
                className="num truncate text-[length:var(--text-control)]"
                style={{ color: cell.change.tone }}
              >
                {cell.change.text}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Cinco celdas con la forma de la fila mientras llegan las señales. */
export function KpiRowSkeleton(): ReactElement {
  return (
    <div
      className={`grid shrink-0 gap-2 ${columnsClass(5)}`}
      style={{ minHeight: "var(--size-stat-row)" }}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando señales</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className={CELL_CLASS}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
