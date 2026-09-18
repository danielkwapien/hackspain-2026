import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY, STORAGE_VERSION } from "./types";
import type { DashboardState } from "./types";
import {
  createWorkspace,
  getState,
  loadFromStorage,
  renameWorkspace,
  reorderWorkspaces,
  resetStore,
  setActiveWorkspace,
} from "./store";

function names(): string[] {
  return getState().workspaces.map((workspace) => workspace.name);
}

function readStorage(): DashboardState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error(`No hay nada persistido en ${STORAGE_KEY}`);
  return JSON.parse(raw) as DashboardState;
}

describe("workspaces", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it("create, rename, reorder and activate", () => {
    const id = createWorkspace("Tesoreria");
    expect(names()).toEqual(["Cartera", "Research", "Monitor", "Tesoreria"]);
    const created = getState().workspaces.find((workspace) => workspace.id === id);
    expect(created?.layout).toEqual([]);
    // Crear no cambia de espacio: eso lo decide `setActiveWorkspace`.
    expect(getState().active).not.toBe(id);

    renameWorkspace(id, "Tesoro");
    expect(names()).toEqual(["Cartera", "Research", "Monitor", "Tesoro"]);

    reorderWorkspaces(3, 0);
    expect(names()).toEqual(["Tesoro", "Cartera", "Research", "Monitor"]);

    setActiveWorkspace(id);
    expect(getState().active).toBe(id);
    // Un id inexistente no cambia el espacio activo.
    setActiveWorkspace("ws-que-no-existe");
    expect(getState().active).toBe(id);

    const stored = readStorage();
    expect(stored.active).toBe(id);
    expect(stored.workspaces.map((workspace) => workspace.name)).toEqual([
      "Tesoro",
      "Cartera",
      "Research",
      "Monitor",
    ]);
  });

  it('default preset "Cartera" on first load', () => {
    localStorage.clear();
    loadFromStorage();

    const state = getState();
    expect(state.version).toBe(STORAGE_VERSION);
    expect(names()).toEqual(["Cartera", "Research", "Monitor"]);

    const active = state.workspaces.find((workspace) => workspace.id === state.active);
    expect(active?.name).toBe("Cartera");
    expect(active?.presetId).toBe("default");
    expect(active?.layout).toMatchObject([
      { type: "screener", x: 0, y: 0, w: 16, h: 14, linkGroup: "green", entities: [] },
      { type: "score-card", x: 16, y: 0, w: 8, h: 8, linkGroup: "green", entities: [] },
    ]);

    const empty = state.workspaces.filter((workspace) => workspace.id !== state.active);
    expect(empty.map((workspace) => workspace.layout)).toEqual([[], []]);

    expect(readStorage().active).toBe(state.active);
  });
});
