/**
 * Layout squarified de treemap (Bruls, Huizing & van Wijk, 2000).
 *
 * Aritmética pura, sin JSX ni React: es la parte testeable del treemap y la
 * única que decide dónde cae cada rectángulo. `Treemap.tsx` solo la pinta.
 *
 * Tres invariantes que fijan los tests:
 * - **Teselado exacto**: los rects cubren el rectángulo entero, sin hueco ni
 *   solapamiento. Cada franja y cada tile se cierran contra el borde libre en
 *   lugar de acumular su área, así que la deriva de coma flotante no abre
 *   rendijas.
 * - **Determinismo**: el orden de entrada nunca influye. Se ordena por tamaño
 *   descendente y los empates los rompe el `id`, no la estabilidad del `sort`
 *   del motor.
 * - **Sin excepciones en los bordes**: lista vacía, un solo item, ancho o alto
 *   0 y tamaño total 0 devuelven rects de área 0, nunca `NaN` ni un throw.
 *
 * Un `size` negativo o no finito **cuenta como 0**: el treemap codifica magnitud
 * con área y un área negativa no existe. El signo del dato viaja en el color
 * (`color_value`), no en el tamaño.
 */

/** Item a repartir: un `id` estable y una magnitud no negativa. */
export type TreemapItem = {
  id: string;
  size: number;
};

/** Rectángulo resultante, en las mismas unidades que `width`/`height`. */
export type TreemapRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TreemapLayoutOptions = {
  width: number;
  height: number;
  /** Relación de aspecto que se persigue para cada tile. 1 = cuadrado. */
  ratio?: number;
};

/** Grupo de items (banda con título, como los sectores del treemap de TR). */
export type TreemapGroup = {
  id: string;
  items: readonly TreemapItem[];
};

export type TreemapGroupedOptions = {
  width: number;
  height: number;
  /** Alto reservado al título dentro del rect de cada grupo. */
  headerHeight: number;
};

/** Rect de item dentro de un layout agrupado. */
export type TreemapGroupedRect = TreemapRect & { groupId: string };

export type TreemapGroupedLayout = {
  groups: TreemapRect[];
  items: TreemapGroupedRect[];
};

type Box = { x: number; y: number; width: number; height: number };

type ScaledItem = { id: string; area: number };

/** Magnitud utilizable: negativos, `NaN` e infinitos cuentan como 0. */
function usableSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * Orden canónico: tamaño descendente y, en caso de empate, `id` ascendente.
 * El desempate explícito es lo que hace el layout independiente del orden de
 * entrada.
 */
function sortItems(items: readonly TreemapItem[]): TreemapItem[] {
  return [...items].sort((a, b) => {
    const delta = usableSize(b.size) - usableSize(a.size);
    if (delta !== 0) return delta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Peor relación de aspecto de una franja de longitud `side`, comparada contra
 * la relación objetivo. Los items llegan ordenados, así que el mayor y el menor
 * son los extremos de la franja.
 */
function worstAspect(
  maxArea: number,
  minArea: number,
  sum: number,
  side: number,
  ratio: number,
): number {
  if (sum <= 0 || minArea <= 0 || side <= 0) return Number.POSITIVE_INFINITY;
  const squared = side * side;
  return Math.max((squared * maxArea) / (sum * sum * ratio), (sum * sum * ratio) / (squared * minArea));
}

/** Reparte `items` (ya escalados a área y ordenados) dentro de `box`. */
function squarify(items: readonly ScaledItem[], box: Box, ratio: number, out: TreemapRect[]): void {
  const free: Box = { ...box };
  let index = 0;
  let pending = items.reduce((sum, item) => sum + item.area, 0);

  while (index < items.length) {
    const side = Math.min(free.width, free.height);
    if (side <= 0 || pending <= 0) {
      // Ni queda sitio ni queda área: el resto son tiles vacíos.
      for (; index < items.length; index += 1) {
        out.push({ id: items[index].id, x: free.x, y: free.y, width: 0, height: 0 });
      }
      return;
    }

    // Se añade a la franja mientras la peor relación de aspecto no empeore.
    const row: ScaledItem[] = [];
    let rowArea = 0;
    let best = Number.POSITIVE_INFINITY;
    while (index < items.length) {
      const candidate = items[index];
      const candidateWorst = worstAspect(
        row.length > 0 ? row[0].area : candidate.area,
        candidate.area,
        rowArea + candidate.area,
        side,
        ratio,
      );
      if (row.length > 0 && candidateWorst > best) break;
      row.push(candidate);
      rowArea += candidate.area;
      best = candidateWorst;
      index += 1;
    }

    pending -= rowArea;

    const along = free.width >= free.height ? "vertical" : "horizontal";
    const longSide = along === "vertical" ? free.width : free.height;
    // La última franja se come el resto del rect: así el teselado es exacto
    // aunque las divisiones hayan derivado.
    const thickness = Math.min(longSide, pending <= 0 ? longSide : rowArea / side);

    let offset = 0;
    row.forEach((item, position) => {
      const last = position === row.length - 1;
      // Una franja sin area son items de tamaño 0, que la cola del orden deja
      // juntos: repartir `item.area / rowArea` seria 0/0 y el rect salia con
      // `NaN`, que React rechaza al escribir la altura del tile.
      const extent =
        rowArea <= 0 ? 0 : last ? side - offset : (item.area / rowArea) * side;
      out.push(
        along === "vertical"
          ? { id: item.id, x: free.x, y: free.y + offset, width: thickness, height: extent }
          : { id: item.id, x: free.x + offset, y: free.y, width: extent, height: thickness },
      );
      offset += extent;
    });

    if (along === "vertical") {
      free.x += thickness;
      free.width -= thickness;
    } else {
      free.y += thickness;
      free.height -= thickness;
    }
  }
}

/** Reparte `items` dentro de un rect en el origen. */
export function layout(
  items: readonly TreemapItem[],
  options: TreemapLayoutOptions,
): TreemapRect[] {
  return layoutInside(items, { x: 0, y: 0, width: options.width, height: options.height }, options.ratio);
}

/** Reparte `items` dentro de un rect cualquiera (lo que usan los grupos). */
function layoutInside(
  items: readonly TreemapItem[],
  box: Box,
  ratio = 1,
): TreemapRect[] {
  const sorted = sortItems(items);
  const total = sorted.reduce((sum, item) => sum + usableSize(item.size), 0);
  const area = Math.max(0, box.width) * Math.max(0, box.height);

  if (sorted.length === 0) return [];
  if (area <= 0 || total <= 0) {
    return sorted.map((item) => ({ id: item.id, x: box.x, y: box.y, width: 0, height: 0 }));
  }

  const scale = area / total;
  const scaled = sorted.map((item) => ({ id: item.id, area: usableSize(item.size) * scale }));

  const rects: TreemapRect[] = [];
  squarify(scaled, box, ratio > 0 ? ratio : 1, rects);
  return rects;
}

/**
 * Layout en dos pasos: primero los grupos por la suma de tamaños de sus items
 * y después, dentro del rect de cada grupo y bajo su cabecera, sus items.
 */
export function layoutGrouped(
  groups: readonly TreemapGroup[],
  options: TreemapGroupedOptions,
): TreemapGroupedLayout {
  const headerHeight = Math.max(0, options.headerHeight);
  const groupRects = layout(
    groups.map((group) => ({
      id: group.id,
      size: group.items.reduce((sum, item) => sum + usableSize(item.size), 0),
    })),
    { width: options.width, height: options.height },
  );

  const items: TreemapGroupedRect[] = [];
  for (const groupRect of groupRects) {
    const group = groups.find((candidate) => candidate.id === groupRect.id);
    if (!group) continue;

    const inner: Box = {
      x: groupRect.x,
      y: groupRect.y + headerHeight,
      width: groupRect.width,
      // Si la cabecera no cabe, el grupo se queda sin sitio para sus tiles.
      height: Math.max(0, groupRect.height - headerHeight),
    };
    for (const rect of layoutInside(group.items, inner)) {
      items.push({ ...rect, groupId: group.id });
    }
  }

  return { groups: groupRects, items };
}
