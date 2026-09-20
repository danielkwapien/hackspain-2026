/**
 * Tablero fijo «Investigación»: siete widgets en dos filas (13 + 11) que cubren
 * la rejilla 24 × 24 sin solapes. Las alturas dejan un cuerpo de al menos 300 px
 * a 1440 × 900 (fila de 26 px). `entity: null` en todos.
 *
 * XR-038 (W4.1): «Operar» entra en la primera fila y Favoritos baja a la
 * segunda, entre Cartera y Comparativa. Comparativa se queda en 8 porque declara
 * `minSize: { w: 8 }`, así que el ancho lo pagan Cartera (6), Favoritos (5) y
 * Alertas (5). Las dos filas suman 24 columnas exactas.
 */

import type { Dashboard } from "../types";

export const INVESTIGACION: Dashboard = {
  id: "investigacion",
  name: "Investigación",
  layout: [
    { i: "inv-treemap", type: "treemap", x: 0, y: 0, w: 8, h: 13, entity: null },
    { i: "inv-companies", type: "companies", x: 8, y: 0, w: 10, h: 13, entity: null },
    { i: "inv-trade", type: "trade", x: 18, y: 0, w: 6, h: 13, entity: null },
    { i: "inv-portfolio", type: "portfolio", x: 0, y: 13, w: 6, h: 11, entity: null },
    { i: "inv-favorites", type: "favorites", x: 6, y: 13, w: 5, h: 11, entity: null },
    { i: "inv-compare", type: "compare", x: 11, y: 13, w: 8, h: 11, entity: null },
    { i: "inv-alerts", type: "alerts", x: 19, y: 13, w: 5, h: 11, entity: null },
  ],
};
