import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { registerWidget } from "@/widgets/registry";
import { Grid } from "@/dashboard/Grid";
import { STORAGE_VERSION } from "./types";
import type { Dashboard, LayoutItem } from "./types";
import { EMPRESA, INVESTIGACION } from "./fixed";
import { columnWidth, gridMetrics, rowHeight } from "./grid-math";
import { getState, resetStore, selectActiveDashboard, subscribe } from "./store";

/* jsdom no implementa la captura de puntero. El espía importa: capturar el
   puntero es justo lo que le roba el `click` al contenido del widget. */
const setPointerCapture = vi.fn();

/* Pasos de arrastre en píxeles. `FakeResizeObserver` (setup.ts) mide el lienzo
   a 800 × 600: una celda horizontal son `columnWidth(800)` + gap y una vertical
   `rowHeight(600)` + gap. */
const COL_PX = columnWidth(800) + gridMetrics().gap;
const ROW_PX = rowHeight(600) + gridMetrics().gap;

const EMPRESA_TITLES = ["Investigación", "Investigación profunda"];
const INVESTIGACION_TITLES = ["Mapa", "Empresas", "Favoritos", "Cartera", "Comparativa", "Alertas"];

function StubContent(): ReactElement {
  return <p>Contenido del widget</p>;
}

function Thumb(): ReactElement {
  return <svg aria-hidden="true" />;
}

/* Los tipos de los dos tableros fijos y uno de prueba, como stubs: el lienzo se
   prueba sin depender de los paneles reales. */
for (const [type, title] of [
  ["companies", "Empresas"],
  ["research", "Investigación"],
  ["research-deep", "Investigación profunda"],
  ["compare", "Comparativa"],
  ["alerts", "Alertas"],
  ["treemap", "Mapa"],
  ["favorites", "Favoritos"],
  ["portfolio", "Cartera"],
  ["probe", "Sonda"],
]) {
  registerWidget({
    type,
    title,
    description: `Stub de ${title}`,
    defaultSize: { w: 6, h: 6 },
    minSize: { w: 4, h: 4 },
    needsEntity: false,
    thumbnail: Thumb,
    component: StubContent,
  });
}

function layout(): LayoutItem[] {
  return selectActiveDashboard(getState()).layout;
}

/** Tablero de usuario activo con los items dados; devuelve el `Dashboard` a montar. */
function userDashboard(items: LayoutItem[]): Dashboard {
  const dashboard: Dashboard = { id: "d-test", name: "Pruebas", layout: items };
  resetStore({ version: STORAGE_VERSION, active: "d-test", dashboards: [dashboard] });
  return selectActiveDashboard(getState());
}

function oneWidget(): Dashboard {
  return userDashboard([{ i: "w1", type: "probe", x: 2, y: 0, w: 6, h: 6, entity: null }]);
}

function twoWidgets(): Dashboard {
  return userDashboard([
    { i: "w1", type: "probe", x: 0, y: 0, w: 6, h: 6, entity: null },
    { i: "w2", type: "probe", x: 15, y: 0, w: 8, h: 6, entity: null },
  ]);
}

function gridItem(i: string): HTMLElement {
  const item = document.querySelector<HTMLElement>(`[data-grid-item="${i}"]`);
  if (!item) throw new Error(`No hay item de rejilla para ${i}`);
  return item;
}

function dragHandle(item: HTMLElement): HTMLElement {
  const handle = item.querySelector<HTMLElement>("[data-widget-drag-handle]");
  if (!handle) throw new Error("El marco del widget no expone asa de arrastre");
  return handle;
}

function renderGrid(dashboard: Dashboard, locked: boolean) {
  mockApi([
    { match: "/api/v2/universe", body: universeFixture },
    { match: "/api/v2/meta", body: metaFixture },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Grid dashboard={dashboard} locked={locked} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Grid", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    setPointerCapture.mockClear();
    Element.prototype.setPointerCapture = setPointerCapture;
    Element.prototype.releasePointerCapture = () => {};
  });

  it('DADO «Investigación» CUANDO se monta ENTONCES seis regiones Mapa/Empresas/Favoritos/Cartera/Comparativa/Alertas con animate-panel-enter, sin role="group" enfocable, sin asa y Shift+flecha no toca el store', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    renderGrid(INVESTIGACION, true);

    for (const name of INVESTIGACION_TITLES) {
      const region = screen.getByRole("region", { name });
      expect(region).toHaveClass("animate-panel-enter", "motion-reduce:animate-none");
    }
    expect(screen.getAllByRole("region")).toHaveLength(INVESTIGACION_TITLES.length);
    expect(screen.queryAllByRole("group")).toHaveLength(0);
    expect(document.querySelector("[tabindex='0'][data-grid-item]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Redimensionar widget" })).toBeNull();
    expect(document.querySelector("[data-resize-handle]")).toBeNull();

    const companies = gridItem("inv-companies");
    fireEvent.keyDown(companies, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(screen.getByRole("region", { name: "Empresas" }), {
      key: "ArrowRight",
      shiftKey: true,
    });
    fireEvent.pointerDown(dragHandle(companies), { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(dragHandle(companies), { clientX: 100 + COL_PX * 3, clientY: 100 });
    fireEvent.pointerUp(dragHandle(companies), { clientX: 100 + COL_PX * 3, clientY: 100 });

    expect(listener).not.toHaveBeenCalled();
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(INVESTIGACION.layout).toHaveLength(6);
    expect(localStorage.getItem("xray.dashboards.v1")).toBeNull();
    unsubscribe();
  });

  it("DADO «Empresa» CUANDO se monta ENTONCES dos regiones Investigación e Investigación profunda a toda altura y sin asa", () => {
    renderGrid(EMPRESA, true);

    for (const name of EMPRESA_TITLES) {
      const region = screen.getByRole("region", { name });
      expect(region).toHaveClass("animate-panel-enter", "motion-reduce:animate-none");
    }
    expect(screen.getAllByRole("region")).toHaveLength(EMPRESA_TITLES.length);
    expect(gridItem("empresa-research").style.gridRow).toBe("1 / span 24");
    expect(gridItem("empresa-deep").style.gridColumn).toBe("13 / span 12");
    expect(screen.queryAllByRole("group")).toHaveLength(0);
    expect(document.querySelector("[data-resize-handle]")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Maximizar widget" })).toHaveLength(2);
  });

  it("DADO un tablero de usuario CUANDO se arrastra la cabecera 5 columnas ENTONCES el store recibe x+5 una sola vez al soltar y durante el arrastre el item lleva transform", () => {
    renderGrid(oneWidget(), false);
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    const item = gridItem("w1");
    const handle = dragHandle(item);
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { clientX: 100 + COL_PX * 5, clientY: 100 });

    // Mientras se arrastra solo se mueve el DOM: el store sigue intacto.
    expect(item.style.transform).toMatch(/translate/);
    expect(listener).not.toHaveBeenCalled();
    expect(layout()[0]).toMatchObject({ i: "w1", x: 2 });

    fireEvent.pointerUp(handle, { clientX: 100 + COL_PX * 5, clientY: 100 });

    // `y` no se mueve: con un solo widget la compactación vertical lo sube a 0.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(layout()[0]).toMatchObject({ i: "w1", x: 7, y: 0, w: 6, h: 6 });
    unsubscribe();
  });

  it("DADO un tablero de usuario CUANDO se arrastra el asa 3 col × 2 filas ENTONCES w+3, h+2 respetando minSize", () => {
    renderGrid(oneWidget(), false);

    const handle = screen.getByRole("button", { name: "Redimensionar widget" });
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { clientX: 100 + COL_PX * 3, clientY: 100 + ROW_PX * 2 });
    fireEvent.pointerUp(handle, { clientX: 100 + COL_PX * 3, clientY: 100 + ROW_PX * 2 });
    expect(layout()[0]).toMatchObject({ i: "w1", x: 2, w: 9, h: 8 });

    // Por debajo del mínimo del tipo (4 × 4) el asa no baja más.
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { clientX: 100 - COL_PX * 8, clientY: 100 - ROW_PX * 8 });
    fireEvent.pointerUp(handle, { clientX: 100 - COL_PX * 8, clientY: 100 - ROW_PX * 8 });
    expect(layout()[0]).toMatchObject({ i: "w1", x: 2, w: 4, h: 4 });
  });

  it("DADO el item enfocado CUANDO Shift+← / Shift+Alt+← / ← ENTONCES mueve / redimensiona / nada; Enter maximiza y Escape restaura", () => {
    renderGrid(twoWidgets(), false);

    const items = screen.getAllByRole("group");
    expect(items).toHaveLength(2);
    const card = items[1];
    expect(card).toHaveAttribute("tabindex", "0");
    card.focus();
    expect(card).toHaveFocus();

    // Mayús + flecha mueve una celda.
    fireEvent.keyDown(card, { key: "ArrowLeft", shiftKey: true });
    expect(layout()[1]).toMatchObject({ i: "w2", x: 14, w: 8 });

    // Mayús + Alt + flecha redimensiona una celda.
    fireEvent.keyDown(card, { key: "ArrowLeft", shiftKey: true, altKey: true });
    expect(layout()[1]).toMatchObject({ i: "w2", x: 14, w: 7 });

    // Sin modificador la flecha no toca el layout.
    fireEvent.keyDown(card, { key: "ArrowLeft" });
    expect(layout()[1]).toMatchObject({ x: 14, w: 7 });

    // Enter maximiza: solo queda su widget a la vista; Escape restaura.
    expect(screen.getAllByRole("button", { name: "Maximizar widget" })).toHaveLength(2);
    fireEvent.keyDown(card, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Restaurar widget" })).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(card.querySelector("[role='region']")).not.toBeNull();

    fireEvent.keyDown(card, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Restaurar widget" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Maximizar widget" })).toHaveLength(2);
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("DADO un clic en el contenido CUANDO pointerdown fuera del asa ENTONCES no se captura el puntero y el onClick del contenido llega", () => {
    const onRowClick = vi.fn();
    registerWidget({
      type: "click-probe",
      title: "Sonda de clic",
      description: "Pinta una fila que no es un botón",
      defaultSize: { w: 6, h: 6 },
      minSize: { w: 2, h: 2 },
      needsEntity: false,
      thumbnail: Thumb,
      component: () => (
        <div role="row" onClick={onRowClick}>
          Fila de prueba
        </div>
      ),
    });
    renderGrid(
      userDashboard([{ i: "w1", type: "click-probe", x: 2, y: 0, w: 6, h: 6, entity: null }]),
      false,
    );

    const row = screen.getByRole("row");
    const notCancelled = fireEvent.pointerDown(row, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.click(row);

    expect(onRowClick).toHaveBeenCalledTimes(1);
    /* En jsdom la captura es un stub y el clic llega igual; lo que en el
       navegador se lo come es que el lienzo cancele el evento y capture el
       puntero sobre contenido que no es asa de arrastre. */
    expect(notCancelled).toBe(true);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(layout()[0]).toMatchObject({ x: 2, y: 0 });
  });

  it("DADO «Empresa» CUANDO se maximiza un widget y se pulsa Escape en el documento ENTONCES se restaura", () => {
    renderGrid(EMPRESA, true);

    // En un fijo el item no es enfocable: el ratón maximiza y Escape debe valer igual.
    fireEvent.click(screen.getAllByRole("button", { name: "Maximizar widget" })[0]);
    expect(screen.getByRole("button", { name: "Restaurar widget" })).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Restaurar widget" })).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(EMPRESA_TITLES.length);
  });

  it("DADO un widget CUANDO se maximiza ENTONCES su contenedor lleva animate-crossfade y motion-reduce:animate-none; al restaurar la clase desaparece y los vecinos no repiten animate-panel-enter", () => {
    renderGrid(twoWidgets(), false);
    const [first, second] = [gridItem("w1"), gridItem("w2")];
    expect(first).not.toHaveClass("animate-crossfade");
    expect(second).not.toHaveClass("[&>[role=region]]:animate-none");

    fireEvent.click(screen.getAllByRole("button", { name: "Maximizar widget" })[0]);
    expect(first).toHaveClass("animate-crossfade", "motion-reduce:animate-none");
    expect(second).not.toHaveClass("animate-crossfade");

    fireEvent.click(screen.getByRole("button", { name: "Restaurar widget" }));
    expect(first).not.toHaveClass("animate-crossfade");
    expect(second).not.toHaveClass("animate-crossfade");
    // El marco de cada vecino sigue con su clase; el contenedor apaga la animación al volver.
    expect(second.querySelector("[role='region']")).toHaveClass("animate-panel-enter");
    expect(second).toHaveClass("[&>[role=region]]:animate-none");
  });

  it("DADO el lienzo con 600 px CUANDO se monta ENTONCES --grid-row: 20px y 24 filas; un tablero vacío muestra «Este tablero está vacío»", () => {
    const { container, unmount } = renderGrid(oneWidget(), false);

    const canvas = container.querySelector<HTMLElement>("[data-grid]");
    if (!canvas) throw new Error("El lienzo no expone [data-grid]");
    const style = canvas.getAttribute("style") ?? "";
    expect(style).toContain("--grid-row: 20px");
    expect(style).toContain("repeat(24, var(--grid-row))");
    expect(canvas.style.getPropertyValue("--grid-row")).toBe("20px");
    unmount();

    renderGrid(userDashboard([]), false);
    expect(screen.getByText("Este tablero está vacío")).toBeInTheDocument();
    expect(screen.getByText(/Añade hasta 4 widgets/)).toBeInTheDocument();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
  });
});
