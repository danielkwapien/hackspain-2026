/**
 * Modelo del tablero de widgets: rejilla, espacios de trabajo y vínculo por color.
 *
 * El layout se mide en celdas de una rejilla de 24 columnas; la altura de fila y
 * los huecos son cosa de la capa visual, aquí solo viven celdas enteras.
 */

export type EntityKind = "company" | "group";

export type Entity = { kind: EntityKind; id: string; name?: string };

/** Color del vínculo entre widgets; `gray` significa "sin vínculo". */
export type LinkGroup = "green" | "blue" | "orange" | "gray";

export type LayoutItem = {
  i: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Un widget de una sola entidad guarda un array de uno. */
  entities: Entity[];
  linkGroup: LinkGroup;
};

export type Workspace = { id: string; name: string; presetId: string; layout: LayoutItem[] };

export type DashboardState = { version: number; workspaces: Workspace[]; active: string };

export const GRID_COLUMNS = 24;
export const STORAGE_KEY = "xray.dashboard.v1";
export const STORAGE_VERSION = 1;
