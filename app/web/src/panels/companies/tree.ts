/**
 * Aritmética pura del panel Empresas: el árbol grupos → filiales aplanado en la
 * lista que recorre el virtualizador, y el tamaño de página que cabe en el alto.
 * Sin React: `tree.test.ts` lo fija.
 */

import type { GroupUniverseItem, UniverseItem } from "@/lib/api-v2";

export type TreeRow =
  | { kind: "group"; item: GroupUniverseItem }
  | { kind: "company"; item: UniverseItem; parent: string | null; level: 1 | 2 }
  | { kind: "loading"; parent: string }
  | { kind: "error"; parent: string }
  /** Cabecera de sección del buscador («Empresas» tras los grupos que casan). */
  | { kind: "section"; label: string };

/**
 * Los grupos en el orden recibido (el servidor ya ordena) y, bajo cada grupo
 * desplegado, sus filiales tal como las publica `/groups/:id` (por score). Un grupo
 * desplegado sin filiales todavía pinta una fila de carga; uno cuya consulta ha
 * fallado, una fila de error.
 */
export function flattenTree(
  groups: readonly GroupUniverseItem[],
  expanded: ReadonlySet<string>,
  children: ReadonlyMap<string, readonly UniverseItem[]>,
  failed: ReadonlySet<string> = new Set(),
): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const group of groups) {
    rows.push({ kind: "group", item: group });
    if (!expanded.has(group.id)) continue;
    const companies = children.get(group.id);
    if (companies) {
      for (const item of companies) {
        rows.push({ kind: "company", item, parent: group.id, level: 2 });
      }
    } else if (failed.has(group.id)) {
      rows.push({ kind: "error", parent: group.id });
    } else {
      rows.push({ kind: "loading", parent: group.id });
    }
  }
  return rows;
}

/** La vista `Empresa`: una fila de nivel 1 por empresa, sin padre. */
export function flatRows(items: readonly UniverseItem[]): TreeRow[] {
  return items.map((item) => ({ kind: "company", item, parent: null, level: 1 }));
}

const MIN_PAGE_SIZE = 10;
/** Tope de `limit` en la API. */
const MAX_PAGE_SIZE = 500;

/** Filas enteras que caben en `height`, acotadas a lo que la API admite. */
export function pageSizeFor(height: number, rowHeight: number): number {
  const fit = Math.floor(height / rowHeight);
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, fit));
}
