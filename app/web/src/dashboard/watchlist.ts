/**
 * Watchlist: los favoritos del usuario (empresas o grupos) y la cartera de demo.
 *
 * Los favoritos son una lista de ids en orden de inserción, en memoria y con
 * `useSyncExternalStore`, persistida en `localStorage` bajo `xray.watchlist.v1`
 * (`{ version, favorites }`), como los tableros en `store.ts`. Sin clave guardada la
 * lista arranca con la semilla del plan **sin escribirla**: el usuario que la vacía
 * y recarga la encuentra vacía, no resembrada. La cartera es una constante: XR-032
 * no la edita ni la persiste.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "xray.watchlist.v1";
const STORAGE_VERSION = 1;

/** Más favoritos no caben en el widget y el buscador ya cubre el resto. */
const MAX_FAVORITES = 50;

/** Ids del dataset: `COMP_0001`, `GROUP_0147`. Lo demás se descarta al cargar. */
export const ENTITY_ID = /^(COMP|GROUP)_\d{4}$/;

/** Semilla: las cinco empresas con informe de Health y un grupo de tres filiales. */
export const DEFAULT_FAVORITES: readonly string[] = [
  "COMP_0007",
  "COMP_0001",
  "COMP_0004",
  "COMP_0003",
  "COMP_0002",
  "GROUP_0147",
];

export type PortfolioPosition = { id: string; amount: number };

/** Cartera de demo en EUR, por importe descendente. Constante: no se edita. */
export const PORTFOLIO: readonly PortfolioPosition[] = [
  { id: "COMP_0007", amount: 1_250_000 },
  { id: "COMP_0001", amount: 840_000 },
  { id: "COMP_0008", amount: 620_000 },
  { id: "COMP_0003", amount: 450_000 },
  { id: "COMP_0004", amount: 300_000 },
  { id: "COMP_0002", amount: 180_000 },
];

type Stored = { version: number; favorites: string[] };

const listeners = new Set<() => void>();

let favorites: readonly string[] = DEFAULT_FAVORITES;

function setFavorites(next: readonly string[]): void {
  favorites = next;
  for (const listener of listeners) listener();
}

/** Las mutaciones del usuario persisten; cargar o reiniciar la lista, no. */
function persist(): void {
  const stored: Stored = { version: STORAGE_VERSION, favorites: [...favorites] };
  // En modo privado o sin `localStorage` la lista sigue viva en memoria.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* sin persistencia */
  }
}

export function getWatchlist(): readonly string[] {
  return favorites;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isFavorite(id: string): boolean {
  return favorites.includes(id);
}

/** Añade al final o quita; persiste en los dos casos. */
export function toggleFavorite(id: string): void {
  setFavorites(isFavorite(id) ? favorites.filter((entry) => entry !== id) : [...favorites, id]);
  persist();
}

export function useWatchlist(): readonly string[] {
  return useSyncExternalStore(subscribe, getWatchlist, getWatchlist);
}

export function useIsFavorite(id: string): boolean {
  const snapshot = () => isFavorite(id);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Solo ids con forma, sin duplicados y con tope: lo que no casa se descarta en silencio. */
function sanitize(candidates: unknown[]): string[] {
  const valid = candidates.filter(
    (entry): entry is string => typeof entry === "string" && ENTITY_ID.test(entry),
  );
  return [...new Set(valid)].slice(0, MAX_FAVORITES);
}

function parseStored(raw: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { version, favorites: stored } = parsed as Partial<Stored>;
  if (version !== STORAGE_VERSION || !Array.isArray(stored)) return null;
  return sanitize(stored);
}

/**
 * Carga la lista persistida: sin clave, JSON corrupto o versión ajena → la semilla
 * (sin escribirla); con forma → los ids válidos, aunque sean ninguno.
 */
export function loadWatchlist(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  const stored = raw === null ? null : parseStored(raw);
  setFavorites(stored ?? DEFAULT_FAVORITES);
}

/** Reinicia la lista en memoria (la semilla por defecto) sin tocar `localStorage`. */
export function resetWatchlist(ids: readonly string[] = DEFAULT_FAVORITES): void {
  setFavorites([...ids]);
}
