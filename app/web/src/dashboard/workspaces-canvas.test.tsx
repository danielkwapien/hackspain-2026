import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { listWidgets, registerWidget } from "@/widgets/registry";
import { Canvas } from "./Canvas";
import { Topbar } from "./Topbar";
import type { LayoutItem } from "./types";
import { getState, resetStore } from "./store";

/** jsdom no implementa `ResizeObserver`; el lienzo solo lo usa para medir. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function StubContent(): ReactElement {
  return <p>Contenido del widget</p>;
}

/* Los dos tipos del preset por defecto, como stub: el lienzo se prueba sin
   depender de los widgets reales (`src/widgets/**`, otro ticket). */
registerWidget({
  type: "screener",
  title: "Buscador",
  description: "Tabla del universo",
  defaultSize: { w: 16, h: 14 },
  minSize: { w: 4, h: 4 },
  needsEntity: "none",
  entityKinds: ["company"],
  maxEntities: 1,
  showsTypeTitle: false,
  component: StubContent,
});

registerWidget({
  type: "score-card",
  title: "Tarjeta de score",
  description: "Score de una empresa",
  defaultSize: { w: 8, h: 8 },
  minSize: { w: 4, h: 4 },
  needsEntity: "none",
  entityKinds: ["company"],
  maxEntities: 1,
  showsTypeTitle: false,
  component: StubContent,
});

function layout(): LayoutItem[] {
  const state = getState();
  const active = state.workspaces.find((workspace) => workspace.id === state.active);
  return active ? active.layout : [];
}

function names(): string[] {
  return getState().workspaces.map((workspace) => workspace.name);
}

function renderWithProviders(ui: ReactElement): void {
  mockApi([
    { match: "/api/v2/universe", body: universeFixture },
    { match: "/api/v2/meta", body: metaFixture },
  ]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("tablero: espacios y lienzo", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  it("creates, renames, reorders and activates workspaces from the topbar", () => {
    renderWithProviders(<Topbar />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Cartera",
      "Research",
      "Monitor",
    ]);

    // Crear deja el nombre por defecto en renombrado.
    fireEvent.click(screen.getByRole("button", { name: "Añadir espacio" }));
    const created = screen.getByRole("textbox", { name: "Nombre del espacio" });
    expect(created).toHaveValue("Espacio 4");
    expect(created).toHaveFocus();
    fireEvent.change(created, { target: { value: "Tesoreria" } });
    fireEvent.keyDown(created, { key: "Enter" });
    expect(names()).toEqual(["Cartera", "Research", "Monitor", "Tesoreria"]);

    // Doble clic renombra en línea.
    fireEvent.doubleClick(screen.getByRole("tab", { name: "Research" }));
    const renamed = screen.getByRole("textbox", { name: "Nombre del espacio" });
    fireEvent.change(renamed, { target: { value: "Estudio" } });
    fireEvent.keyDown(renamed, { key: "Enter" });
    expect(names()).toEqual(["Cartera", "Estudio", "Monitor", "Tesoreria"]);

    // Arrastrar la última pestaña hasta la primera posición.
    const tabs = screen.getAllByRole("tab");
    fireEvent.pointerDown(tabs[3], { button: 0 });
    fireEvent.pointerEnter(tabs[0]);
    fireEvent.pointerUp(window);
    expect(names()).toEqual(["Tesoreria", "Cartera", "Estudio", "Monitor"]);

    const monitor = getState().workspaces.find((workspace) => workspace.name === "Monitor");
    fireEvent.click(screen.getByRole("tab", { name: "Monitor" }));
    expect(getState().active).toBe(monitor?.id);
    expect(screen.getByRole("tab", { name: "Monitor" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Tesoreria" })).toHaveAttribute("aria-selected", "false");
  });

  it("grid items are focusable and movable by keyboard with a modifier", () => {
    renderWithProviders(<Canvas />);

    const items = screen.getAllByRole("group");
    expect(items).toHaveLength(2);

    const card = items[1];
    expect(card).toHaveAttribute("tabindex", "0");
    card.focus();
    expect(card).toHaveFocus();

    // Mayús + flecha mueve una celda.
    fireEvent.keyDown(card, { key: "ArrowLeft", shiftKey: true });
    expect(layout()[1]).toMatchObject({ type: "score-card", x: 15, w: 8 });

    // Mayús + Alt + flecha redimensiona una celda.
    fireEvent.keyDown(card, { key: "ArrowLeft", shiftKey: true, altKey: true });
    expect(layout()[1]).toMatchObject({ type: "score-card", x: 15, w: 7 });

    // Sin modificador la flecha no toca el layout.
    fireEvent.keyDown(card, { key: "ArrowLeft" });
    expect(layout()[1]).toMatchObject({ x: 15, w: 7 });
  });

  it("maximize fills the canvas and Escape restores", () => {
    renderWithProviders(<Canvas />);

    expect(screen.getAllByRole("button", { name: "Maximizar widget" })).toHaveLength(2);

    const item = screen.getAllByRole("group")[0];
    item.focus();
    fireEvent.keyDown(item, { key: "Enter" });

    // Maximizado: solo queda su widget en el lienzo.
    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Restaurar widget" })).toBeInTheDocument();

    fireEvent.keyDown(item, { key: "Escape" });
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Maximizar widget" })).toHaveLength(2);
  });

  it("widget catalog adds a registered widget at its default size", () => {
    registerWidget({
      type: "catalog-probe",
      title: "Widget de prueba",
      description: "Solo existe para el catálogo",
      defaultSize: { w: 6, h: 5 },
      minSize: { w: 2, h: 2 },
      needsEntity: "none",
      entityKinds: ["company"],
      maxEntities: 1,
      showsTypeTitle: false,
      component: StubContent,
    });

    renderWithProviders(<Canvas />);
    expect(layout()).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Añadir widget" }));
    const dialog = screen.getByRole("dialog", { name: "Catálogo de widgets" });

    const first = listWidgets()[0];
    expect(within(dialog).getByRole("button", { name: new RegExp(first.title) })).toHaveFocus();

    const card = within(dialog).getByRole("button", { name: /Widget de prueba/ });
    expect(card).toHaveTextContent("6 × 5");
    fireEvent.click(card);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(layout()).toHaveLength(3);
    expect(layout()[2]).toMatchObject({ type: "catalog-probe", w: 6, h: 5 });
  });
});
