/**
 * Store de selección: la empresa y el grupo seleccionados, los dos slots de la
 * comparativa y la búsqueda global. Existe porque esa selección cruza los paneles
 * (Empresas la escribe, Comparativa e Investigación la leen) y ninguno es dueño
 * de ella.
 *
 * No persiste: el demo arranca siempre limpio. Un solo objeto inmutable en
 * memoria y suscripción con `useSyncExternalStore`, como `store.ts`.
 */

import { useSyncExternalStore } from "react";

/** Slot de la comparativa: 0 = A, 1 = B. */
export type CompareSlot = 0 | 1;

export type SelectionState = {
  selected: string | null;
  selectedGroup: string | null;
  /** `[A, B]`; A vacío significa «sigue a `selected`» en Comparativa. */
  compare: [string | null, string | null];
  search: string;
};

const listeners = new Set<() => void>();

function defaultState(): SelectionState {
  return { selected: null, selectedGroup: null, compare: [null, null], search: "" };
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

export function selectGroup(id: string | null): void {
  setState({ ...state, selectedGroup: id });
}

/** Escribe un slot; si el id ya está en el otro, ese otro se vacía: nunca A = B. */
export function setCompareSlot(slot: CompareSlot, id: string | null): void {
  const other: CompareSlot = slot === 0 ? 1 : 0;
  const compare: SelectionState["compare"] = [...state.compare];
  compare[slot] = id;
  if (id !== null && compare[other] === id) compare[other] = null;
  setState({ ...state, compare });
}

export function clearCompare(): void {
  setState({ ...state, compare: [null, null] });
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
