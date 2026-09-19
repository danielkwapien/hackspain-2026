/**
 * Store de tableros: estado único en memoria, suscripción con
 * `useSyncExternalStore` y persistencia versionada en `localStorage`.
 *
 * No hay librería de estado: los tableros son un solo objeto inmutable y cada
 * acción lo reemplaza, compacta la rejilla y persiste. Los fijos («Empresa» e
 * «Investigación», `./fixed`) no viven en el estado: son presets, ninguna
 * mutación los toca y nunca se escriben en `localStorage`. El layout se resuelve
 * como en el "vertical compact" de react-grid-layout: el item movido gana su
 * sitio, los que solapa bajan y después todo flota hacia arriba.
 *
 * Sin migración al quitar «Principal» (XR-032): `sanitize` ya manda un `active`
 * desconocido (el viejo `"main"`) al fijo por defecto y rechaza tableros de usuario
 * con id fijo; los tableros de usuario persistidos se conservan tal cual. La versión
 * sí sube a 2 en XR-037, y esa sí tira el estado guardado: un `active: "empresa"`
 * legítimo de antes taparía el tablero que ahora abre.
 */

import { useSyncExternalStore } from "react";
import { DEFAULT_DASHBOARD_ID, EMPRESA, fixedDashboard, isFixedDashboard } from "./fixed";
import {
  GRID_COLUMNS,
  MAX_DASHBOARDS,
  MAX_WIDGETS_PER_DASHBOARD,
  STORAGE_KEY,
  STORAGE_VERSION,
} from "./types";
import type { Dashboard, DashboardsState, LayoutItem } from "./types";

type Rect = { x: number; y: number; w: number; h: number };

/** Nombres más largos no caben en una pestaña; se recortan al cargar. */
const MAX_NAME_LENGTH = 40;

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

/** Ids deterministas (`w1`, `d1`, …): los tests no dependen de `randomUUID`. */
let widgetCounter = 0;
let dashboardCounter = 0;

function nextWidgetId(): string {
  widgetCounter += 1;
  return `w${widgetCounter}`;
}

function nextDashboardId(): string {
  dashboardCounter += 1;
  return `d${dashboardCounter}`;
}

function defaultState(): DashboardsState {
  widgetCounter = 0;
  dashboardCounter = 0;
  return { version: STORAGE_VERSION, active: DEFAULT_DASHBOARD_ID, dashboards: [] };
}

let state: DashboardsState = defaultState();

function setState(next: DashboardsState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Las mutaciones del usuario persisten; cargar o reiniciar el store, no. */
function commit(next: DashboardsState): void {
  setState(next);
  persist();
}

export function getState(): DashboardsState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** El tablero de usuario activo, el fijo activo o «Empresa» si el id ya no existe. */
export function selectActiveDashboard(value: DashboardsState): Dashboard {
  const found = value.dashboards.find((dashboard) => dashboard.id === value.active);
  return found ?? fixedDashboard(value.active) ?? EMPRESA;
}

export function widgetCount(value: DashboardsState): number {
  return selectActiveDashboard(value).layout.length;
}

export function canAddWidget(value: DashboardsState): boolean {
  return !isFixedDashboard(value.active) && widgetCount(value) < MAX_WIDGETS_PER_DASHBOARD;
}

/** El selector debe devolver valores estables (primitivas o referencias del estado). */
export function useDashboards<T>(selector: (value: DashboardsState) => T): T {
  const snapshot = () => selector(state);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useActiveDashboard(): Dashboard {
  return useDashboards(selectActiveDashboard);
}

/* ------------------------------------------------------------------ */
/* Rejilla                                                             */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function bottomOf(layout: LayoutItem[]): number {
  return layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}

/** Primer hueco libre: `y` de arriba abajo y, en cada fila, `x` de izquierda a derecha. */
function firstFreeSlot(layout: LayoutItem[], w: number, h: number): { x: number; y: number } {
  const bottom = bottomOf(layout);
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x <= GRID_COLUMNS - w; x += 1) {
      const candidate = { x, y, w, h };
      if (!layout.some((item) => overlaps(candidate, item))) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

/**
 * Empuja hacia abajo, en cascada, todo lo que solape con el item movido. Cada
 * empujón deja al desplazado estrictamente por debajo del que lo empuja, así
 * que la cascada no puede volver sobre sus pasos.
 */
function pushDown(layout: LayoutItem[], movedId: string): LayoutItem[] {
  const next = layout.map((item) => ({ ...item }));
  const queue = next.filter((item) => item.i === movedId);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) continue;
    for (const other of next) {
      if (other.i === current.i || !overlaps(current, other)) continue;
      other.y = current.y + current.h;
      queue.push(other);
    }
  }
  return next;
}

/** Compactación vertical por `y` ascendente y, a igualdad, `x` ascendente. */
function compact(layout: LayoutItem[]): LayoutItem[] {
  const order = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: LayoutItem[] = [];
  const byId = new Map<string, LayoutItem>();
  for (const item of order) {
    let y = item.y;
    while (y > 0 && !placed.some((other) => overlaps({ ...item, y: y - 1 }, other))) y -= 1;
    const settled = { ...item, y };
    placed.push(settled);
    byId.set(settled.i, settled);
  }
  return layout.map((item) => byId.get(item.i) ?? item);
}

/* ------------------------------------------------------------------ */
/* Mutaciones del tablero activo (nunca sobre un fijo)                 */
/* ------------------------------------------------------------------ */

/** El tablero de usuario activo, o `null` si el activo es fijo o no existe. */
function editableDashboard(): Dashboard | null {
  return state.dashboards.find((dashboard) => dashboard.id === state.active) ?? null;
}

function writeDashboard(id: string, layout: LayoutItem[]): void {
  commit({
    ...state,
    dashboards: state.dashboards.map((dashboard) =>
      dashboard.id === id ? { ...dashboard, layout } : dashboard,
    ),
  });
}

/** Resuelve colisiones alrededor de `movedId` (si lo hay), compacta y persiste. */
function commitLayout(dashboard: Dashboard, layout: LayoutItem[], movedId?: string): void {
  const resolved = movedId ? pushDown(layout, movedId) : layout;
  writeDashboard(dashboard.id, compact(resolved));
}

export function addWidget(input: {
  type: string;
  w: number;
  h: number;
  entity?: string | null;
}): string | null {
  const dashboard = editableDashboard();
  if (!dashboard || dashboard.layout.length >= MAX_WIDGETS_PER_DASHBOARD) return null;
  const w = clamp(input.w, 1, GRID_COLUMNS);
  const h = Math.max(1, Math.round(input.h));
  const item: LayoutItem = {
    i: nextWidgetId(),
    type: input.type,
    ...firstFreeSlot(dashboard.layout, w, h),
    w,
    h,
    entity: input.entity ?? null,
  };
  commitLayout(dashboard, [...dashboard.layout, item], item.i);
  return item.i;
}

export function moveWidget(i: string, pos: { x: number; y: number }): void {
  const dashboard = editableDashboard();
  if (!dashboard || !dashboard.layout.some((item) => item.i === i)) return;
  commitLayout(
    dashboard,
    dashboard.layout.map((item) =>
      item.i === i
        ? {
            ...item,
            x: clamp(pos.x, 0, GRID_COLUMNS - item.w),
            y: Math.max(0, Math.round(pos.y)),
          }
        : item,
    ),
    i,
  );
}

export function resizeWidget(
  i: string,
  size: { w: number; h: number },
  min?: { w: number; h: number },
): void {
  const dashboard = editableDashboard();
  const target = dashboard?.layout.find((item) => item.i === i);
  if (!dashboard || !target) return;
  const minW = Math.max(1, Math.round(min?.w ?? 1));
  const minH = Math.max(1, Math.round(min?.h ?? 1));
  // El ancho crece hacia la derecha; solo si el mínimo no cabe se desplaza `x`.
  const w = clamp(size.w, minW, Math.max(minW, GRID_COLUMNS - target.x));
  const width = Math.min(w, GRID_COLUMNS);
  const next = {
    ...target,
    w: width,
    h: Math.max(minH, Math.round(size.h)),
    x: Math.min(target.x, GRID_COLUMNS - width),
  };
  commitLayout(
    dashboard,
    dashboard.layout.map((item) => (item.i === i ? next : item)),
    i,
  );
}

export function duplicateWidget(i: string): string | null {
  const dashboard = editableDashboard();
  const source = dashboard?.layout.find((item) => item.i === i);
  if (!dashboard || !source || dashboard.layout.length >= MAX_WIDGETS_PER_DASHBOARD) return null;
  const copy: LayoutItem = {
    ...source,
    i: nextWidgetId(),
    ...firstFreeSlot(dashboard.layout, source.w, source.h),
  };
  commitLayout(dashboard, [...dashboard.layout, copy], copy.i);
  return copy.i;
}

export function removeWidget(i: string): void {
  const dashboard = editableDashboard();
  if (!dashboard || !dashboard.layout.some((item) => item.i === i)) return;
  commitLayout(
    dashboard,
    dashboard.layout.filter((item) => item.i !== i),
  );
}

export function setWidgetEntity(i: string, entity: string | null): void {
  const dashboard = editableDashboard();
  if (!dashboard || !dashboard.layout.some((item) => item.i === i)) return;
  writeDashboard(
    dashboard.id,
    dashboard.layout.map((item) => (item.i === i ? { ...item, entity } : item)),
  );
}

/* ------------------------------------------------------------------ */
/* Tableros                                                            */
/* ------------------------------------------------------------------ */

/** Crea un tablero vacío y lo activa; `null` con `MAX_DASHBOARDS`. */
export function createDashboard(name?: string): string | null {
  if (state.dashboards.length >= MAX_DASHBOARDS) return null;
  const id = nextDashboardId();
  const dashboard: Dashboard = { id, name: name ?? `Tablero ${dashboardCounter}`, layout: [] };
  commit({ ...state, active: id, dashboards: [...state.dashboards, dashboard] });
  return id;
}

export function renameDashboard(id: string, name: string): void {
  if (!state.dashboards.some((dashboard) => dashboard.id === id)) return;
  commit({
    ...state,
    dashboards: state.dashboards.map((dashboard) =>
      dashboard.id === id ? { ...dashboard, name } : dashboard,
    ),
  });
}

/** Si era el activo, el activo vuelve a «Empresa». */
export function removeDashboard(id: string): void {
  if (!state.dashboards.some((dashboard) => dashboard.id === id)) return;
  commit({
    ...state,
    active: state.active === id ? DEFAULT_DASHBOARD_ID : state.active,
    dashboards: state.dashboards.filter((dashboard) => dashboard.id !== id),
  });
}

export function setActiveDashboard(id: string): void {
  if (!isFixedDashboard(id) && !state.dashboards.some((dashboard) => dashboard.id === id)) return;
  commit({ ...state, active: id });
}

/* ------------------------------------------------------------------ */
/* Persistencia                                                        */
/* ------------------------------------------------------------------ */

function persist(): void {
  // En modo privado o sin `localStorage` los tableros siguen vivos en memoria.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* sin persistencia */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCell(value: unknown, min: number): value is number {
  return Number.isInteger(value) && (value as number) >= min;
}

/** Un item del JSON: `null` si le falta o le sobra algo, no se recorta. */
function sanitizeItem(value: unknown, isKnownType: (type: string) => boolean): LayoutItem | null {
  if (!isRecord(value)) return null;
  const { i, type, x, y, w, h, entity } = value;
  if (typeof i !== "string" || typeof type !== "string" || !isKnownType(type)) return null;
  if (!isCell(x, 0) || !isCell(y, 0) || !isCell(w, 1) || !isCell(h, 1)) return null;
  if (x + w > GRID_COLUMNS) return null;
  if (entity !== null && typeof entity !== "string") return null;
  return { i, type, x, y, w, h, entity };
}

/** Un tablero del JSON: `null` si no es de usuario o no tiene forma. */
function sanitizeDashboard(
  value: unknown,
  isKnownType: (type: string) => boolean,
): Dashboard | null {
  if (!isRecord(value)) return null;
  const { id, name, layout } = value;
  if (typeof id !== "string" || isFixedDashboard(id) || !Array.isArray(layout)) return null;
  const trimmed = typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "";
  if (!trimmed) return null;
  const seen = new Set<string>();
  const items: LayoutItem[] = [];
  for (const entry of layout) {
    const item = sanitizeItem(entry, isKnownType);
    if (!item || seen.has(item.i)) continue;
    seen.add(item.i);
    items.push(item);
  }
  return { id, name: trimmed, layout: compact(items.slice(0, MAX_WIDGETS_PER_DASHBOARD)) };
}

/** Descarta solo lo inválido; `active` sobrevive si es fijo o apunta a un tablero que también. */
function sanitize(value: unknown, isKnownType: (type: string) => boolean): DashboardsState {
  const raw = isRecord(value) && Array.isArray(value.dashboards) ? value.dashboards : [];
  const seen = new Set<string>();
  const dashboards: Dashboard[] = [];
  for (const entry of raw) {
    const dashboard = sanitizeDashboard(entry, isKnownType);
    if (!dashboard || seen.has(dashboard.id)) continue;
    seen.add(dashboard.id);
    dashboards.push(dashboard);
  }
  const active = isRecord(value) && typeof value.active === "string" ? value.active : "";
  return {
    version: STORAGE_VERSION,
    active: seen.has(active) || isFixedDashboard(active) ? active : DEFAULT_DASHBOARD_ID,
    dashboards: dashboards.slice(0, MAX_DASHBOARDS),
  };
}

/** Solo existe la versión corriente: cualquier otra cae al estado por defecto. */
function migrate(value: unknown): unknown {
  return isRecord(value) && value.version === STORAGE_VERSION ? value : null;
}

function highestSuffix(ids: string[], pattern: RegExp): number {
  return ids.reduce((max, id) => {
    const match = pattern.exec(id);
    return match?.[1] ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

/** Los contadores siguen al estado cargado para no repetir ids ya usados. */
function syncCounters(value: DashboardsState): void {
  dashboardCounter = highestSuffix(
    value.dashboards.map((dashboard) => dashboard.id),
    /^d(\d+)$/,
  );
  widgetCounter = highestSuffix(
    value.dashboards.flatMap((dashboard) => dashboard.layout.map((item) => item.i)),
    /^w(\d+)$/,
  );
}

export function resetStore(next?: DashboardsState): void {
  if (!next) {
    setState(defaultState());
    return;
  }
  syncCounters(next);
  setState(next);
}

/**
 * Carga el estado persistido: JSON corrupto o versión desconocida caen al estado
 * por defecto; de un JSON con forma se conserva lo válido y se descarta el resto.
 */
export function loadFromStorage(isKnownType: (type: string) => boolean): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    resetStore();
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    resetStore();
    return;
  }
  const migrated = migrate(parsed);
  if (migrated === null) {
    resetStore();
    return;
  }
  resetStore(sanitize(migrated, isKnownType));
}
