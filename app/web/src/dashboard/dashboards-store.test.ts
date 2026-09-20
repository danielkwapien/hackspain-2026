import { beforeEach, describe, expect, it } from "vitest";
import {
  GRID_COLUMNS,
  MAX_DASHBOARDS,
  MAX_WIDGETS_PER_DASHBOARD,
  STORAGE_KEY,
  STORAGE_VERSION,
} from "./types";
import type { Dashboard, DashboardsState, LayoutItem } from "./types";
import { DEFAULT_DASHBOARD_ID, EMPRESA, INVESTIGACION, isFixedDashboard } from "./fixed";
import {
  addWidget,
  canAddWidget,
  createDashboard,
  duplicateWidget,
  getState,
  loadFromStorage,
  moveWidget,
  removeDashboard,
  removeWidget,
  renameDashboard,
  resetStore,
  resizeWidget,
  selectActiveDashboard,
  setActiveDashboard,
  setWidgetEntity,
  widgetCount,
} from "./store";

/** Disposición fija de «Empresa», en celdas de la rejilla 24 × 24. */
const EMPRESA_LAYOUT = [
  { i: "empresa-research", type: "research", x: 0, y: 0, w: 12, h: 24, entity: null },
  { i: "empresa-deep", type: "research-deep", x: 12, y: 0, w: 12, h: 24, entity: null },
];

const KNOWN_TYPES = ["companies", "research", "compare"];
const isKnownType = (type: string): boolean => KNOWN_TYPES.includes(type);

function active(): Dashboard {
  return selectActiveDashboard(getState());
}

function layout(): LayoutItem[] {
  return active().layout;
}

function widget(i: string): LayoutItem {
  const found = layout().find((candidate) => candidate.i === i);
  if (!found) throw new Error(`No existe el widget ${i}`);
  return found;
}

/** `addWidget` devuelve `null` con el tablero lleno; aquí se espera que añada. */
function mustAdd(input: Parameters<typeof addWidget>[0]): string {
  const id = addWidget(input);
  if (!id) throw new Error(`addWidget devolvió null para ${input.type}`);
  return id;
}

function mustCreate(name?: string): string {
  const id = createDashboard(name);
  if (!id) throw new Error("createDashboard devolvió null");
  return id;
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

function readStorage(): DashboardsState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error(`No hay nada persistido en ${STORAGE_KEY}`);
  return JSON.parse(raw) as DashboardsState;
}

/** Sobre un tablero fijo ninguna mutación de widget cambia nada ni escribe. */
function expectFixedUntouched(fixed: Dashboard): void {
  expect(canAddWidget(getState())).toBe(false);
  const [first, second] = fixed.layout;

  expect(addWidget({ type: "compare", w: 6, h: 4 })).toBeNull();
  moveWidget(first.i, { x: 12, y: 0 });
  resizeWidget(first.i, { w: 6, h: 6 });
  expect(duplicateWidget(second.i)).toBeNull();
  removeWidget(second.i);
  setWidgetEntity(first.i, "COMP_0002");

  expect(active()).toBe(fixed);
  expect(active().layout).toEqual(fixed.layout);
  expect(getState().dashboards).toEqual([]);
}

describe("dashboards-store", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it("DADO el store limpio CUANDO se lee el activo ENTONCES es «Investigación» y «Empresa» sigue con research 0,0,12,24 y research-deep 12,0,12,24, sin escribir en localStorage", () => {
    // XR-037 (I0): el tablero que abre es Investigación; Empresa se conserva entero.
    expect(getState().active).toBe(DEFAULT_DASHBOARD_ID);
    expect(getState().active).toBe("investigacion");
    expect(getState().dashboards).toEqual([]);
    expect(active()).toBe(INVESTIGACION);

    expect(EMPRESA.id).toBe("empresa");
    expect(EMPRESA.name).toBe("Empresa");
    expect(EMPRESA.layout).toEqual(EMPRESA_LAYOUT);
    expect(isFixedDashboard(EMPRESA.id)).toBe(true);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("DADO un tablero fijo activo (Empresa e Investigación) CUANDO addWidget/moveWidget/removeWidget/duplicateWidget/setWidgetEntity ENTONCES devuelven null/no cambian nada ni escriben", () => {
    expectFixedUntouched(INVESTIGACION);
    expect(active().layout).toHaveLength(7);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    setActiveDashboard("empresa");
    expect(getState().active).toBe("empresa");
    expect(active()).toBe(EMPRESA);
    expectFixedUntouched(EMPRESA);

    // Cambiar de tablero fijo sí persiste el activo, pero sin tableros de usuario.
    expect(readStorage()).toEqual({
      version: STORAGE_VERSION,
      active: "empresa",
      dashboards: [],
    });
  });

  it("DADO un tablero de usuario CUANDO se añaden 4 widgets ENTONCES el 5.º addWidget devuelve null, canAddWidget es false y duplicateWidget devuelve null", () => {
    const id = mustCreate("Pruebas");
    expect(getState().active).toBe(id);
    expect(isFixedDashboard(id)).toBe(false);
    expect(canAddWidget(getState())).toBe(true);

    const first = mustAdd({ type: "compare", w: 6, h: 4 });
    for (let index = 1; index < MAX_WIDGETS_PER_DASHBOARD; index += 1) {
      mustAdd({ type: "compare", w: 6, h: 4 });
    }
    expect(widgetCount(getState())).toBe(MAX_WIDGETS_PER_DASHBOARD);

    expect(addWidget({ type: "compare", w: 6, h: 4 })).toBeNull();
    expect(canAddWidget(getState())).toBe(false);
    expect(duplicateWidget(first)).toBeNull();
    expect(layout()).toHaveLength(MAX_WIDGETS_PER_DASHBOARD);
  });

  it("DADO un tablero con widgets CUANDO se mueve fuera de la rejilla y se redimensiona ENTONCES x+w<=24, sin solapes y compactado; se persiste con version 2 y sin los fijos", () => {
    const dashboardId = mustCreate("Pruebas");
    const id = mustAdd({ type: "compare", w: 12, h: 4 });
    const pushed = mustAdd({ type: "compare", w: 12, h: 4 });
    expect(widget(id)).toMatchObject({ x: 0, y: 0 });
    expect(widget(pushed)).toMatchObject({ x: 12, y: 0 });

    // Fuera de la rejilla por la derecha: se recorta y no se rechaza.
    moveWidget(id, { x: 30, y: 0 });
    expect(widget(id).x).toBe(GRID_COLUMNS - 12);
    expect(widget(id).y).toBe(0);
    // El item movido gana su sitio y el que solapaba baja.
    expect(widget(pushed).y).toBe(4);
    expectWithinGrid(layout());
    expectNoOverlap(layout());
    expectCompacted(layout());

    moveWidget(id, { x: -5, y: -3 });
    expect(widget(id).x).toBe(0);
    expect(widget(id).y).toBe(0);
    expectCompacted(layout());

    resizeWidget(id, { w: 40, h: 3 });
    expect(widget(id).w).toBe(GRID_COLUMNS);
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

    const stored = readStorage();
    expect(stored.version).toBe(2);
    expect(stored.version).toBe(STORAGE_VERSION);
    expect(stored.active).toBe(dashboardId);
    expect(stored.dashboards.map((dashboard) => dashboard.id)).toEqual([dashboardId]);
    expect(stored.dashboards.some((dashboard) => isFixedDashboard(dashboard.id))).toBe(false);
    expect(stored.dashboards[0].layout.map((item) => item.i)).toEqual([pushed]);
  });

  it('DADO createDashboard ×8 CUANDO se pide el 9.º ENTONCES null; removeDashboard del activo deja active="investigacion"; renameDashboard persiste', () => {
    const ids: string[] = [];
    for (let index = 0; index < MAX_DASHBOARDS; index += 1) ids.push(mustCreate());

    expect(getState().dashboards.map((dashboard) => dashboard.name)).toEqual(
      ids.map((_, index) => `Tablero ${index + 1}`),
    );
    expect(getState().active).toBe(ids[MAX_DASHBOARDS - 1]);
    expect(createDashboard()).toBeNull();
    expect(getState().dashboards).toHaveLength(MAX_DASHBOARDS);

    removeDashboard(ids[MAX_DASHBOARDS - 1]);
    expect(getState().active).toBe("investigacion");
    expect(active()).toBe(INVESTIGACION);
    expect(getState().dashboards).toHaveLength(MAX_DASHBOARDS - 1);

    // Quitar uno que no es el activo no toca el activo.
    setActiveDashboard(ids[0]);
    removeDashboard(ids[1]);
    expect(getState().active).toBe(ids[0]);

    renameDashboard(ids[0], "Tesorería");
    expect(active().name).toBe("Tesorería");
    expect(readStorage().dashboards.find((dashboard) => dashboard.id === ids[0])?.name).toBe(
      "Tesorería",
    );

    // Los fijos no se renombran ni se quitan.
    renameDashboard("empresa", "Otro");
    removeDashboard("investigacion");
    expect(EMPRESA.name).toBe("Empresa");
    expect(getState().dashboards).toHaveLength(MAX_DASHBOARDS - 2);
    expect(getState().active).toBe(ids[0]);
  });

  it('DADO JSON corrupto, version 0, tipo desconocido, x+w>24, un 5.º widget y active inexistente CUANDO loadFromStorage ENTONCES defecto / descarta solo lo inválido / recorta a 4 / active="investigacion"; un estado válido se conserva', () => {
    function expectDefault(): void {
      expect(getState().version).toBe(STORAGE_VERSION);
      expect(getState().active).toBe(DEFAULT_DASHBOARD_ID);
      expect(getState().dashboards).toEqual([]);
      expect(active()).toBe(INVESTIGACION);
    }

    // 1. JSON corrupto.
    localStorage.setItem(STORAGE_KEY, "{no-soy-json");
    loadFromStorage(isKnownType);
    expectDefault();

    // 2. Versión antigua.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 0,
        active: "d1",
        dashboards: [{ id: "d1", name: "Viejo", layout: [] }],
      }),
    );
    loadFromStorage(isKnownType);
    expectDefault();

    // 3. Solo se descarta lo inválido: tipo desconocido y x+w>24 fuera; cinco
    //    válidos se recortan a cuatro; el activo no existe → «empresa».
    const item = (i: string, type: string, x: number, y: number, w = 6, h = 4): LayoutItem => ({
      i,
      type,
      x,
      y,
      w,
      h,
      entity: null,
    });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        active: "d-inexistente",
        dashboards: [
          {
            id: "d1",
            name: "Sucio",
            layout: [
              item("w1", "companies", 0, 0),
              item("w2", "desconocido", 6, 0),
              item("w3", "compare", 20, 0, 8, 4),
              item("w4", "compare", 12, 0),
              item("w5", "research", 18, 0),
              item("w6", "compare", 0, 4),
              item("w7", "compare", 6, 4),
            ],
          },
        ],
      }),
    );
    loadFromStorage(isKnownType);
    expect(getState().active).toBe(DEFAULT_DASHBOARD_ID);
    const dirty = getState().dashboards.find((dashboard) => dashboard.id === "d1");
    if (!dirty) throw new Error("El tablero válido se descartó entero");
    expect(dirty.layout.map((entry) => entry.i)).toEqual(["w1", "w4", "w5", "w6"]);
    expect(dirty.layout.every((entry) => isKnownType(entry.type))).toBe(true);
    expectWithinGrid(dirty.layout);
    expectNoOverlap(dirty.layout);
    expectCompacted(dirty.layout);

    // 4. Un estado válido de la versión actual sí se conserva.
    const valid: DashboardsState = {
      version: STORAGE_VERSION,
      active: "d-guardado",
      dashboards: [
        {
          id: "d-guardado",
          name: "Guardado",
          layout: [{ i: "w9", type: "compare", x: 0, y: 0, w: 4, h: 4, entity: "COMP_0002" }],
        },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    loadFromStorage(isKnownType);
    expect(getState()).toEqual(valid);
    expect(active().id).toBe("d-guardado");
  });

  it('DADO active "main" persistido (XR-031) CUANDO loadFromStorage ENTONCES cae al fijo por defecto conservando los tableros de usuario', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        active: "main",
        dashboards: [{ id: "d1", name: "Mío", layout: [] }],
      }),
    );

    loadFromStorage(isKnownType);

    expect(getState().version).toBe(STORAGE_VERSION);
    // XR-037 (I0): 2, la que invalida el `active: "empresa"` que ya estuviera guardado.
    expect(STORAGE_VERSION).toBe(2);
    expect(getState().active).toBe("investigacion");
    expect(active()).toBe(INVESTIGACION);
    expect(getState().dashboards.map((dashboard) => dashboard.id)).toEqual(["d1"]);
  });

  it('DADO active "investigacion" persistido CUANDO loadFromStorage ENTONCES se conserva y el activo es INVESTIGACION', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, active: "investigacion", dashboards: [] }),
    );

    loadFromStorage(isKnownType);

    expect(getState().active).toBe("investigacion");
    expect(active()).toBe(INVESTIGACION);
  });

  it('DADO un tablero de usuario persistido con id "empresa" CUANDO loadFromStorage ENTONCES se descarta y el fijo manda', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        active: "empresa",
        dashboards: [
          {
            id: "empresa",
            name: "Impostor",
            layout: [{ i: "w1", type: "compare", x: 0, y: 0, w: 6, h: 4, entity: null }],
          },
          { id: "investigacion", name: "Impostor 2", layout: [] },
          { id: "d2", name: "Legítimo", layout: [] },
        ],
      }),
    );

    loadFromStorage(isKnownType);

    expect(getState().dashboards.map((dashboard) => dashboard.id)).toEqual(["d2"]);
    expect(getState().active).toBe("empresa");
    expect(active()).toBe(EMPRESA);
    expect(active().layout).toEqual(EMPRESA_LAYOUT);
  });

  it("DADO setActiveDashboard CUANDO se le pasa un fijo, un usuario o un desconocido ENTONCES acepta los dos primeros e ignora el tercero", () => {
    const id = mustCreate("Pruebas");
    expect(getState().active).toBe(id);

    setActiveDashboard("investigacion");
    expect(getState().active).toBe("investigacion");

    setActiveDashboard("main");
    expect(getState().active).toBe("investigacion");

    setActiveDashboard(id);
    expect(getState().active).toBe(id);

    setActiveDashboard("empresa");
    expect(getState().active).toBe("empresa");
  });

  it("DADO setWidgetEntity CUANDO se fija y se vuelve a null ENTONCES solo cambia ese item", () => {
    mustCreate("Pruebas");
    const research = mustAdd({ type: "research", w: 12, h: 14 });
    const compare = mustAdd({ type: "compare", w: 12, h: 10 });
    expect(widget(research).entity).toBeNull();

    setWidgetEntity(research, "COMP_0002");
    expect(widget(research).entity).toBe("COMP_0002");
    expect(widget(compare).entity).toBeNull();
    expect(
      readStorage().dashboards[0].layout.find((item) => item.i === research)?.entity,
    ).toBe("COMP_0002");

    setWidgetEntity(research, null);
    expect(widget(research).entity).toBeNull();
    expect(widget(compare).entity).toBeNull();
    expect(widget(research)).toMatchObject({ type: "research", w: 12, h: 14 });
  });
});
