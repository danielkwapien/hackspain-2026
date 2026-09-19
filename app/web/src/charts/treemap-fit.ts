/**
 * Cuántas fichas de una columna caben LEGIBLES en su caja.
 *
 * Aritmética pura, sin React ni DOM: llama al squarified de `TreemapLayout` con
 * la caja real de la columna y comprueba el resultado con el MISMO criterio de
 * etiqueta que aplica `Treemap.tsx` al pintar (`treemap-label`). No hay umbral
 * nuevo aquí: si `Treemap` cambia de cuerpo o de relleno, esto cambia con él.
 *
 * **El suelo de legibilidad es el CÓDIGO de la empresa, no su nombre.** Antes se
 * exigía el nombre comercial entero y eso hacía inservible el mapa: los nombres
 * del dataset miden de 15 a 35 caracteres (mediana 23, ninguno por debajo de 15)
 * y uno de 23 a 11 px en negrita pide ~185 px de ficha, mientras que las
 * columnas reales miden de 119 a 172 px. Ningún `n ≥ 2` pasaba nunca, `fitCount`
 * caía siempre a su suelo de 1 y el Mapa enseñaba tres fichas de 830 — con el
 * nombre truncado igualmente, así que la regla no compraba nada. El código
 * (`id`, `COMP_0001`) es corto y uniforme, y es el mismo suelo que usa Trade
 * Republic: su heatmap pinta `GOOGL`, no «Alphabet Inc. Class A».
 *
 * Así que «legible» es: alto para dos líneas (`showsLabel(...).value`), el
 * código entero sin truncar y la cifra entera. Las tres condiciones son las
 * que decide el tile al pintar, incluida la de la cifra: `Treemap` la esconde
 * cuando su texto no cabe en el ancho útil, y por eso el texto ya formateado
 * viaja en cada ficha (`valueText`) y se mide aquí igual que allí. El nombre
 * comercial se pinta truncado sobre ese suelo, que es lo que `Treemap` ya sabe
 * hacer.
 *
 * El tope de fichas (`MAX_PER_COLUMN`, o `STACKED_PER_COLUMN` al apilar) lo
 * aplica quien llama, recortando `items` antes de preguntar.
 */

import { layout } from "@/charts/TreemapLayout";
import {
  BOLD_CHAR_EM,
  TEXT_PADDING,
  VALUE_FONT_SIZE,
  showsLabel,
  textWidth,
  tileFontSize,
  truncateLabel,
} from "@/charts/treemap-label";

/** Ficha a medir: `valueText` es la cifra YA formateada, tal cual la pinta el tile. */
type FitItem = { id: string; size: number; valueText: string };

type FitBox = { width: number; height: number };

/** ¿Todas las fichas de este reparto llevan su código entero y su cifra? */
function allLegible(items: readonly FitItem[], box: FitBox): boolean {
  const values = new Map(items.map((item) => [item.id, item.valueText]));
  const rects = layout(
    items.map((item) => ({ id: item.id, size: item.size })),
    { width: box.width, height: box.height },
  );

  return rects.every((rect) => {
    // El mismo cuerpo que elige el tile: por área, no por número de fichas.
    const fontSize = tileFontSize(rect.width * rect.height);
    if (!showsLabel(rect, fontSize).value) return false;
    const usable = rect.width - TEXT_PADDING;
    // El nombre va en negrita; la cifra, en peso normal y un cuerpo por debajo.
    if (truncateLabel(rect.id, usable, fontSize, BOLD_CHAR_EM) !== rect.id) return false;
    return textWidth(values.get(rect.id) ?? "", VALUE_FONT_SIZE[fontSize]) <= usable;
  });
}

/**
 * Mayor `n` ≤ `items.length` cuyo reparto en `box` deja TODAS las fichas con
 * su código entero y su cifra.
 *
 * Sin items, 0. Con items, nunca menos de 1: es el suelo honesto —enseñar la
 * mayor, aunque haya que truncarle el nombre, dice más que una columna vacía—
 * y `Treemap` ya sabe truncar lo que no cabe.
 */
export function fitCount(items: readonly FitItem[], box: FitBox): number {
  if (items.length === 0) return 0;
  for (let n = items.length; n > 1; n -= 1) {
    if (allLegible(items.slice(0, n), box)) return n;
  }
  return 1;
}
