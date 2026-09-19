/**
 * Modelo de tableros: «Principal» fijo más los tableros de usuario, cada uno con
 * hasta cuatro widgets colocados en celdas de una rejilla de 24 columnas por 24
 * filas. La altura de fila y los huecos son cosa de la capa visual (`grid-math.ts`);
 * aquí solo viven celdas enteras.
 */

export type LayoutItem = {
  i: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Empresa fijada en el widget; `null` sigue la selección global. */
  entity: string | null;
};

export type Dashboard = { id: string; name: string; layout: LayoutItem[] };

/** Solo tableros de usuario: «Principal» se genera siempre y no se persiste. */
export type DashboardsState = { version: number; active: string; dashboards: Dashboard[] };

/** Columnas y filas del modelo: el layout persistido se guarda en estas celdas, así
 *  que viven aquí y no en la hoja. Las columnas deben cuadrar con `--grid-cols`. */
export const GRID_COLUMNS = 24;
export const GRID_ROWS = 24;
export const MAX_WIDGETS_PER_DASHBOARD = 4;
export const MAX_DASHBOARDS = 8;
export const MAIN_DASHBOARD_ID = "main";
export const STORAGE_KEY = "xray.dashboards.v1";
export const STORAGE_VERSION = 1;
