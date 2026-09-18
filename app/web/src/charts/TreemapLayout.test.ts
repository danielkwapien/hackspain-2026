import { describe, expect, it } from "vitest";
import { layout, layoutGrouped, type TreemapRect } from "@/charts/TreemapLayout";

/**
 * El layout es aritmética de coma flotante: nunca se compara con igualdad
 * exacta, siempre contra esta tolerancia.
 */
const TOLERANCE = 1e-6;

const WIDTH = 400;
const HEIGHT = 300;
const AREA = WIDTH * HEIGHT;

/** `alpha` y `bravo` empatan a tamaño: el desempate lo tiene que dar el `id`. */
const ITEMS = [
  { id: "delta", size: 3 },
  { id: "bravo", size: 12 },
  { id: "echo", size: 1 },
  { id: "alpha", size: 12 },
  { id: "charlie", size: 7 },
  { id: "foxtrot", size: 5 },
];

function areaOf(rect: TreemapRect): number {
  return rect.width * rect.height;
}

function overlapArea(a: TreemapRect, b: TreemapRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}

/** Área total + solapamiento cero + dentro de los límites ⇒ teselado exacto. */
function expectExactTiling(rects: readonly TreemapRect[], width: number, height: number): void {
  const total = rects.reduce((sum, rect) => sum + areaOf(rect), 0);
  expect(Math.abs(total - width * height)).toBeLessThan(TOLERANCE);

  for (const rect of rects) {
    expect(rect.width).toBeGreaterThanOrEqual(0);
    expect(rect.height).toBeGreaterThanOrEqual(0);
    expect(rect.x).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(rect.y).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width + TOLERANCE);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height + TOLERANCE);
  }

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      expect(
        overlapArea(rects[i], rects[j]),
        `${rects[i].id} se solapa con ${rects[j].id}`,
      ).toBeLessThan(TOLERANCE);
    }
  }
}

describe("charts/TreemapLayout", () => {
  it("TreemapLayout: squarified layout fills the rect exactly and is deterministic", () => {
    const rects = layout(ITEMS, { width: WIDTH, height: HEIGHT });

    expect([...rects].map((rect) => rect.id).sort()).toEqual(
      [...ITEMS].map((item) => item.id).sort(),
    );
    expectExactTiling(rects, WIDTH, HEIGHT);

    // Squarified: el tile mayor no degenera en una tira.
    const biggest = rects.find((rect) => rect.id === "alpha") as TreemapRect;
    const aspect = Math.max(biggest.width / biggest.height, biggest.height / biggest.width);
    expect(aspect).toBeLessThan(3);

    // El área de cada tile es proporcional a su tamaño.
    const totalSize = ITEMS.reduce((sum, item) => sum + item.size, 0);
    for (const item of ITEMS) {
      const rect = rects.find((candidate) => candidate.id === item.id) as TreemapRect;
      expect(Math.abs(areaOf(rect) - (item.size / totalSize) * AREA)).toBeLessThan(TOLERANCE);
    }

    // Determinista: mismas entradas, mismas salidas.
    expect(layout(ITEMS, { width: WIDTH, height: HEIGHT })).toEqual(rects);

    // Y el orden de entrada no cambia nada, ni siquiera con `alpha`/`bravo` empatados.
    const shuffled = [ITEMS[3], ITEMS[0], ITEMS[5], ITEMS[1], ITEMS[2], ITEMS[4]];
    expect(layout(shuffled, { width: WIDTH, height: HEIGHT })).toEqual(rects);
  });

  it("TreemapLayout: groups are laid out by summed size before their items", () => {
    const headerHeight = 16;
    const groups = [
      { id: "norte", items: [{ id: "n1", size: 20 }, { id: "n2", size: 10 }] },
      { id: "sur", items: [{ id: "s1", size: 40 }, { id: "s2", size: 30 }] },
    ];

    const result = layoutGrouped(groups, { width: WIDTH, height: HEIGHT, headerHeight });

    // Primero los grupos: sus áreas salen de la SUMA de tamaños (30 y 70), no
    // del layout plano de los cuatro items.
    expect(result.groups.map((rect) => rect.id).sort()).toEqual(["norte", "sur"]);
    expectExactTiling(result.groups, WIDTH, HEIGHT);

    const norte = result.groups.find((rect) => rect.id === "norte") as TreemapRect;
    const sur = result.groups.find((rect) => rect.id === "sur") as TreemapRect;
    expect(Math.abs(areaOf(norte) - 0.3 * AREA)).toBeLessThan(TOLERANCE);
    expect(Math.abs(areaOf(sur) - 0.7 * AREA)).toBeLessThan(TOLERANCE);

    // Y después los items, dentro del rect de su grupo y bajo la cabecera.
    for (const group of [norte, sur]) {
      const inner = result.items.filter((rect) => rect.groupId === group.id);
      expect(inner).toHaveLength(2);

      const innerArea = inner.reduce((sum, rect) => sum + areaOf(rect), 0);
      expect(Math.abs(innerArea - group.width * (group.height - headerHeight))).toBeLessThan(
        TOLERANCE,
      );

      for (const rect of inner) {
        expect(rect.x).toBeGreaterThanOrEqual(group.x - TOLERANCE);
        expect(rect.y).toBeGreaterThanOrEqual(group.y + headerHeight - TOLERANCE);
        expect(rect.x + rect.width).toBeLessThanOrEqual(group.x + group.width + TOLERANCE);
        expect(rect.y + rect.height).toBeLessThanOrEqual(group.y + group.height + TOLERANCE);
      }
    }

    // Dentro de un grupo, el item mayor manda.
    const s1 = result.items.find((rect) => rect.id === "s1") as TreemapRect;
    const s2 = result.items.find((rect) => rect.id === "s2") as TreemapRect;
    expect(areaOf(s1)).toBeGreaterThan(areaOf(s2));
  });

  it("TreemapLayout: degenerate input yields zero-sized rects instead of throwing", () => {
    expect(layout([], { width: WIDTH, height: HEIGHT })).toEqual([]);

    expect(layout([{ id: "solo", size: 5 }], { width: 100, height: 50 })).toEqual([
      { id: "solo", x: 0, y: 0, width: 100, height: 50 },
    ]);

    // Tamaño 0 o negativo cuenta como 0: sin área, sin reventar el teselado.
    const withEmpty = layout(
      [{ id: "a", size: 10 }, { id: "b", size: -5 }, { id: "c", size: 0 }],
      { width: 100, height: 100 },
    );
    expectExactTiling(withEmpty, 100, 100);
    expect(areaOf(withEmpty.find((rect) => rect.id === "a") as TreemapRect)).toBeCloseTo(10_000, 6);
    expect(areaOf(withEmpty.find((rect) => rect.id === "b") as TreemapRect)).toBe(0);
    expect(areaOf(withEmpty.find((rect) => rect.id === "c") as TreemapRect)).toBe(0);

    // Sin tamaño total no hay nada que repartir.
    for (const rect of layout([{ id: "a", size: 0 }], { width: 100, height: 100 })) {
      expect(areaOf(rect)).toBe(0);
    }

    // Ancho o alto 0: todos los rects quedan vacíos.
    for (const box of [
      { width: 0, height: HEIGHT },
      { width: WIDTH, height: 0 },
    ]) {
      const rects = layout(ITEMS, box);
      expect(rects).toHaveLength(ITEMS.length);
      for (const rect of rects) expect(areaOf(rect)).toBe(0);
    }

    // Grupos con menos alto que su cabecera: sin items visibles, sin excepción.
    const tight = layoutGrouped([{ id: "g", items: [{ id: "g1", size: 1 }] }], {
      width: 40,
      height: 8,
      headerHeight: 16,
    });
    expect(tight.groups).toHaveLength(1);
    for (const rect of tight.items) expect(areaOf(rect)).toBe(0);
  });
});
