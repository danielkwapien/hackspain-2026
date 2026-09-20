import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_ID,
  EMPRESA,
  FIXED_DASHBOARDS,
  INVESTIGACION,
  fixedDashboard,
  isFixedDashboard,
} from "@/dashboard/fixed";
import { gridMetrics, rowHeight } from "@/dashboard/grid-math";
import { FIXED_DASHBOARD_IDS, GRID_COLUMNS, GRID_ROWS } from "@/dashboard/types";
import type { LayoutItem } from "@/dashboard/types";
import "@/widgets/register-all";
import { getWidget } from "@/widgets/registry";

/**
 * Disposición de «Investigación» (XR-038, W4.1), en celdas de la rejilla 24 × 24.
 * Siete widgets: Operar entra en la primera fila y Favoritos baja a la segunda,
 * entre Cartera y Comparativa. Comparativa se queda en 8 porque declara
 * `minSize: { w: 8 }`; el ajuste lo pagan Cartera, Favoritos y Alertas.
 */
const INVESTIGACION_LAYOUT: LayoutItem[] = [
  { i: "inv-treemap", type: "treemap", x: 0, y: 0, w: 8, h: 13, entity: null },
  { i: "inv-companies", type: "companies", x: 8, y: 0, w: 10, h: 13, entity: null },
  { i: "inv-trade", type: "trade", x: 18, y: 0, w: 6, h: 13, entity: null },
  { i: "inv-portfolio", type: "portfolio", x: 0, y: 13, w: 6, h: 11, entity: null },
  { i: "inv-favorites", type: "favorites", x: 6, y: 13, w: 5, h: 11, entity: null },
  { i: "inv-compare", type: "compare", x: 11, y: 13, w: 8, h: 11, entity: null },
  { i: "inv-alerts", type: "alerts", x: 19, y: 13, w: 5, h: 11, entity: null },
];

const EMPRESA_LAYOUT: LayoutItem[] = [
  { i: "empresa-research", type: "research", x: 0, y: 0, w: 12, h: 24, entity: null },
  { i: "empresa-deep", type: "research-deep", x: 12, y: 0, w: 12, h: 24, entity: null },
];

/** Cabecera del marco del widget (XR-031: 30 px). */
const WIDGET_HEADER = 30;

/** Alto del lienzo a 1440 × 900 con la topbar de 60 px. */
const CANVAS_HEIGHT = 840;

function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("tableros fijos", () => {
  it("DADO INVESTIGACION CUANDO se lee su layout ENTONCES siete widgets en el orden del plan, sin solapes, dentro de 24 columnas y cubriendo las 24 filas", () => {
    expect(INVESTIGACION.id).toBe("investigacion");
    expect(INVESTIGACION.name).toBe("Investigación");
    expect(INVESTIGACION.layout).toEqual(INVESTIGACION_LAYOUT);
    expect(INVESTIGACION.layout).toHaveLength(7);

    for (const item of INVESTIGACION.layout) {
      expect(item.x + item.w, item.i).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(item.y + item.h, item.i).toBeLessThanOrEqual(GRID_ROWS);
      for (const other of INVESTIGACION.layout) {
        if (other.i === item.i) continue;
        expect(overlaps(item, other), `${item.i} solapa con ${other.i}`).toBe(false);
      }
    }
    const cells = INVESTIGACION.layout.reduce((sum, item) => sum + item.w * item.h, 0);
    expect(cells).toBe(GRID_COLUMNS * GRID_ROWS);

    // Las dos filas suman 24 columnas EXACTAS: sin esto el tablero cubre las 576
    // celdas igual y deja un hueco en una fila y un desbordamiento en la otra.
    for (const y of [0, 13]) {
      const row = INVESTIGACION.layout.filter((item) => item.y === y);
      expect(row.reduce((sum, item) => sum + item.w, 0), `fila y=${y}`).toBe(GRID_COLUMNS);
    }
    expect(INVESTIGACION.layout.filter((item) => item.y === 0).map((item) => item.type)).toEqual([
      "treemap",
      "companies",
      "trade",
    ]);
    expect(INVESTIGACION.layout.filter((item) => item.y === 13).map((item) => item.type)).toEqual([
      "portfolio",
      "favorites",
      "compare",
      "alerts",
    ]);
  });

  it("DADO FIXED_DASHBOARDS ENTONCES son «Investigación» y «Empresa», el defecto es investigacion y fixedDashboard resuelve ambos y nada más", () => {
    // XR-037 (I0): Investigación es la primera pantalla de la demo, así que abre
    // primero y manda en el orden de todo el módulo.
    expect(FIXED_DASHBOARDS.map((dashboard) => dashboard.id)).toEqual(["investigacion", "empresa"]);
    expect(FIXED_DASHBOARDS.map((dashboard) => dashboard.name)).toEqual(["Investigación", "Empresa"]);
    expect(FIXED_DASHBOARD_IDS).toEqual(["investigacion", "empresa"]);
    expect(DEFAULT_DASHBOARD_ID).toBe("investigacion");

    expect(EMPRESA.layout).toEqual(EMPRESA_LAYOUT);
    expect(fixedDashboard("empresa")).toBe(EMPRESA);
    expect(fixedDashboard("investigacion")).toBe(INVESTIGACION);
    expect(fixedDashboard("main") ?? null).toBeNull();
    expect(fixedDashboard("d1") ?? null).toBeNull();

    expect(isFixedDashboard("empresa")).toBe(true);
    expect(isFixedDashboard("investigacion")).toBe(true);
    expect(isFixedDashboard("main")).toBe(false);
    expect(isFixedDashboard("d1")).toBe(false);
  });

  it("DADO un lienzo de 840 px CUANDO rowHeight ENTONCES 26 px y las dos filas de «Investigación» dejan un cuerpo de al menos 300 px", () => {
    const row = rowHeight(CANVAS_HEIGHT);
    expect(row).toBe(26);

    const { gap } = gridMetrics();
    const heights = new Set(INVESTIGACION.layout.map((item) => item.h));
    expect([...heights].sort((a, b) => a - b)).toEqual([11, 13]);
    for (const h of heights) {
      const body = h * row + (h - 1) * gap - WIDGET_HEADER;
      expect(body, `h${h}`).toBeGreaterThanOrEqual(300);
    }
  });

  it("DADO el registro completo CUANDO se comprueba cada item de EMPRESA e INVESTIGACION ENTONCES su tamaño respeta minSize del tipo registrado", () => {
    for (const dashboard of FIXED_DASHBOARDS) {
      for (const item of dashboard.layout) {
        const definition = getWidget(item.type);
        if (!definition) throw new Error(`${dashboard.id}: ${item.type} no está registrado`);
        const { minSize } = definition;
        expect(item.w, `${item.i} ancho ${item.w} < mínimo ${minSize.w}`).toBeGreaterThanOrEqual(minSize.w);
        expect(item.h, `${item.i} alto ${item.h} < mínimo ${minSize.h}`).toBeGreaterThanOrEqual(minSize.h);
      }
    }
  });
});
