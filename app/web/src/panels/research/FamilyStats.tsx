/**
 * Señales de la familia activa en Investigación: una celda por señal, dos columnas.
 *
 * Cada celda dice el nombre, el valor legible (`value_fmt`, o «No aplica» si la señal
 * no aplica a la empresa: nunca un 0 de relleno), su contribución en puntos, la nota
 * `u` como barra y el Δ de un mes. Con `activeMonth` la celda lee el punto de
 * `series_24m` de ese mes (`signalAt`); sin él, las cifras del corte.
 */

import type { ReactElement } from "react";
import { PillarBar, fmtSignedPoints } from "@/charts";
import { Skeleton } from "@/components/ui/skeleton";
import type { SignalV2 } from "@/lib/api-v2";
import { signalAt } from "@/panels/research/hover";

/** Nombre corto de cada familia; vive en `lib/definitions` y aquí solo se re-exporta. */
export { FAMILY_LABEL } from "@/lib/definitions";

/** Celdas del skeleton mientras llegan las señales. */
const SKELETON_CELLS = 6;

/** Etiqueta de `quality_flag`; lo que no está aquí se enseña tal cual llega. */
const QUALITY_LABEL: Record<string, string> = {
  warmup: "calentamiento",
};

const GRID_CLASS = "grid grid-cols-2 gap-x-4";

/* Hover solo con puntero fino; la escala vuelve en `--duration-fast`. */
const CELL_CLASS = [
  "flex flex-col justify-center gap-1 py-1",
  "transition-transform duration-[var(--duration-fast)] motion-reduce:transition-none",
  "[@media(hover:hover)]:hover:scale-[1.02]",
].join(" ");

export function FamilyStats({
  signals,
  activeMonth,
}: {
  signals: readonly SignalV2[];
  activeMonth: string | null;
}): ReactElement {
  return (
    <dl className={GRID_CLASS}>
      {signals.map((signal) => {
        const figures = signalAt(signal, activeMonth);
        const contribution = fmtSignedPoints(figures.contribution);
        const delta = fmtSignedPoints(figures.delta_vs_prev);
        const quality = signal.quality_flag
          ? (QUALITY_LABEL[signal.quality_flag] ?? signal.quality_flag)
          : null;
        const u = figures.u_smooth ?? figures.u;

        return (
          <div
            key={signal.signal_id}
            className={CELL_CLASS}
            style={{ minHeight: "var(--size-stat-row)" }}
          >
            <dt
              className="flex items-baseline gap-1 text-[length:var(--text-micro)] text-content-secondary"
            >
              <span className="truncate" title={signal.name}>
                {signal.name}
              </span>
              {quality ? (
                <span className="shrink-0 rounded-[var(--radius-control)] bg-surface-glass px-1 text-content-tertiary">
                  {quality}
                </span>
              ) : null}
            </dt>
            <dd className="flex items-baseline justify-between gap-2">
              {figures.is_available ? (
                <span
                  className="truncate text-[length:var(--text-body)] text-content-primary"
                  title={figures.value_fmt ?? undefined}
                >
                  {figures.value_fmt}
                </span>
              ) : (
                <span className="text-[length:var(--text-body)] text-content-secondary">
                  No aplica
                </span>
              )}
              <span
                className="num shrink-0 text-[length:var(--text-control)]"
                style={{ color: contribution.tone }}
              >
                {contribution.text}
              </span>
            </dd>
            {figures.is_available && u !== null ? (
              <dd className="flex items-center gap-2">
                <PillarBar value={u} label={`Nota de ${signal.name}`} variant="plain" />
                <span
                  className="num shrink-0 text-[length:var(--text-micro)] whitespace-nowrap"
                  style={{ color: delta.tone }}
                >
                  {`Δ 1 m ${delta.text}`}
                </span>
              </dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

/** Seis celdas con la forma de la retícula mientras se piden las señales. */
export function FamilyStatsSkeleton(): ReactElement {
  return (
    <div className={GRID_CLASS} aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando señales</span>
      {Array.from({ length: SKELETON_CELLS }, (_, index) => (
        <div
          key={index}
          className="flex flex-col justify-center gap-2"
          style={{ minHeight: "var(--size-stat-row)" }}
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
