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
 * El cuerpo con el que se mide NO sale solo del área: es `fitFontSize`, el
 * mayor de 16 / 13 / 11 que cabe de verdad en la ficha (con el área como tope).
 * Esa es la razón por la que ensanchar el Mapa ya no hace desaparecer fichas.
 *
 * El tope de fichas (`MAX_PER_COLUMN`, o `STACKED_PER_COLUMN` al apilar) lo
 * aplica quien llama, recortando `items` antes de preguntar.
 *
 * Y si ni la mayor de las fichas es PINTABLE —una caja degenerada, o una ficha
 * de magnitud 0, que el squarified reparte como 0 × 0— la respuesta es 0: el
 * llamante cuenta esa columna entera en su pie en vez de fingir una ficha.
 */

import { layout } from "@/charts/TreemapLayout";
import { fitFontSize } from "@/charts/treemap-label";

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

  // El mismo cuerpo que va a elegir el tile al pintarse (`fitFontSize`): el
  // mayor que cabe de verdad, con el área como tope. `null` = no cabe ninguno,
  // o sea que esta ficha no sería legible y el reparto entero se descarta.
  return rects.every(
    (rect) => fitFontSize(rect, rect.id, values.get(rect.id) ?? "") !== null,
  );
}

/** ¿La mayor de las fichas recibe un rectángulo con área, o sea algo que ver? */
function drawable(items: readonly FitItem[], box: FitBox): boolean {
  const [rect] = layout([{ id: items[0].id, size: items[0].size }], {
    width: box.width,
    height: box.height,
  });
  return rect !== undefined && rect.width > 0 && rect.height > 0;
}

/**
 * Mayor `n` ≤ `items.length` cuyo reparto en `box` deja TODAS las fichas con
 * su código entero y su cifra. **Es el número de fichas que se pintan de
 * verdad**, y de él sale el «y N más» del pie: pintadas + resto = censo.
 *
 * Sin items, 0. Con ellos el suelo sigue siendo 1 —enseñar la mayor, aunque
 * haya que truncarle el nombre, dice más que una columna vacía, y `Treemap` ya
 * sabe truncar— **pero solo si esa ficha SE VE**. Ese suelo era incondicional y
 * mintió: con `size = 0` el squarified reparte un rectángulo de 0 × 0
 * (`TreemapLayout`: sin área que repartir, todos los rects son 0 × 0), así que
 * la columna salía en blanco, el pie contaba una ficha de menos que el censo y
 * el DOM se quedaba con un `role="button"` de 0 px en el orden de tabulación.
 *
 * No es un borde inventado: 642 de las 1.286 empresas tienen `pending_eur = 0`
 * y basta con que la mayor de una columna sea una de ellas. Con el universo
 * «ESPAÑA» y `size_by=pending_eur`, la única empresa con score > 60 es
 * `COMP_0786`, score 99,63 y magnitud 0: esa columna no tenía nada que pintar.
 * Lo que no se puede pintar se CUENTA, no se finge.
 */
export function fitCount(items: readonly FitItem[], box: FitBox): number {
  if (items.length === 0) return 0;
  for (let n = items.length; n > 1; n -= 1) {
    if (allLegible(items.slice(0, n), box)) return n;
  }
  return drawable(items, box) ? 1 : 0;
}
