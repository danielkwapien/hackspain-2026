/**
 * Treemap: área para el tamaño, color para el signo y la magnitud.
 *
 * El reparto lo hace `TreemapLayout` (puro y testeado aparte); aquí solo se
 * pinta. Tres reglas que no son decoración y vienen de `dataviz` (spec §6):
 *
 * - **Separación de 1 px en color de superficie** entre tiles. El escalón 1 de
 *   la rampa mide 1,16:1 contra la superficie, por debajo del suelo de 2:1: sin
 *   esa línea un tile de poca magnitud se confunde con el fondo. Va como
 *   `outline` hacia dentro, nunca encogiendo el rect (el layout llena el
 *   rectángulo exacto y eso no se toca).
 * - **Etiqueta por umbral de tamaño**, nunca texto recortado: el `id` solo
 *   entra a partir de 44x28 px y el valor a partir de 28x20 px. Por debajo, el
 *   tile no lleva texto y el dato sigue disponible en su nombre accesible.
 * - **Tabla visualmente oculta** con todos los valores: una escala continua sin
 *   vista de tabla no es legible para quien no distingue la rampa.
 */

import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import { fmtPct, fmtPoints, fmtSize } from "@/charts/format";
import { formatAmount } from "@/lib/format";
import { treemapToken, type TreemapStep } from "@/charts/palette";
import { layout, layoutGrouped, type TreemapRect } from "@/charts/TreemapLayout";

/** Un tile: tamaño para el área, `color_value` para el color. */
export type TreemapDatum = {
  id: string;
  size: number;
  color_value: number;
};

/** Grupo de tiles con título, como los sectores del treemap de Trade Republic. */
export type TreemapDatumGroup = {
  id: string;
  items: readonly TreemapDatum[];
};

/** Unidad del valor; el formato lo pone siempre `charts/format`. */
export type TreemapUnit = "pct" | "pts";

type TreemapBaseProps = {
  width: number;
  height: number;
  unit: TreemapUnit;
  /** Resumen del gráfico, también usado como título de la tabla oculta. */
  label: string;
  /**
   * Moneda del tamaño, si el tamaño es dinero. Sin moneda el tamaño sale como
   * cifra pelada: inventar un `EUR` sobre un recuento seria una cifra falsa.
   */
  currency?: string;
  /** Alto de la banda de título de cada grupo. */
  headerHeight?: number;
  onSelect?: (item: TreemapDatum) => void;
  onHover?: (item: TreemapDatum) => void;
};

/** O una lista plana de items, o grupos con título; nunca las dos cosas. */
export type TreemapProps = TreemapBaseProps &
  (
    | { items: readonly TreemapDatum[]; groups?: undefined }
    | { groups: readonly TreemapDatumGroup[]; items?: undefined }
  );

/** Alto por defecto de la banda de título de un grupo. */
const HEADER_HEIGHT = 16;

/** Separación entre tiles, en color de superficie. */
const TILE_GAP = 1;

/** A partir de aquí cabe el `id` del tile. */
const ID_MIN_WIDTH = 44;
const ID_MIN_HEIGHT = 28;

/** A partir de aquí cabe solo el valor. */
const VALUE_MIN_WIDTH = 28;
const VALUE_MIN_HEIGHT = 20;

type PlacedTile = {
  item: TreemapDatum;
  rect: TreemapRect;
  groupId: string | null;
};

/**
 * Escalón de intensidad por cuartiles sobre el máximo absoluto de la vista.
 * Sin máximo que comparar, todo va al escalón más tenue.
 */
export function intensityStep(absValue: number, maxAbs: number): TreemapStep {
  if (!Number.isFinite(maxAbs) || maxAbs <= 0 || !Number.isFinite(absValue)) return 1;
  const share = Math.abs(absValue) / maxAbs;
  if (share <= 0.25) return 1;
  if (share <= 0.5) return 2;
  if (share <= 0.75) return 3;
  return 4;
}

/** El formato del valor no se escribe aquí: sale de `charts/format`. */
function formatValue(value: number, unit: TreemapUnit): string {
  return unit === "pct" ? fmtPct(value) : fmtPoints(value);
}

/** Clave única de un tile: dos grupos pueden repetir el `id` de un item. */
function tileKey(groupId: string | null, id: string): string {
  return groupId === null ? id : `${groupId}\u0000${id}`;
}

/** Mismo orden que el layout: tamaño descendente, empates por `id`. */
function byDescendingSize(a: PlacedTile, b: PlacedTile): number {
  const delta = b.item.size - a.item.size;
  if (delta !== 0) return delta;
  return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
}

export function Treemap({
  width,
  height,
  unit,
  label,
  currency,
  headerHeight = HEADER_HEIGHT,
  items,
  groups,
  onSelect,
  onHover,
}: TreemapProps) {
  const { tiles, bands } = useMemo(() => {
    if (!groups) {
      const source = items ?? [];
      const byId = new Map(source.map((item) => [item.id, item]));
      const placed: PlacedTile[] = [];
      for (const rect of layout(source, { width, height })) {
        const item = byId.get(rect.id);
        if (item) placed.push({ item, rect, groupId: null });
      }
      return { tiles: placed.sort(byDescendingSize), bands: [] as TreemapRect[] };
    }

    const byKey = new Map(
      groups.flatMap((group) =>
        group.items.map((item) => [tileKey(group.id, item.id), item] as const),
      ),
    );
    const result = layoutGrouped(groups, { width, height, headerHeight });
    const placed: PlacedTile[] = [];
    for (const rect of result.items) {
      const item = byKey.get(tileKey(rect.groupId, rect.id));
      if (item) placed.push({ item, rect, groupId: rect.groupId });
    }
    return { tiles: placed.sort(byDescendingSize), bands: result.groups };
  }, [groups, items, width, height, headerHeight]);

  const maxAbs = tiles.reduce((max, tile) => Math.max(max, Math.abs(tile.item.color_value)), 0);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, item: TreemapDatum): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect?.(item);
  }

  return (
    <div className="relative" style={{ width, height }} role="group" aria-label={label}>
      {bands.map((band) => (
        <div
          key={band.id}
          className="absolute flex items-center px-1"
          style={{
            left: band.x,
            top: band.y,
            width: band.width,
            height: Math.min(headerHeight, band.height),
            color: "var(--content-secondary)",
            fontSize: "var(--text-micro)",
          }}
        >
          {band.id}
        </div>
      ))}

      {tiles.map(({ item, rect, groupId }) => {
        const value = formatValue(item.color_value, unit);
        const showId = rect.width >= ID_MIN_WIDTH && rect.height >= ID_MIN_HEIGHT;
        const showValue =
          showId || (rect.width >= VALUE_MIN_WIDTH && rect.height >= VALUE_MIN_HEIGHT);

        return (
          <div
            key={tileKey(groupId, item.id)}
            role="button"
            tabIndex={0}
            aria-label={`${item.id}, ${value}`}
            className="absolute flex flex-col justify-end gap-0.5 px-1 pb-0.5 text-left"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundColor: treemapToken(
                item.color_value >= 0 ? "pos" : "neg",
                intensityStep(item.color_value, maxAbs),
              ),
              // Hacia dentro: el rect no se encoge, el layout sigue exacto.
              outline: `${TILE_GAP}px solid var(--bg)`,
              outlineOffset: `-${TILE_GAP}px`,
              color: "var(--content-primary)",
              fontSize: "var(--text-micro)",
            }}
            onClick={() => onSelect?.(item)}
            onKeyDown={(event) => handleKeyDown(event, item)}
            onMouseEnter={() => onHover?.(item)}
            onFocus={() => onHover?.(item)}
          >
            {showId ? <span>{item.id}</span> : null}
            {showValue ? <span className="tabular-nums">{value}</span> : null}
          </div>
        );
      })}

      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Bloque</th>
            <th scope="col">Tamaño</th>
            <th scope="col">Valor</th>
          </tr>
        </thead>
        <tbody>
          {tiles.map(({ item, groupId }) => (
            <tr key={tileKey(groupId, item.id)}>
              <th scope="row">{item.id}</th>
              <td>{currency ? fmtSize(item.size, currency) : formatAmount(item.size)}</td>
              <td>{formatValue(item.color_value, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
