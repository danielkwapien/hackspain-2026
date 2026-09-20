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

/**
 * Separación entre columnas, y solo entre ellas.
 *
 * Con las cuatro clases a `py-1` pelado, una columna numérica alineada a la
 * derecha pegada a una de texto alineada a la izquierda se tocaban a **0 px**:
 * medido en «Últimos movimientos» a 1440×900, el texto de Importe acababa en
 * el mismo pixel en el que empezaba el de Estado, y la pantalla leía
 * `ImporteEstado` en la cabecera y `-3.055,77Contabilizado` en cada fila.
 * `Counterparties` se salva porque todas sus columnas menos la primera van a
 * la derecha, no porque esté bien sin padding.
 *
 * Dos decisiones de ancho, las dos medidas y no estimadas:
 *
 * - **Solo a la izquierda y nunca en los bordes**: el widget vive a 8 de 24
 *   columnas y de las tres tablas la más ancha, «Últimos movimientos», solo
 *   tenía 76 px de holgura sobre su ancho natural. Un `px-*` simétrico gastaría
 *   la mitad de ese margen en los extremos, donde no hay nada que separar.
 * - **8 px y no 12**: con 12 px la tabla de movimientos parte la columna de
 *   banco·producto en dos líneas a 1280×800. Con 8 px hay separación legible a
 *   1440×900 con 44 px de holgura de sobra y ninguna celda partida.
 */
const CELL_GAP = "pl-2 first:pl-0";

/** Cabeceras de columna: metadato, como en la tabla de contrapartes. */
export const TH_CLASS = `${CELL_GAP} py-1 text-left font-normal`;
export const TH_NUM_CLASS = `${CELL_GAP} py-1 text-right font-normal`;

/** Celdas: `--text-control` es el escalón de «celdas densas» de la escala (§1). */
export const TD_CLASS = `${CELL_GAP} py-1 text-left`;
export const TD_NUM_CLASS = `num ${CELL_GAP} py-1 text-right`;

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
