/**
 * Store del tablero: estado único en memoria, suscripción con
 * `useSyncExternalStore` y persistencia versionada en `localStorage`.
 *
 * No hay librería de estado: el tablero es un solo objeto inmutable y cada
 * acción lo reemplaza, compacta la rejilla y persiste. El layout se resuelve
 * como en el "vertical compact" de react-grid-layout: el item movido gana su
 * sitio, los que solapa bajan y después todo flota hacia arriba.
 */

import { useSyncExternalStore } from "react";
import { GRID_COLUMNS, STORAGE_KEY, STORAGE_VERSION } from "./types";
import type { DashboardState, Entity, LayoutItem, LinkGroup, Workspace } from "./types";

type Rect = { x: number; y: number; w: number; h: number };

const DEFAULT_PRESET_ID = "default";

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

/** Ids deterministas (`w1`, `ws1`, …): los tests no dependen de `randomUUID`. */
let widgetCounter = 0;
let workspaceCounter = 0;

function nextWidgetId(): string {
  widgetCounter += 1;
  return `w${widgetCounter}`;
}

function nextWorkspaceId(): string {
  workspaceCounter += 1;
  return `ws${workspaceCounter}`;
}

function presetLayout(): LayoutItem[] {
  return [
    {
      i: nextWidgetId(),
      type: "screener",
      x: 0,
      y: 0,
      w: 16,
      h: 14,
      entities: [],
      linkGroup: "green",
    },
    {
      i: nextWidgetId(),
      type: "score-card",
      x: 16,
      y: 0,
      w: 8,
      h: 8,
      entities: [],
      linkGroup: "green",
    },
  ];
}

function defaultState(): DashboardState {
  widgetCounter = 0;
  workspaceCounter = 0;
  return {
    version: STORAGE_VERSION,
    active: "ws-cartera",
    workspaces: [
      { id: "ws-cartera", name: "Cartera", presetId: DEFAULT_PRESET_ID, layout: presetLayout() },
      { id: "ws-research", name: "Research", presetId: DEFAULT_PRESET_ID, layout: [] },
      { id: "ws-monitor", name: "Monitor", presetId: DEFAULT_PRESET_ID, layout: [] },
    ],
  };
}

let state: DashboardState = defaultState();

function setState(next: DashboardState): void {
  state = next;
  persist();
  for (const listener of listeners) listener();
}

export function getState(): DashboardState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function selectActiveWorkspace(value: DashboardState): Workspace {
  const found = value.workspaces.find((workspace) => workspace.id === value.active);
  return found ?? value.workspaces[0];
}

/** El selector debe devolver valores estables (primitivas o referencias del estado). */
export function useDashboard<T>(selector: (value: DashboardState) => T): T {
  const snapshot = () => selector(state);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useActiveWorkspace(): Workspace {
  return useDashboard(selectActiveWorkspace);
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
/* Mutaciones del espacio activo                                       */
/* ------------------------------------------------------------------ */

function activeLayout(): LayoutItem[] {
  return selectActiveWorkspace(state).layout;
}

function writeWorkspace(id: string, layout: LayoutItem[]): void {
  setState({
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === id ? { ...workspace, layout } : workspace,
    ),
  });
}

/** Resuelve colisiones alrededor de `movedId` (si lo hay), compacta y persiste. */
function commitLayout(layout: LayoutItem[], movedId?: string): void {
  const resolved = movedId ? pushDown(layout, movedId) : layout;
  writeWorkspace(selectActiveWorkspace(state).id, compact(resolved));
}

function copyEntities(entities: Entity[]): Entity[] {
  return entities.map((entity) => ({ ...entity }));
}

export function addWidget(input: {
  type: string;
  w: number;
  h: number;
  entities?: Entity[];
  linkGroup?: LinkGroup;
}): string {
  const layout = activeLayout();
  const w = clamp(input.w, 1, GRID_COLUMNS);
  const h = Math.max(1, Math.round(input.h));
  const item: LayoutItem = {
    i: nextWidgetId(),
    type: input.type,
    ...firstFreeSlot(layout, w, h),
    w,
    h,
    entities: copyEntities(input.entities ?? []),
    linkGroup: input.linkGroup ?? "gray",
  };
  commitLayout([...layout, item], item.i);
  return item.i;
}

export function moveWidget(i: string, pos: { x: number; y: number }): void {
  const layout = activeLayout();
  if (!layout.some((item) => item.i === i)) return;
  commitLayout(
    layout.map((item) =>
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
  const layout = activeLayout();
  const target = layout.find((item) => item.i === i);
  if (!target) return;
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
    layout.map((item) => (item.i === i ? next : item)),
    i,
  );
}

export function duplicateWidget(i: string): string {
  const layout = activeLayout();
  const source = layout.find((item) => item.i === i);
  if (!source) return "";
  const copy: LayoutItem = {
    ...source,
    i: nextWidgetId(),
    ...firstFreeSlot(layout, source.w, source.h),
    entities: copyEntities(source.entities),
  };
  commitLayout([...layout, copy], copy.i);
  return copy.i;
}

export function removeWidget(i: string): void {
  const layout = activeLayout();
  if (!layout.some((item) => item.i === i)) return;
  commitLayout(layout.filter((item) => item.i !== i));
}

export function setLinkGroup(i: string, linkGroup: LinkGroup): void {
  const layout = activeLayout();
  if (!layout.some((item) => item.i === i)) return;
  commitLayout(layout.map((item) => (item.i === i ? { ...item, linkGroup } : item)));
}

/** Propaga la entidad por el vínculo; `gray` es "sin vínculo" y solo cambia su widget. */
export function setEntities(i: string, entities: Entity[]): void {
  const layout = activeLayout();
  const target = layout.find((item) => item.i === i);
  if (!target) return;
  const linked = (item: LayoutItem): boolean =>
    target.linkGroup === "gray" ? item.i === i : item.linkGroup === target.linkGroup;
  commitLayout(
    layout.map((item) => (linked(item) ? { ...item, entities: copyEntities(entities) } : item)),
  );
}

/* ------------------------------------------------------------------ */
/* Espacios de trabajo                                                 */
/* ------------------------------------------------------------------ */

export function createWorkspace(name: string): string {
  const workspace: Workspace = {
    id: nextWorkspaceId(),
    name,
    presetId: DEFAULT_PRESET_ID,
    layout: [],
  };
  setState({ ...state, workspaces: [...state.workspaces, workspace] });
  return workspace.id;
}

export function renameWorkspace(id: string, name: string): void {
  if (!state.workspaces.some((workspace) => workspace.id === id)) return;
  setState({
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === id ? { ...workspace, name } : workspace,
    ),
  });
}

export function reorderWorkspaces(from: number, to: number): void {
  const workspaces = [...state.workspaces];
  if (from < 0 || from >= workspaces.length) return;
  const [moved] = workspaces.splice(from, 1);
  if (!moved) return;
  workspaces.splice(clamp(to, 0, workspaces.length), 0, moved);
  setState({ ...state, workspaces });
}

export function setActiveWorkspace(id: string): void {
  if (!state.workspaces.some((workspace) => workspace.id === id)) return;
  setState({ ...state, active: id });
}

/** Reescribe el espacio activo con el layout del preset. Solo existe `default`. */
export function applyPreset(presetId: string): void {
  if (presetId !== DEFAULT_PRESET_ID) return;
  const active = selectActiveWorkspace(state);
  setState({
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === active.id ? { ...workspace, presetId, layout: presetLayout() } : workspace,
    ),
  });
}

/* ------------------------------------------------------------------ */
/* Persistencia                                                        */
/* ------------------------------------------------------------------ */

function persist(): void {
  // En modo privado o sin `localStorage` el tablero sigue vivo en memoria.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* sin persistencia */
  }
}

function isWorkspace(value: unknown): value is Workspace {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Workspace>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.presetId === "string" &&
    Array.isArray(candidate.layout)
  );
}

function isDashboardState(value: unknown): value is DashboardState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DashboardState>;
  if (candidate.version !== STORAGE_VERSION) return false;
  if (typeof candidate.active !== "string") return false;
  if (!Array.isArray(candidate.workspaces) || candidate.workspaces.length === 0) return false;
  if (!candidate.workspaces.every(isWorkspace)) return false;
  return candidate.workspaces.some((workspace) => workspace.id === candidate.active);
}

function highestSuffix(ids: string[], pattern: RegExp): number {
  return ids.reduce((max, id) => {
    const match = pattern.exec(id);
    return match?.[1] ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

/** Los contadores siguen al estado cargado para no repetir ids ya usados. */
function syncCounters(value: DashboardState): void {
  workspaceCounter = highestSuffix(
    value.workspaces.map((workspace) => workspace.id),
    /^ws(\d+)$/,
  );
  widgetCounter = highestSuffix(
    value.workspaces.flatMap((workspace) => workspace.layout.map((item) => item.i)),
    /^w(\d+)$/,
  );
}

export function resetStore(next?: DashboardState): void {
  if (!next) {
    setState(defaultState());
    return;
  }
  syncCounters(next);
  setState(next);
}

/** Carga el estado persistido; cualquier forma o versión inesperada cae al preset. */
export function loadFromStorage(): void {
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
  if (!isDashboardState(parsed)) {
    resetStore();
    return;
  }
  resetStore(parsed);
}
