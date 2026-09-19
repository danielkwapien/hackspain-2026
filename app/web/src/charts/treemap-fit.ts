/**
 * Cuántas fichas de una columna caben LEGIBLES en su caja.
 *
 * Aritmética pura, sin React ni DOM: llama al squarified de `TreemapLayout` con
 * la caja real de la columna y comprueba el resultado con el MISMO criterio de
 * etiqueta que aplica `Treemap.tsx` al pintar (`treemap-label`). No hay umbral
 * nuevo aquí: si `Treemap` cambia de cuerpo o de relleno, esto cambia con él.
 *
 * «Legible» es nombre entero y cifra: `showsLabel(...).value` (el tile tiene
 * alto para dos líneas) y un nombre que `truncateLabel` devuelve sin cortar. La
 * cifra no se mide carácter a carácter porque su texto no existe todavía a la
 * hora de decidir el reparto; el alto de dos líneas es la condición que la hace
 * caber, y es la misma que usa el tile.
 *
 * El tope de fichas (`MAX_PER_COLUMN`, o `STACKED_PER_COLUMN` al apilar) lo
 * aplica quien llama, recortando `items` antes de preguntar.
 */

import { layout } from "@/charts/TreemapLayout";
import { TEXT_PADDING, showsLabel, tileFontSize, truncateLabel } from "@/charts/treemap-label";

type FitItem = { id: string; name?: string; size: number };

type FitBox = { width: number; height: number };

/** ¿Todas las fichas de este reparto llevan su nombre entero y su cifra? */
function allLegible(items: readonly FitItem[], box: FitBox): boolean {
  const names = new Map(items.map((item) => [item.id, item.name ?? item.id]));
  const rects = layout(
    items.map((item) => ({ id: item.id, size: item.size })),
    { width: box.width, height: box.height },
  );

  return rects.every((rect) => {
    // El mismo cuerpo que elige el tile: por área, no por número de fichas.
    const fontSize = tileFontSize(rect.width * rect.height);
    if (!showsLabel(rect, fontSize).value) return false;
    const name = names.get(rect.id) ?? rect.id;
    return truncateLabel(name, rect.width - TEXT_PADDING, fontSize) === name;
  });
}

/**
 * Mayor `n` ≤ `items.length` cuyo reparto en `box` deja TODAS las fichas con
 * nombre entero y cifra.
 *
 * Sin items, 0. Con items, nunca menos de 1: es el suelo honesto —enseñar la
 * mayor, aunque su nombre haya que truncarlo, dice más que una columna vacía—
 * y `Treemap` ya sabe truncar lo que no cabe.
 */
export function fitCount(items: readonly FitItem[], box: FitBox): number {
  if (items.length === 0) return 0;
  for (let n = items.length; n > 1; n -= 1) {
    if (allLegible(items.slice(0, n), box)) return n;
  }
  return 1;
}
