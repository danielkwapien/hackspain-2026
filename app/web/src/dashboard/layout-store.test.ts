import { beforeEach, describe, expect, it } from "vitest";
import { GRID_COLUMNS, STORAGE_KEY, STORAGE_VERSION } from "./types";
import type { DashboardState, LayoutItem } from "./types";
import {
  addWidget,
  duplicateWidget,
  getState,
  loadFromStorage,
  moveWidget,
  removeWidget,
  resizeWidget,
  resetStore,
  setEntities,
} from "./store";

function layout(): LayoutItem[] {
  const state = getState();
  const workspace = state.workspaces.find((candidate) => candidate.id === state.active);
  if (!workspace) throw new Error("No hay espacio activo");
  return workspace.layout;
}

function widget(i: string): LayoutItem {
  const found = layout().find((candidate) => candidate.i === i);
  if (!found) throw new Error(`No existe el widget ${i}`);
  return found;
}

function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Ningún par de widgets comparte celda. */
function expectNoOverlap(items: LayoutItem[]): void {
  for (const a of items) {
    for (const b of items) {
      if (a.i === b.i) continue;
      expect(overlaps(a, b), `${a.i} solapa con ${b.i}`).toBe(false);
    }
  }
}

/** Compactado en vertical: subir un item una fila más chocaría con otro. */
function expectCompacted(items: LayoutItem[]): void {
  for (const item of items) {
    if (item.y === 0) continue;
    const lifted = { ...item, y: item.y - 1 };
    const blocked = items.some((other) => other.i !== item.i && overlaps(lifted, other));
    expect(blocked, `${item.i} podría flotar más arriba`).toBe(true);
  }
}

function expectWithinGrid(items: LayoutItem[]): void {
  for (const item of items) {
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.y).toBeGreaterThanOrEqual(0);
    expect(item.w).toBeGreaterThanOrEqual(1);
    expect(item.h).toBeGreaterThanOrEqual(1);
    expect(item.x + item.w).toBeLessThanOrEqual(GRID_COLUMNS);
  }
}

function readStorage(): DashboardState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error(`No hay nada persistido en ${STORAGE_KEY}`);
  return JSON.parse(raw) as DashboardState;
}

describe("layout-store", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it("adds a widget at the first free slot and persists to localStorage with version", () => {
    // El preset deja libre el hueco bajo la tarjeta de score: (16, 8).
    const id = addWidget({ type: "score-card", w: 8, h: 6 });

    expect(widget(id)).toMatchObject({ type: "score-card", x: 16, y: 8, w: 8, h: 6 });
    expectNoOverlap(layout());
    expectWithinGrid(layout());

    const stored = readStorage();
    expect(stored.version).toBe(1);
    expect(stored.version).toBe(STORAGE_VERSION);
    const persisted = stored.workspaces
      .find((workspace) => workspace.id === stored.active)
      ?.layout.find((item) => item.i === id);
    expect(persisted).toMatchObject({ type: "score-card", x: 16, y: 8, w: 8, h: 6 });
  });

  it("resizes and moves within grid bounds and compacts vertically", () => {
    const id = addWidget({ type: "score-card", w: 6, h: 4 });
    const pushed = layout().find((item) => item.type === "score-card" && item.i !== id);
    if (!pushed) throw new Error("Falta la tarjeta de score del preset");

    // Fuera de la rejilla por la derecha: se recorta y no se rechaza.
    moveWidget(id, { x: 30, y: 0 });
    expect(widget(id).x).toBe(GRID_COLUMNS - 6);
    expect(widget(id).y).toBe(0);
    // El item movido gana su sitio y el que solapaba baja.
    expect(widget(pushed.i).y).toBe(4);
    expectWithinGrid(layout());
    expectNoOverlap(layout());
    expectCompacted(layout());

    moveWidget(id, { x: -5, y: -3 });
    expect(widget(id).x).toBe(0);
    expect(widget(id).y).toBe(0);

    moveWidget(id, { x: 18, y: 0 });
    resizeWidget(id, { w: 40, h: 3 });
    expect(widget(id).w).toBe(GRID_COLUMNS - 18);
    expect(widget(id).h).toBe(3);
    expectWithinGrid(layout());
    expectNoOverlap(layout());
    expectCompacted(layout());

    resizeWidget(id, { w: 0, h: 0 }, { w: 2, h: 5 });
    expect(widget(id).w).toBe(2);
    expect(widget(id).h).toBe(5);

    removeWidget(id);
    expect(layout().some((item) => item.i === id)).toBe(false);
    expectNoOverlap(layout());
    expectCompacted(layout());
  });

  it("duplicate keeps type, entity and linkGroup", () => {
    const entities = [{ kind: "company" as const, id: "COMP_0001", name: "Acme" }];
    const id = addWidget({ type: "screener", w: 6, h: 4, entities, linkGroup: "blue" });

    const copyId = duplicateWidget(id);
    expect(copyId).not.toBe(id);

    const original = widget(id);
    const copy = widget(copyId);
    expect(copy.type).toBe(original.type);
    expect(copy.linkGroup).toBe("blue");
    expect(copy.entities).toEqual(entities);
    expect(copy.entities).not.toBe(original.entities);
    expect(copy.w).toBe(original.w);
    expect(copy.h).toBe(original.h);
    expectNoOverlap(layout());
    expectWithinGrid(layout());
  });

  it("setEntity updates every widget in the same linkGroup only", () => {
    for (const item of [...layout()]) removeWidget(item.i);

    const green1 = addWidget({ type: "screener", w: 6, h: 4, linkGroup: "green" });
    const green2 = addWidget({ type: "score-card", w: 6, h: 4, linkGroup: "green" });
    const blue = addWidget({ type: "score-card", w: 6, h: 4, linkGroup: "blue" });
    const gray = addWidget({ type: "score-card", w: 6, h: 4, linkGroup: "gray" });

    const acme = [{ kind: "company" as const, id: "COMP_0001", name: "Acme" }];
    setEntities(green1, acme);

    expect(widget(green1).entities).toEqual(acme);
    expect(widget(green2).entities).toEqual(acme);
    expect(widget(blue).entities).toEqual([]);
    expect(widget(gray).entities).toEqual([]);

    // Sin vínculo (`gray`): el cambio no sale del propio widget.
    const globex = [{ kind: "company" as const, id: "COMP_0002", name: "Globex" }];
    setEntities(gray, globex);

    expect(widget(gray).entities).toEqual(globex);
    expect(widget(green1).entities).toEqual(acme);
    expect(widget(green2).entities).toEqual(acme);
    expect(widget(blue).entities).toEqual([]);
  });

  it("migration from missing/old version yields default preset", () => {
    function expectDefaultPreset(): void {
      const state = getState();
      expect(state.version).toBe(STORAGE_VERSION);
      expect(state.workspaces.map((workspace) => workspace.name)).toEqual([
        "Cartera",
        "Research",
        "Monitor",
      ]);
      const active = state.workspaces.find((workspace) => workspace.id === state.active);
      expect(active?.name).toBe("Cartera");
      expect(active?.layout.map((item) => item.type)).toEqual(["screener", "score-card"]);
      expect(readStorage().version).toBe(STORAGE_VERSION);
    }

    // 1. Nada persistido.
    localStorage.clear();
    loadFromStorage();
    expectDefaultPreset();

    // 2. JSON corrupto.
    localStorage.setItem(STORAGE_KEY, "{no-soy-json");
    loadFromStorage();
    expectDefaultPreset();

    // 3. Versión antigua.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 0,
        active: "ws-viejo",
        workspaces: [{ id: "ws-viejo", name: "Viejo", presetId: "v0", layout: [] }],
      }),
    );
    loadFromStorage();
    expectDefaultPreset();

    // 4. Un estado válido de la versión actual sí se conserva.
    const valid: DashboardState = {
      version: STORAGE_VERSION,
      active: "ws-guardado",
      workspaces: [
        {
          id: "ws-guardado",
          name: "Guardado",
          presetId: "default",
          layout: [
            {
              i: "w9",
              type: "screener",
              x: 0,
              y: 0,
              w: 4,
              h: 4,
              entities: [],
              linkGroup: "orange",
            },
          ],
        },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    loadFromStorage();
    expect(getState()).toEqual(valid);
  });
});
