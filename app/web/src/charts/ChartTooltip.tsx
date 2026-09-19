/**
 * Tooltip único de todas las gráficas.
 *
 * Un tooltip, todas las series: una fila por serie, con la clave de serie como
 * trazo corto (nunca una caja rellena) y el valor por delante de la etiqueta.
 * El posicionamiento es propio y mínimo —anclaje a izquierda o a derecha según
 * la X— porque no hay ninguna librería de posicionamiento en el proyecto.
 */

import { fmtMonth } from "@/charts/format";

/** Una serie dentro del tooltip. El valor llega ya formateado con su unidad. */
export type ChartTooltipRow = {
  label: string;
  value: string;
  color?: string;
};

export type ChartTooltipProps = {
  /** Mes en `YYYY-MM`; la cabecera lo formatea a `MM/YYYY`. */
  month: string;
  rows: ChartTooltipRow[];
  /** Posición en el eje de tiempo, en porcentaje del ancho (0..100). */
  x: number;
  /** Único lado disponible hoy: el tooltip cuelga por encima de su ancla. */
  side?: "top";
};

/** A partir de aquí el tooltip se saldría por la derecha y vuelca su anclaje. */
const FLIP_AT = 80;
/** Por debajo de aquí no se centra: se queda pegado a su X. */
const CENTER_FROM = 20;

export function ChartTooltip({ month, rows, x, side = "top" }: ChartTooltipProps) {
  const flipped = x > FLIP_AT;
  const centered = !flipped && x >= CENTER_FROM;

  return (
    <div
      role="tooltip"
      data-slot="chart-tooltip"
      data-side={side}
      style={{
        position: "absolute",
        bottom: side === "top" ? "100%" : undefined,
        marginBottom: "4px",
        ...(flipped ? { right: `calc(100% - ${x}%)` } : { left: `${x}%` }),
        ...(centered ? { transform: "translateX(-50%)" } : null),
        backgroundColor: "var(--surface-tooltip)",
        borderRadius: "var(--radius-control)",
        padding: "8px",
        fontSize: "var(--text-control)",
        lineHeight: 1.3,
        whiteSpace: "nowrap",
        zIndex: "var(--z-tooltip)",
        // El tooltip vive sobre la superficie que escucha el puntero: no puede
        // robarle eventos ni parpadear al pasar por debajo del cursor.
        pointerEvents: "none",
      }}
    >
      <div style={{ color: "var(--content-secondary)", fontSize: "var(--text-micro)" }}>
        {fmtMonth(month)}
      </div>

      {rows.map((row, index) => (
        // Los nombres de serie vienen de datos: entran como hijos de React, que
        // ya escapan. Nunca `dangerouslySetInnerHTML`.
        <div
          key={`${row.label}-${index}`}
          data-slot="chart-tooltip-row"
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          <span
            data-slot="chart-tooltip-key"
            style={{
              width: "8px",
              height: "2px",
              flex: "none",
              backgroundColor: row.color ?? "var(--chart-1)",
            }}
          />
          <span className="num" style={{ color: "var(--content-primary)", fontWeight: 600 }}>
            {row.value}
          </span>
          <span style={{ color: "var(--content-secondary)", fontSize: "var(--text-micro)" }}>
            {row.label}
          </span>
        </div>
      ))}
    </div>
  );
}
