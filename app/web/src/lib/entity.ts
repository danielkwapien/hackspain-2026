/**
 * Clase de una entidad por su id: el prefijo `GROUP_` es el único especial; cualquier
 * otro id se trata como empresa. Lo usan la selección (`resolveEntity`), la watchlist
 * y los widgets que aceptan empresa o grupo.
 */

export type EntityKind = "company" | "group";

const GROUP_PREFIX = "GROUP_";

export function isGroupId(id: string): boolean {
  return id.startsWith(GROUP_PREFIX);
}

export function kindOf(id: string): EntityKind {
  return isGroupId(id) ? "group" : "company";
}
