/**
 * Store de selección: la empresa y el grupo seleccionados, la entidad activa que
 * deriva de los dos, los slots de la comparativa y la búsqueda global. Existe porque
 * esa selección cruza los paneles (Empresas la escribe, Comparativa e Investigación
 * la leen) y ninguno es dueño de ella.
 *
 * `selectedEntity` es lo último elegido, empresa o grupo: `select(id)` la pone a
 * empresa y `selectGroup(id)` a grupo; vaciar uno solo la borra si apuntaba a él.
 * `selected` y `selectedGroup` siguen existiendo para los widgets que solo entienden
 * una de las dos clases (Empresas, Grupo, Comparativa).
 *
 * No persiste: el demo arranca siempre limpio. Un solo objeto inmutable en
 * memoria y suscripción con `useSyncExternalStore`, como `store.ts`.
 */

import { useSyncExternalStore } from "react";
import type { EntityKind } from "@/lib/entity";
import { kindOf } from "@/lib/entity";

/** Slot de la comparativa: 0 = A, 1 = B. */
export type CompareSlot = 0 | 1;

export type SelectedEntity = { kind: EntityKind; id: string };

export type SelectionState = {
  selected: string | null;
  selectedGroup: string | null;
  /** Lo último elegido en el buscador o en un widget, sea empresa o grupo. */
  selectedEntity: SelectedEntity | null;
  /** `[A, B]`; A vacío significa «sigue a `selected`» en Comparativa. */
  compare: [string | null, string | null];
  search: string;
};

const listeners = new Set<() => void>();

function defaultState(): SelectionState {
  return {
    selected: null,
    selectedGroup: null,
    selectedEntity: null,
    compare: [null, null],
    search: "",
  };
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

/** La entidad tras escribir `id` en la clase `kind`: `null` solo la vacía si era de esa clase. */
function entityAfter(kind: EntityKind, id: string | null): SelectedEntity | null {
  if (id !== null) return { kind, id };
  return state.selectedEntity?.kind === kind ? null : state.selectedEntity;
}

export function select(id: string | null): void {
  setState({ ...state, selected: id, selectedEntity: entityAfter("company", id) });
}

export function selectGroup(id: string | null): void {
  setState({ ...state, selectedGroup: id, selectedEntity: entityAfter("group", id) });
}

/**
 * La entidad que pinta un widget: la fijada en su `item.entity` (grupo si el id
 * empieza por `GROUP_`, empresa si no) o, sin fijar, la selección global.
 */
export function resolveEntity(
  pinned: string | null,
  selectedEntity: SelectedEntity | null,
): SelectedEntity | null {
  if (pinned === null) return selectedEntity;
  return { kind: kindOf(pinned), id: pinned };
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
