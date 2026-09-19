/**
 * Treemap: área para el tamaño, color para el signo y la magnitud.
 *
 * El reparto lo hace `TreemapLayout` (puro y testeado aparte) y la etiqueta la
 * decide `treemap-label` (también puro); aquí solo se pinta. Tres reglas que no
 * son decoración y vienen de `dataviz` (spec §6):
 *
 * - **Separación de 1 px en color de superficie** entre tiles. El escalón 1 de
 *   la rampa mide 1,16:1 contra la superficie, por debajo del suelo de 2:1: sin
 *   esa línea un tile de poca magnitud se confunde con el fondo. Va como
 *   `outline` hacia dentro, nunca encogiendo el rect (el layout llena el
 *   rectángulo exacto y eso no se toca).
 * - **Etiqueta por umbral de tamaño**, como el heatmap de Trade Republic: el
 *   nombre en negrita a 16/13/11 px según el área del tile, arriba a la
 *   izquierda, y el valor debajo. El nombre se corta con «…» al ancho del tile
 *   y por debajo de 1,3 cuerpos de alto el tile va sin texto: el dato sigue
 *   disponible en su nombre accesible. Nunca `overflow: hidden`. Nombre y valor
 *   van los dos en `--content-primary`: el texto coloreado no llega a AA sobre
 *   los tonos del semáforo (2,4:1), y la dirección ya la lleva el glifo.
 * - **Tabla visualmente oculta** con todos los valores: una escala continua sin
 *   vista de tabla no es legible para quien no distingue la rampa.
 *
 * El semáforo se mide contra `neutral` y no contra 0, porque hay métricas cuyo
 * punto de equilibrio no es el cero (el `score` se parte en 50: contra 0 saldría
 * toda la vista verde y el color no diría nada). Y la intensidad se normaliza
 * contra `scale`, la dispersión de TODA la vista, para que varias instancias
 * puestas una al lado de otra compartan un solo metro: si cada una midiera
 * contra su propio máximo, el mismo tono significaría cosas distintas en cada
 * columna. Sin ninguna de las dos, una instancia sola sigue midiéndose contra
 * el cero y contra su propia dispersión.
 */

import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import { fmtDelta, fmtPct, fmtPoints, fmtSize } from "@/charts/format";
import { formatAmount } from "@/lib/format";
import { treemapToken, type TreemapStep } from "@/charts/palette";
import { layout, layoutGrouped, type TreemapRect } from "@/charts/TreemapLayout";
import {
  TEXT_PADDING,
  showsLabel,
  textWidth,
  tileFontSize,
  truncateLabel,
  type TileFontSize,
} from "@/charts/treemap-label";

/** Un tile: tamaño para el área, `color_value` para el color, `name` para la etiqueta. */
export type TreemapDatum = {
  id: string;
  /** Nombre que se pinta y se lee; sin él, el `id`. */
  name?: string;
  size: number;
  color_value: number;
};

/** Grupo de tiles con título, como los sectores del treemap de Trade Republic. */
export type TreemapDatumGroup = {
  id: string;
  /** Título de la banda; sin él, el `id`. */
  label?: string;
  /** Δ consolidada del grupo en puntos; `null` = sin Δ, nunca 0. */
  delta?: number | null;
  items: readonly TreemapDatum[];
};

/**
 * Unidad del valor; el formato lo pone siempre `charts/format`. `delta` es un
 * Δ en puntos: glifo y tono por signo, y en el tile sin unidad.
 */
export type TreemapUnit = "pct" | "pts" | "delta";

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
  /** Valor que separa los dos lados del semáforo: 0 para un Δ, 50 para el score. */
  neutral?: number;
  /** Máximo |valor − neutral| de TODA la vista, para que varias instancias compartan escala. */
  scale?: number;
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

/** Cuerpo de la cabecera de grupo y de su Δ. */
const HEADER_FONT_SIZE = 11;

/** Separación entre el nombre del grupo y su Δ (`gap-1`), en px. */
const HEADER_GAP = 4;

/** Cuerpo del valor bajo el nombre: 13 bajo un nombre de 16, 11 en el resto. */
const VALUE_FONT_SIZE: Record<TileFontSize, TileFontSize> = { 16: 13, 13: 11, 11: 11 };

/** Cuerpo → token: los tamaños no se escriben en el componente. */
const FONT_SIZE_TOKEN: Record<TileFontSize, string> = {
  16: "var(--text-tile)",
  13: "var(--text-body)",
  11: "var(--text-micro)",
};

/** Sin Δ consolidada se dice, no se imputa 0. */
const NO_DELTA = "Sin Δ";

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
  if (unit === "pct") return fmtPct(value);
  if (unit === "delta") return fmtDelta(value).text;
  return fmtPoints(value);
}

/** Δ sin unidad, para tile y cabecera: `▲ +1,3`, con su tono. */
function shortDelta(value: number): { text: string; tone: string } {
  const delta = fmtDelta(value);
  return { text: delta.text.replace(/\spts$/u, ""), tone: delta.tone };
}

/**
 * Texto del valor visible del tile. Va SIEMPRE en `--content-primary`, como el
 * nombre y como hace Trade Republic: sobre el tono más fuerte del semáforo el
 * blanco mide 5,24:1 (verde) y 7,65:1 (rojo), mientras que el texto coloreado
 * de `fmtDelta().tone` se queda en 2,39:1 y 2,20:1 y no llega a AA. La
 * dirección del Δ no se pierde: la lleva el glifo (▲/▼), que es lo que exige el
 * contrato visual, no el color.
 */
function tileValue(value: number, unit: TreemapUnit): string {
  return unit === "delta" ? shortDelta(value).text : formatValue(value, unit);
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
  neutral = 0,
  scale,
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

  const groupById = new Map((groups ?? []).map((group) => [group.id, group]));
  // Sin `scale`, cada instancia se normaliza contra su propia dispersión; con
  // ella, todas las de la vista comparten el mismo metro.
  const ownMaxAbs = tiles.reduce(
    (max, tile) => Math.max(max, Math.abs(tile.item.color_value - neutral)),
    0,
  );
  const intensityScale = scale ?? ownMaxAbs;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, item: TreemapDatum): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect?.(item);
  }

  return (
    <div className="relative" style={{ width, height }} role="group" aria-label={label}>
      {bands.map((band) => {
        const group = groupById.get(band.id);
        const delta =
          group?.delta == null
            ? { text: NO_DELTA, tone: "var(--content-secondary)" }
            : shortDelta(group.delta);
        // El nombre manda: se corta al ancho útil y la Δ solo entra si aún cabe a su lado.
        const usableWidth = band.width - TEXT_PADDING;
        const title = truncateLabel(group?.label ?? band.id, usableWidth, HEADER_FONT_SIZE);
        const showDelta =
          textWidth(title, HEADER_FONT_SIZE) + HEADER_GAP + textWidth(delta.text, HEADER_FONT_SIZE) <=
          usableWidth;
        return (
          <div
            key={band.id}
            className="absolute flex items-center gap-1 px-1"
            style={{
              left: band.x,
              top: band.y,
              width: band.width,
              height: Math.min(headerHeight, band.height),
              color: "var(--content-secondary)",
              fontSize: "var(--text-micro)",
            }}
          >
            <span>{title}</span>
            {showDelta ? (
              <span className="num" style={{ color: delta.tone, fontSize: "var(--text-micro)" }}>
                {delta.text}
              </span>
            ) : null}
          </div>
        );
      })}

      {tiles.map(({ item, rect, groupId }) => {
        const name = item.name ?? item.id;
        const value = formatValue(item.color_value, unit);
        const fontSize = tileFontSize(rect.width * rect.height);
        const shows = showsLabel(rect, fontSize);
        const valueFontSize = VALUE_FONT_SIZE[fontSize];
        const visibleValue = tileValue(item.color_value, unit);
        const showValue =
          shows.value && textWidth(visibleValue, valueFontSize) <= rect.width - TEXT_PADDING;

        return (
          <div
            key={tileKey(groupId, item.id)}
            role="button"
            tabIndex={0}
            aria-label={`${name}, ${value}`}
            className={
              // El separador de 1 px es un `outline` puesto en el `style` inline,
              // que gana a cualquier clase: el anillo de foco NO puede ser otro
              // `outline` o no se veria nada. Va por `box-shadow`, que el inline
              // no toca, e `inset` para no invadir el tile vecino.
              "absolute flex flex-col items-start justify-start px-1 pt-0.5 text-left " +
              "focus-visible:[box-shadow:inset_0_0_0_2px_var(--border-focus)]"
            }
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundColor: treemapToken(
                item.color_value >= neutral ? "pos" : "neg",
                intensityStep(item.color_value - neutral, intensityScale),
              ),
              // Hacia dentro: el rect no se encoge, el layout sigue exacto.
              outline: `${TILE_GAP}px solid var(--bg)`,
              outlineOffset: `-${TILE_GAP}px`,
              color: "var(--content-primary)",
            }}
            onClick={() => onSelect?.(item)}
            onKeyDown={(event) => handleKeyDown(event, item)}
            onMouseEnter={() => onHover?.(item)}
            onFocus={() => onHover?.(item)}
          >
            {shows.name ? (
              <span
                className="font-bold leading-tight"
                style={{ fontSize: FONT_SIZE_TOKEN[fontSize] }}
              >
                {truncateLabel(name, rect.width - TEXT_PADDING, fontSize)}
              </span>
            ) : null}
            {showValue ? (
              <span
                className="num leading-tight"
                style={{
                  fontSize: FONT_SIZE_TOKEN[valueFontSize],
                  color: "var(--content-primary)",
                }}
              >
                {visibleValue}
              </span>
            ) : null}
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
              <th scope="row">{item.name ?? item.id}</th>
              <td>{currency ? fmtSize(item.size, currency) : formatAmount(item.size)}</td>
              <td>{formatValue(item.color_value, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
