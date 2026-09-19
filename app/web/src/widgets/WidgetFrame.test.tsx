import { beforeEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import {
  addWidget,
  createDashboard,
  getState,
  resetStore,
  selectActiveDashboard,
} from "@/dashboard/store";
import type { LayoutItem } from "@/dashboard/types";
import { companyFixtureFor, universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";
import { WidgetFrame } from "./WidgetFrame";
import { registerWidget } from "./registry";

const MENDIVE = { id: "COMP_0002", name: "Talleres Mendive S.A." };

function TestContent({ item }: { item: LayoutItem }): ReactElement {
  return <div>Contenido de {item.i}</div>;
}

function Thumb(): ReactElement {
  return <svg aria-hidden="true" />;
}

function defineTestWidget(type: string, title: string, needsEntity: boolean): void {
  registerWidget({
    type,
    title,
    description: "Widget de prueba",
    defaultSize: { w: 8, h: 6 },
    minSize: { w: 4, h: 4 },
    needsEntity,
    thumbnail: Thumb,
    component: TestContent,
  });
}

defineTestWidget("test-sin-entidad", "Salud de la cartera", false);
defineTestWidget("test-research", "Investigación", true);

function layout(): LayoutItem[] {
  return selectActiveDashboard(getState()).layout;
}

function widget(i: string): LayoutItem {
  const found = layout().find((candidate) => candidate.i === i);
  if (!found) throw new Error(`No existe el widget ${i}`);
  return found;
}

function mustAdd(type: string, entity: string | null = null): string {
  const id = addWidget({ type, w: 8, h: 6, entity });
  if (!id) throw new Error(`addWidget devolvió null para ${type}`);
  return id;
}

function renderFrame(i: string, locked = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WidgetFrame
          item={widget(i)}
          locked={locked}
          isMaximized={false}
          onMaximize={() => {}}
          index={0}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Marco de widget", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    if (!createDashboard("Pruebas")) throw new Error("No se pudo crear el tablero de pruebas");
    mockApi([
      { match: `/api/v2/companies/${MENDIVE.id}`, body: companyFixtureFor(MENDIVE.id) },
      { match: "/api/v2/universe", body: universeFixture },
    ]);
  });

  it("DADO un widget sin entidad CUANDO se monta ENTONCES región nombrada, Maximizar y Menú accesibles, sin «Elegir empresa»", () => {
    const id = mustAdd("test-sin-entidad");
    renderFrame(id);

    const region = screen.getByRole("region", { name: "Salud de la cartera" });
    expect(region).toHaveClass("animate-panel-enter");
    expect(within(region).getByText(`Contenido de ${id}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maximizar widget" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menú del widget" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Elegir empresa/ })).toBeNull();
    expect(region.querySelector("[data-widget-drag-handle]")).not.toBeNull();
  });

  it("DADO un widget CUANDO se pinta su cabecera ENTONCES el título usa --text-widget-title y la fila mide --size-row", () => {
    // XR-037 (E4): el título del widget pesaba lo mismo (14 px) que el nombre de la
    // entidad analizada; sube a los 18 px del token que ya existía sin consumidor.
    const id = mustAdd("test-sin-entidad");
    renderFrame(id);

    const title = screen.getByRole("heading", { name: "Salud de la cartera" });
    expect(title.className).toContain("text-[length:var(--text-widget-title)]");
    expect(title.className).not.toContain("--text-panel-title");

    const handle = title.closest("[data-widget-drag-handle]");
    expect(handle?.getAttribute("style")).toContain("var(--size-row)");
  });

  it("DADO Investigación con entity=null CUANDO se monta ENTONCES el trigger dice «Selección» y al elegir COMP_0002 el store guarda entity y el trigger muestra su nombre", async () => {
    const user = userEvent.setup();
    const id = mustAdd("test-research");
    renderFrame(id);

    const trigger = screen.getByRole("button", { name: /^Elegir empresa/ });
    expect(trigger).toHaveTextContent("Selección");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Buscar empresa" })).toHaveFocus();
    const option = await screen.findByRole("option", { name: /Talleres Mendive/ });
    await user.click(option);

    expect(widget(id).entity).toBe(MENDIVE.id);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(await screen.findByRole("button", { name: /^Elegir empresa/ })).toHaveTextContent(
      MENDIVE.name,
    );
  });

  it("DADO entidad fijada CUANDO «Seguir la selección global» ENTONCES entity vuelve a null", async () => {
    const user = userEvent.setup();
    const id = mustAdd("test-research", MENDIVE.id);
    renderFrame(id);

    const trigger = await screen.findByRole("button", { name: /^Elegir empresa/ });
    await waitFor(() => expect(trigger).toHaveTextContent(MENDIVE.name));

    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Seguir la selección global" }));

    expect(widget(id).entity).toBeNull();
    expect(screen.getByRole("button", { name: /^Elegir empresa/ })).toHaveTextContent("Selección");
  });

  it("DADO el menú CUANDO Duplicar / Quitar ENTONCES el store añade / elimina; con 4 widgets Duplicar está deshabilitado", async () => {
    const user = userEvent.setup();
    const id = mustAdd("test-sin-entidad");
    renderFrame(id);
    const menuButton = screen.getByRole("button", { name: "Menú del widget" });
    expect(menuButton).toHaveAttribute("aria-haspopup", "menu");

    await user.click(menuButton);
    const menu = screen.getByRole("menu", { name: "Acciones del widget" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Duplicar",
      "Quitar",
    ]);
    await user.click(within(menu).getByRole("menuitem", { name: "Duplicar" }));
    expect(layout()).toHaveLength(2);
    expect(layout()[1]).toMatchObject({ type: "test-sin-entidad", w: 8, h: 6 });
    expect(screen.queryByRole("menu")).toBeNull();

    // Con el tablero lleno, Duplicar no puede añadir.
    mustAdd("test-sin-entidad");
    mustAdd("test-sin-entidad");
    expect(layout()).toHaveLength(4);
    await user.click(menuButton);
    const duplicate = screen.getByRole("menuitem", { name: "Duplicar" });
    expect(duplicate).toBeDisabled();
    expect(duplicate).toHaveAttribute("title", "Máximo 4 widgets por tablero");
    await user.click(duplicate);
    expect(layout()).toHaveLength(4);

    // Quitar elimina sin confirmación.
    await user.click(screen.getByRole("menuitem", { name: "Quitar" }));
    expect(layout().some((candidate) => candidate.i === id)).toBe(false);
    expect(layout()).toHaveLength(3);
  });

  it("DADO locked=true ENTONCES sin «Menú del widget», sin cursor-grab, «Elegir empresa» deshabilitado; Maximizar sigue", async () => {
    const id = mustAdd("test-research");
    renderFrame(id, true);

    expect(screen.queryByRole("button", { name: "Menú del widget" })).toBeNull();
    expect(screen.getByRole("button", { name: "Maximizar widget" })).toBeInTheDocument();

    const region = screen.getByRole("region", { name: "Investigación" });
    const handle = region.querySelector<HTMLElement>("[data-widget-drag-handle]");
    expect(handle?.className ?? "").not.toMatch(/cursor-grab/);

    const trigger = await screen.findByRole("button", { name: /^Elegir empresa/ });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("title", "En un tablero fijo la ficha sigue la selección");
  });

  it("DADO el menú abierto CUANDO Escape ENTONCES se cierra y el foco vuelve al botón", async () => {
    const user = userEvent.setup();
    const id = mustAdd("test-sin-entidad");
    renderFrame(id);
    const menuButton = screen.getByRole("button", { name: "Menú del widget" });

    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "Acciones del widget" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(menuButton).toHaveFocus();
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(layout()).toHaveLength(1);
  });
});
