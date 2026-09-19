/**
 * Una fila de KPIs bajo la gráfica: un `dl` a tantas columnas como celdas (cinco
 * pilares, cinco o seis señales de una familia, cuatro cifras de grupo). Cada celda
 * es título corto + ⓘ con la definición, el valor en `.num` y, en micro, cuánto ha
 * cambiado en el rango activo («+2,1 pts · 1A», «−60,0 % · 1A»). Sin dato: «No aplica»
 * y sin variación; nunca un 0 de relleno.
 *
 * Las funciones `pillarCells` y `signalCells` construyen las celdas a partir de la
 * ficha y de `/signals`; `KpiRow` solo pinta.
 *
 * A cinco columnas no cabe la frase entera de `value_fmt` («48 dias de colchon de
 * caja»): la celda enseña la cifra compacta (`compactFigure`: «48 d») y deja la frase
 * en `title` y para el lector de pantalla (`CompactValue`).
 */

import type { ReactElement } from "react";
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
}: {
  full: string;
  figure: string;
  className?: string;
}): ReactElement {
  return (
    <span className={cn("num truncate", className)} title={full}>
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

const CELL_CLASS = "flex min-w-0 flex-col justify-center gap-0.5 py-1";
const TERM_CLASS =
  "flex items-center gap-1 text-[length:var(--text-micro)] text-content-secondary";

function columnsClass(count: number): string {
  return COLUMNS_CLASS[count] ?? "grid-cols-5";
}

/** Sufijo del rango solo cuando hay cifra: «—» a secas si no hay base. */
function withRange(text: string, tone: DeltaTone, range: string): KpiChange {
  return text === EMPTY_VALUE ? { text, tone: NEUTRAL } : { text: `${text} · ${range}`, tone };
}

/** Cinco celdas L…A en `100·P_k` pts; peso 0 o valor nulo → «No aplica». */
export function pillarCells({
  pillars,
  firstPillars,
  range,
}: {
  pillars: Pillars;
  /** Pilares del primer mes visible; `null` si el rango no tiene primer mes. */
  firstPillars: Pillars | null;
  range: string;
}): KpiCell[] {
  return (Object.keys(FAMILY_LABEL) as Pillar[]).map((pillar) => {
    const { value, weight } = pillars[pillar];
    const available = weight > 0 && value !== null;
    const first = firstPillars?.[pillar].value ?? null;
    const delta = available && first !== null ? (value - first) * 100 : null;
    const points = fmtSignedPoints(delta);
    return {
      key: pillar,
      label: FAMILY_LABEL[pillar],
      definition: PILLAR_DEFINITION[pillar],
      value: available ? fmtPoints(value * 100) : null,
      change: available ? withRange(points.text, points.tone, range) : null,
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
  range,
}: {
  signals: readonly SignalV2[];
  activeMonth: string | null;
  firstMonth: string | null;
  range: string;
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
      change: figures.is_available ? withRange(fmtPct(pct), tone, range) : null,
    };
  });
}

export function KpiRow({ cells }: { cells: readonly KpiCell[] }): ReactElement {
  return (
    <dl
      className={`grid shrink-0 gap-x-3 ${columnsClass(cells.length)}`}
      style={{ minHeight: "var(--size-stat-row)" }}
    >
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
              <span className="text-[length:var(--text-body)] text-content-secondary">
                No aplica
              </span>
            ) : (
              <CompactValue
                full={cell.value}
                figure={cell.figure ?? cell.value}
                className="text-[length:var(--text-body)] text-content-primary"
              />
            )}
            {cell.change ? (
              <span
                className="num truncate text-[length:var(--text-micro)]"
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
      className={`grid shrink-0 gap-x-3 ${columnsClass(5)}`}
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
