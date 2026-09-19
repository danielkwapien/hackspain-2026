import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Topbar } from "@/components/topbar";
import { resetSelection } from "@/dashboard/selection";
import { addWidget, createDashboard, getState, resetStore } from "@/dashboard/store";
import { MAX_DASHBOARDS, MAX_WIDGETS_PER_DASHBOARD, STORAGE_KEY } from "@/dashboard/types";
import { metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";

function renderTopbar() {
  mockApi([
    { match: "/api/v2/meta", body: metaFixture },
    { match: "/api/v2/universe", body: universeFixture },
  ]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Topbar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function tabNames(): string[] {
  return within(screen.getByRole("tablist", { name: "Tableros" }))
    .getAllByRole("tab")
    .map((tab) => tab.textContent ?? "");
}

function mustCreate(name?: string): string {
  const id = createDashboard(name);
  if (!id) throw new Error("createDashboard devolvió null");
  return id;
}

describe("topbar", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    resetSelection();
  });

  it("DADO el store limpio CUANDO se monta ENTONCES tablist «Tableros» con solo «Principal» seleccionada, «Añadir página» habilitado y «Añadir widget» deshabilitado con su title", () => {
    renderTopbar();

    const tablist = screen.getByRole("tablist", { name: "Tableros" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toHaveTextContent("Principal");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    expect(screen.getByRole("button", { name: "Añadir página" })).toBeEnabled();

    const addWidgetButton = screen.getByRole("button", { name: "Añadir widget" });
    expect(addWidgetButton).toBeDisabled();
    expect(addWidgetButton).toHaveAttribute(
      "title",
      "El tablero Principal es fijo: crea uno con «Añadir página»",
    );
    expect(addWidgetButton).toHaveAttribute("aria-haspopup", "menu");

    // El buscador y la marca siguen donde estaban.
    expect(screen.getByRole("banner")).toHaveTextContent("X-Ray");
    expect(screen.getByRole("textbox", { name: "Buscar empresa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Quitar tablero/ })).toBeNull();
  });

  it("DADO clic en «Añadir página» ENTONCES aparece «Tablero 1» activo en renombrado; Enter con «Tesorería» renombra y el store persiste", async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole("button", { name: "Añadir página" }));

    const input = screen.getByRole("textbox", { name: "Nombre del tablero" });
    expect(input).toHaveValue("Tablero 1");
    expect(input).toHaveFocus();
    expect(getState().dashboards).toHaveLength(1);
    expect(getState().active).toBe(getState().dashboards[0].id);

    await user.clear(input);
    await user.type(input, "Tesorería{Enter}");

    expect(screen.queryByRole("textbox", { name: "Nombre del tablero" })).toBeNull();
    expect(tabNames()).toEqual(["Principal", "Tesorería"]);
    expect(screen.getByRole("tab", { name: "Tesorería" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Principal" })).toHaveAttribute("aria-selected", "false");
    expect(getState().dashboards[0].name).toBe("Tesorería");
    expect(localStorage.getItem(STORAGE_KEY) ?? "").toContain("Tesorería");
    expect(screen.getByRole("button", { name: "Añadir widget" })).toBeEnabled();
  });

  it("DADO un tablero de usuario activo CUANDO doble clic ENTONCES input inline; Escape cancela", async () => {
    const user = userEvent.setup();
    mustCreate("Pruebas");
    renderTopbar();

    await user.dblClick(screen.getByRole("tab", { name: "Pruebas" }));
    const input = screen.getByRole("textbox", { name: "Nombre del tablero" });
    expect(input).toHaveValue("Pruebas");
    expect(input).toHaveFocus();

    await user.type(input, " cambiado");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "Nombre del tablero" })).toBeNull();
    expect(tabNames()).toEqual(["Principal", "Pruebas"]);
    expect(getState().dashboards[0].name).toBe("Pruebas");

    // «Principal» no se renombra: el doble clic no abre nada.
    await user.dblClick(screen.getByRole("tab", { name: "Principal" }));
    expect(screen.queryByRole("textbox", { name: "Nombre del tablero" })).toBeNull();
  });

  it("DADO 8 tableros ENTONCES «Añadir página» deshabilitado con title «Máximo 8 tableros»", () => {
    for (let index = 0; index < MAX_DASHBOARDS; index += 1) mustCreate();
    renderTopbar();

    expect(tabNames()).toHaveLength(MAX_DASHBOARDS + 1);
    const button = screen.getByRole("button", { name: "Añadir página" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Máximo 8 tableros");
  });

  it("DADO un tablero de usuario activo CUANDO «Quitar tablero …» ENTONCES desaparece y «Principal» queda seleccionada", async () => {
    const user = userEvent.setup();
    mustCreate("Pruebas");
    renderTopbar();
    expect(screen.getByRole("tab", { name: "Pruebas" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: "Quitar tablero Pruebas" }));

    expect(tabNames()).toEqual(["Principal"]);
    expect(screen.getByRole("tab", { name: "Principal" })).toHaveAttribute("aria-selected", "true");
    expect(getState().active).toBe("main");
    expect(getState().dashboards).toEqual([]);
    expect(screen.queryByRole("button", { name: /^Quitar tablero/ })).toBeNull();
  });

  it("DADO un tablero de usuario con 4 widgets ENTONCES «Añadir widget» deshabilitado con title «Máximo 4 widgets por tablero»", () => {
    mustCreate("Lleno");
    for (let index = 0; index < MAX_WIDGETS_PER_DASHBOARD; index += 1) {
      if (!addWidget({ type: "compare", w: 6, h: 4 })) throw new Error("addWidget devolvió null");
    }
    renderTopbar();

    const button = screen.getByRole("button", { name: "Añadir widget" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Máximo 4 widgets por tablero");
  });
});
