import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Topbar } from "@/components/topbar";
import { resetSelection } from "@/dashboard/selection";
import { addWidget, createDashboard, getState, resetStore, setActiveDashboard } from "@/dashboard/store";
import { MAX_DASHBOARDS, MAX_WIDGETS_PER_DASHBOARD, STORAGE_KEY } from "@/dashboard/types";
import { metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi } from "@/test/helpers";

/** Las dos pestañas fijas, siempre delante de las de usuario. */
const FIXED_TABS = ["Empresa", "Investigación"];

const FIXED_TITLE = "Este tablero es fijo: crea uno con «Añadir página»";

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

function searchTrigger(): HTMLElement {
  const button = screen
    .getAllByRole("button")
    .find((candidate) => candidate.getAttribute("aria-haspopup") === "dialog");
  if (!button) throw new Error("La topbar no monta el disparador del buscador");
  return button;
}

describe("topbar", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    resetSelection();
  });

  it("DADO el store limpio CUANDO se monta ENTONCES tablist «Tableros» con Empresa seleccionada e Investigación, «Añadir página» habilitado y «Añadir widget» deshabilitado con el title de tablero fijo", () => {
    renderTopbar();

    const tablist = screen.getByRole("tablist", { name: "Tableros" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(FIXED_TABS);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");

    expect(screen.getByRole("button", { name: "Añadir página" })).toBeEnabled();

    const addWidgetButton = screen.getByRole("button", { name: "Añadir widget" });
    expect(addWidgetButton).toBeDisabled();
    expect(addWidgetButton).toHaveAttribute("title", FIXED_TITLE);
    expect(addWidgetButton).toHaveAttribute("aria-haspopup", "menu");

    expect(screen.getByRole("banner")).toHaveTextContent("X-Ray");
    expect(screen.queryByRole("button", { name: /^Quitar tablero/ })).toBeNull();
  });

  it("DADO la topbar ENTONCES el buscador es el disparador centrado (aria-haspopup=dialog) y ya no hay input «Buscar empresa»", () => {
    renderTopbar();

    const banner = screen.getByRole("banner");
    expect(banner.className).toContain("relative");
    const button = searchTrigger();
    expect(banner.contains(button)).toBe(true);
    expect(button).toHaveTextContent("Buscar empresa o grupo…");
    expect(button.className).toContain("left-1/2");
    expect(screen.queryByRole("textbox", { name: "Buscar empresa" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("DADO clic en la pestaña Investigación ENTONCES pasa a activa y «Añadir widget» sigue deshabilitado como fijo", async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole("tab", { name: "Investigación" }));

    expect(getState().active).toBe("investigacion");
    expect(screen.getByRole("tab", { name: "Investigación" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Empresa" })).toHaveAttribute("aria-selected", "false");
    const addWidgetButton = screen.getByRole("button", { name: "Añadir widget" });
    expect(addWidgetButton).toBeDisabled();
    expect(addWidgetButton).toHaveAttribute("title", FIXED_TITLE);
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
    expect(tabNames()).toEqual([...FIXED_TABS, "Tesorería"]);
    expect(screen.getByRole("tab", { name: "Tesorería" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Empresa" })).toHaveAttribute("aria-selected", "false");
    expect(getState().dashboards[0].name).toBe("Tesorería");
    expect(localStorage.getItem(STORAGE_KEY) ?? "").toContain("Tesorería");
    expect(screen.getByRole("button", { name: "Añadir widget" })).toBeEnabled();
  });

  it("DADO un tablero de usuario activo CUANDO doble clic ENTONCES input inline; Escape cancela; los fijos no se renombran", async () => {
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
    expect(tabNames()).toEqual([...FIXED_TABS, "Pruebas"]);
    expect(getState().dashboards[0].name).toBe("Pruebas");

    // Los fijos no se renombran: el doble clic no abre nada.
    await user.dblClick(screen.getByRole("tab", { name: "Empresa" }));
    expect(screen.queryByRole("textbox", { name: "Nombre del tablero" })).toBeNull();
    await user.dblClick(screen.getByRole("tab", { name: "Investigación" }));
    expect(screen.queryByRole("textbox", { name: "Nombre del tablero" })).toBeNull();
  });

  it("DADO 8 tableros ENTONCES «Añadir página» deshabilitado con title «Máximo 8 tableros»", () => {
    for (let index = 0; index < MAX_DASHBOARDS; index += 1) mustCreate();
    renderTopbar();

    expect(tabNames()).toHaveLength(MAX_DASHBOARDS + FIXED_TABS.length);
    const button = screen.getByRole("button", { name: "Añadir página" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Máximo 8 tableros");
  });

  it("DADO un tablero de usuario activo CUANDO «Quitar tablero …» ENTONCES desaparece y «Empresa» queda seleccionada", async () => {
    const user = userEvent.setup();
    mustCreate("Pruebas");
    renderTopbar();
    expect(screen.getByRole("tab", { name: "Pruebas" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: "Quitar tablero Pruebas" }));

    expect(tabNames()).toEqual(FIXED_TABS);
    expect(screen.getByRole("tab", { name: "Empresa" })).toHaveAttribute("aria-selected", "true");
    expect(getState().active).toBe("empresa");
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

    // Volver a un fijo cambia el motivo, no el estado.
    act(() => setActiveDashboard("empresa"));
    expect(screen.getByRole("button", { name: "Añadir widget" })).toHaveAttribute("title", FIXED_TITLE);
  });
});
