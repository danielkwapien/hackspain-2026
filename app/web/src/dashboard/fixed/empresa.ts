/**
 * Tablero fijo «Empresa»: la ficha en profundidad de una empresa o grupo.
 * Investigación a la izquierda e Investigación profunda a la derecha, cada una
 * a media anchura y toda la altura. `entity: null`: ambas siguen la selección.
 */

import type { Dashboard } from "../types";

export const EMPRESA: Dashboard = {
  id: "empresa",
  name: "Empresa",
  layout: [
    { i: "empresa-research", type: "research", x: 0, y: 0, w: 12, h: 24, entity: null },
    { i: "empresa-deep", type: "research-deep", x: 12, y: 0, w: 12, h: 24, entity: null },
  ],
};
