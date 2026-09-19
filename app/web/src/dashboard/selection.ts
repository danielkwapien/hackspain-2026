/**
 * Store de selección: la empresa seleccionada, las empresas a comparar y la
 * búsqueda global. Existe porque esa selección cruza los tres paneles
 * (Empresas la escribe, Comparativa e Investigación la leen) y ninguno es
 * dueño de ella.
 *
 * No persiste: el demo arranca siempre limpio. Un solo objeto inmutable en
 * memoria y suscripción con `useSyncExternalStore`, como `store.ts`.
 */

import { useSyncExternalStore } from "react";

export type SelectionState = { selected: string | null; compare: string[]; search: string };

export const MAX_COMPARE = 5;

const listeners = new Set<() => void>();

function defaultState(): SelectionState {
  return { selected: null, compare: [], search: "" };
}

let state: SelectionState = defaultState();

function setState(next: SelectionState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getSelection(): SelectionState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function select(id: string | null): void {
  setState({ ...state, selected: id });
}

/** Añade al final si no está (con `MAX_COMPARE` ya, ignora); quita si está. */
export function toggleCompare(id: string): void {
  if (state.compare.includes(id)) {
    removeCompare(id);
    return;
  }
  if (state.compare.length >= MAX_COMPARE) return;
  setState({ ...state, compare: [...state.compare, id] });
}

export function removeCompare(id: string): void {
  if (!state.compare.includes(id)) return;
  setState({ ...state, compare: state.compare.filter((item) => item !== id) });
}

export function setSearch(value: string): void {
  setState({ ...state, search: value });
}

export function resetSelection(): void {
  setState(defaultState());
}

const identity = (value: SelectionState): SelectionState => value;

/** El selector debe devolver valores estables (primitivas o referencias del estado). */
export function useSelection<T = SelectionState>(
  selector: (value: SelectionState) => T = identity as (value: SelectionState) => T,
): T {
  const snapshot = () => selector(state);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
