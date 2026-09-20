/**
 * La carcasa que comparten las tres tablas de evidencia de W2.3 (XR-038):
 * «Dónde está la caja», «Posiciones de financiación» y «Últimos movimientos».
 *
 * Es la misma forma que `Counterparties` puso bajo Pago y Cobros —título,
 * cifras de cabecera, tabla densa y una línea de pie que dice qué cubre— y
 * existe aquí para que las cuatro se lean igual: tres copias del mismo
 * `<section>` se habrían separado al primer retoque.
 */

import type { ReactElement, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Cabeceras de columna: metadato, como en la tabla de contrapartes. */
export const TH_CLASS = "py-1 text-left font-normal";
export const TH_NUM_CLASS = "py-1 text-right font-normal";

/** Celdas: `--text-control` es el escalón de «celdas densas» de la escala (§1). */
export const TD_CLASS = "py-1 text-left";
export const TD_NUM_CLASS = "num py-1 text-right";

export function EvidenceBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <EvidenceHeader title={title} />
      {children}
    </section>
  );
}

export function EvidenceHeader({ title }: { title: string }): ReactElement {
  return (
    <h3 className="text-[length:var(--text-control)] font-semibold text-content-primary">
      {title}
    </h3>
  );
}

/** Tabla densa: cabecera a `--text-micro`, cuerpo a `--text-control`. */
export function EvidenceTable({ children }: { children: ReactNode }): ReactElement {
  return (
    <table className="w-full border-collapse text-[length:var(--text-control)]">{children}</table>
  );
}

/** Fila de cifras de cabecera (solo Liquidez las tiene). */
export function EvidenceFigure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): ReactElement {
  return (
    <div className="flex flex-col justify-center gap-1 py-1">
      <dt className="text-[length:var(--text-micro)] text-content-secondary">{label}</dt>
      <dd
        className="num text-[length:var(--text-figure)] font-semibold text-content-primary"
        title={hint}
      >
        {value}
      </dd>
    </div>
  );
}

/** Pie: qué cubre la tabla. Dicho, no supuesto. */
export function EvidenceNote({ children }: { children: ReactNode }): ReactElement {
  return <p className="text-[length:var(--text-micro)] text-content-tertiary">{children}</p>;
}

export function EvidenceSkeleton({
  title,
  figures = 0,
  rows = 4,
}: {
  title: string;
  figures?: number;
  rows?: number;
}): ReactElement {
  return (
    <section aria-label={title} className="flex flex-col gap-2" aria-busy="true">
      <EvidenceHeader title={title} />
      {figures > 0 ? (
        <div className="grid grid-cols-2 gap-x-4">
          {Array.from({ length: figures }, (_, index) => (
            <Skeleton key={index} className="h-8 w-24" />
          ))}
        </div>
      ) : null}
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-4 w-full" />
      ))}
    </section>
  );
}
