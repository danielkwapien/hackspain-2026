import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import "@/widgets/register-all";
import { AddWidgetButton } from "@/components/AddWidgetButton";
import { addWidget, createDashboard, getState, resetStore, selectActiveDashboard } from "./store";
import type { LayoutItem } from "./types";

/** Los nueve del catálogo, en el orden de `register-all` (XR-032). */
const CATALOG_TITLES = [
  "Búsquedas",
  "Investigación",
  "Investigación profunda",
  "Comparativa",
  "Alertas",
  "Mapa",
  "Grupo",
  "Favoritos",
  "Cartera",
  "Operar",
];

function layout(): LayoutItem[] {
  return selectActiveDashboard(getState()).layout;
}

function renderCatalog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <p>Fuera del menú</p>
        <AddWidgetButton />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function openMenu() {
  return screen.getByRole("menu", { name: "Añadir widget" });
}

describe("catálogo de widgets", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    if (!createDashboard("Pruebas")) throw new Error("No se pudo crear el tablero de pruebas");
  });

  it("DADO un tablero de usuario vacío CUANDO clic en «Añadir widget» ENTONCES menú con 10 menuitem en orden companies…trade, foco en el primero, con miniatura y descripción", async () => {
    const user = userEvent.setup();
    renderCatalog();

    const button = screen.getByRole("button", { name: "Añadir widget" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    const menu = openMenu();
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(CATALOG_TITLES.length);
    expect(items[0]).toHaveFocus();
    for (const [index, title] of CATALOG_TITLES.entries()) {
      expect(items[index]).toHaveTextContent(title);
      expect(items[index].querySelector("svg")).not.toBeNull();
    }
    expect(items[3]).toHaveTextContent("Dos empresas en una sola gráfica.");
    expect(items[4]).toHaveTextContent("Bandeja de alertas del motor, la más reciente arriba.");
    expect(items[7]).toHaveTextContent("Empresas y grupos marcados con estrella.");
    expect(items[8]).toHaveTextContent("Posiciones simuladas: importe, score y tendencia.");
    expect(items[9]).toHaveTextContent(
      "Simular una oferta o una reclamación de deuda sobre una sociedad.",
    );
  });

  it("DADO el menú CUANDO ↓↓↓ Enter ENTONCES se añade compare 12×10 y el menú se cierra con el foco en el botón", async () => {
    const user = userEvent.setup();
    renderCatalog();
    const button = screen.getByRole("button", { name: "Añadir widget" });

    await user.click(button);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(within(openMenu()).getAllByRole("menuitem")[3]).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(layout()).toHaveLength(1);
    expect(layout()[0]).toMatchObject({ type: "compare", w: 12, h: 10, x: 0, y: 0, entity: null });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");

    // Home / End y Espacio también funcionan.
    await user.click(button);
    await user.keyboard("{End}");
    expect(within(openMenu()).getAllByRole("menuitem")[9]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(within(openMenu()).getAllByRole("menuitem")[0]).toHaveFocus();
    await user.keyboard(" ");
    expect(layout()).toHaveLength(2);
    expect(layout()[1]).toMatchObject({ type: "companies", w: 12, h: 24 });
  });

  it("DADO el menú CUANDO Escape / clic fuera ENTONCES se cierra sin añadir", async () => {
    const user = userEvent.setup();
    renderCatalog();
    const button = screen.getByRole("button", { name: "Añadir widget" });

    await user.click(button);
    expect(openMenu()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();

    await user.click(button);
    expect(openMenu()).toBeInTheDocument();
    await user.click(screen.getByText("Fuera del menú"));
    expect(screen.queryByRole("menu")).toBeNull();

    expect(layout()).toHaveLength(0);
  });

  it("DADO 3 widgets CUANDO se añade el 4.º ENTONCES el botón pasa a disabled", async () => {
    const user = userEvent.setup();
    for (let index = 0; index < 3; index += 1) {
      if (!addWidget({ type: "compare", w: 6, h: 4 })) throw new Error("addWidget devolvió null");
    }
    renderCatalog();
    const button = screen.getByRole("button", { name: "Añadir widget" });
    expect(button).toBeEnabled();

    await user.click(button);
    await user.click(within(openMenu()).getByRole("menuitem", { name: /Alertas/ }));

    expect(layout()).toHaveLength(4);
    expect(layout()[3]).toMatchObject({ type: "alerts", w: 8, h: 12 });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Máximo 4 widgets por tablero");
  });
});
