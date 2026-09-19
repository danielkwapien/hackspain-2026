/**
 * Tablero fijo «Investigación»: seis widgets en dos filas (13 + 11) que cubren
 * la rejilla 24 × 24 sin solapes. Las alturas dejan un cuerpo de al menos 300 px
 * a 1440 × 900 (fila de 26 px). `entity: null` en todos.
 */

import type { Dashboard } from "../types";

export const INVESTIGACION: Dashboard = {
  id: "investigacion",
  name: "Investigación",
  layout: [
    { i: "inv-treemap", type: "treemap", x: 0, y: 0, w: 8, h: 13, entity: null },
    { i: "inv-companies", type: "companies", x: 8, y: 0, w: 10, h: 13, entity: null },
    { i: "inv-favorites", type: "favorites", x: 18, y: 0, w: 6, h: 13, entity: null },
    { i: "inv-portfolio", type: "portfolio", x: 0, y: 13, w: 8, h: 11, entity: null },
    { i: "inv-compare", type: "compare", x: 8, y: 13, w: 10, h: 11, entity: null },
    { i: "inv-alerts", type: "alerts", x: 18, y: 13, w: 6, h: 11, entity: null },
  ],
};
