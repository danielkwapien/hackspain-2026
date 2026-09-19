import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addWidget, getState, resetStore } from "@/dashboard/store";
import type { LayoutItem } from "@/dashboard/types";
import { universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { WidgetFrame } from "./WidgetFrame";
import { registerWidget } from "./registry";
import type { NeedsEntity, WidgetContentProps } from "./registry";

function TestContent({ item }: WidgetContentProps) {
  return <div>Contenido de {item.i}</div>;
}

function defineTestWidget(
  type: string,
  needsEntity: NeedsEntity,
  title: string,
  showsTypeTitle = false,
): void {
  registerWidget({
    type,
    title,
    description: "Widget de prueba",
    defaultSize: { w: 8, h: 6 },
    minSize: { w: 4, h: 4 },
    needsEntity,
    entityKinds: ["company"],
    maxEntities: needsEntity === "many" ? 3 : 1,
    showsTypeTitle,
    component: TestContent,
  });
}

function layout(): LayoutItem[] {
  const state = getState();
  const workspace = state.workspaces.find((candidate) => candidate.id === state.active);
  if (!workspace) throw new Error("No hay espacio activo");
  return workspace.layout;
}

function widget(i: string): LayoutItem {
  const found = layout().find((candidate) => candidate.i === i);
  if (!found) throw new Error(`No existe el widget ${i}`);
  return found;
}

function renderFrame(i: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WidgetFrame item={widget(i)} onMaximize={() => {}} />
    </QueryClientProvider>,
  );
}

describe("Marco de widget", () => {
  beforeEach(() => {
    resetStore();
    mockApi([{ match: "/api/v2/universe", body: universeFixture }]);
  });

  it("renders entity name as button and opens EntityPicker on click", async () => {
    const user = userEvent.setup();
    defineTestWidget("test-entity", "one", "Tarjeta de prueba");
    const id = addWidget({
      type: "test-entity",
      w: 8,
      h: 6,
      entities: [{ kind: "company", id: "COMP_0001", name: "Distribuciones Arga S.L." }],
    });

    renderFrame(id);

    const trigger = screen.getByRole("button", { name: "Cambiar empresa" });
    expect(trigger).toHaveTextContent("Distribuciones Arga S.L.");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    await user.click(trigger);

    const search = screen.getByRole("combobox", { name: "Buscar empresa o grupo" });
    expect(search).toHaveFocus();
    expect(await screen.findByRole("option", { name: /Talleres Mendive/ })).toBeInTheDocument();
  });

  it("shows type title when widget has no entity", () => {
    defineTestWidget("test-sin-entidad", "none", "Salud de la cartera");
    const id = addWidget({ type: "test-sin-entidad", w: 8, h: 6 });

    renderFrame(id);

    expect(screen.getByText("Salud de la cartera")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar empresa" })).not.toBeInTheDocument();
  });

  it("renders the registered component when no children are given", () => {
    defineTestWidget("test-contenido", "one", "Tarjeta de prueba");
    const id = addWidget({
      type: "test-contenido",
      w: 8,
      h: 6,
      entities: [{ kind: "company", id: "COMP_0001", name: "Distribuciones Arga S.L." }],
    });

    renderFrame(id);

    expect(screen.getByText(`Contenido de ${id}`)).toBeInTheDocument();
  });

  it("does not repeat the type title when the header already shows it", () => {
    defineTestWidget("test-titulo-repetido", "none", "Buscador de empresas", true);
    const id = addWidget({ type: "test-titulo-repetido", w: 8, h: 6 });

    renderFrame(id);

    expect(screen.getAllByText("Buscador de empresas")).toHaveLength(1);
  });

  it("menu duplicate/remove/change-link call store actions", async () => {
    const user = userEvent.setup();
    defineTestWidget("test-menu", "none", "Widget de menú");
    const id = addWidget({ type: "test-menu", w: 8, h: 6 });
    const before = layout().length;

    renderFrame(id);
    const menuButton = screen.getByRole("button", { name: "Menú del widget" });

    await user.click(menuButton);
    await user.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    expect(layout()).toHaveLength(before + 1);

    await user.click(menuButton);
    await user.click(screen.getByRole("menuitem", { name: "Cambiar vínculo" }));
    await user.click(screen.getByRole("menuitem", { name: "Azul" }));
    expect(widget(id).linkGroup).toBe("blue");

    // Eliminar pide confirmación en línea antes de tocar el store.
    await user.click(menuButton);
    await user.click(screen.getByRole("menuitem", { name: "Eliminar" }));
    expect(layout().some((candidate) => candidate.i === id)).toBe(true);
    await user.click(screen.getByRole("menuitem", { name: "Confirmar" }));
    expect(layout().some((candidate) => candidate.i === id)).toBe(false);
  });

  it("header controls have accessible names", () => {
    defineTestWidget("test-cabecera", "one", "Tarjeta de prueba");
    const id = addWidget({
      type: "test-cabecera",
      w: 8,
      h: 6,
      entities: [{ kind: "company", id: "COMP_0002", name: "Talleres Mendive S.A." }],
    });

    renderFrame(id);

    for (const name of [
      "Cambiar vínculo",
      "Cambiar empresa",
      "Maximizar widget",
      "Menú del widget",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
