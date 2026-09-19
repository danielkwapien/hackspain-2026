import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetSelection } from "@/dashboard/selection";
import { resetStore } from "@/dashboard/store";
import { metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi, renderRoute } from "@/test/helpers";

/** Los dos widgets del tablero fijo «Empresa», el activo por defecto en `/`. */
const PANELS = ["Investigación", "Investigación profunda"];

const FIXED_TITLE = "Este tablero es fijo: crea uno con «Añadir página»";

function renderShell() {
  mockApi([
    { match: "/api/v2/meta", body: metaFixture },
    { match: "/api/v2/universe", body: universeFixture },
  ]);
  return renderRoute("/");
}

function searchTrigger(banner: HTMLElement): HTMLElement {
  const button = within(banner)
    .getAllByRole("button")
    .find((candidate) => candidate.getAttribute("aria-haspopup") === "dialog");
  if (!button) throw new Error("La topbar no monta el disparador del buscador");
  return button;
}

describe("marco de la aplicación", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    resetSelection();
  });

  it("topbar: marca, buscador central que abre el diálogo y el indicador de mock", async () => {
    const user = userEvent.setup();
    renderShell();

    const banner = screen.getByRole("banner");
    expect(banner).toHaveTextContent("X-Ray");
    expect(`${banner.getAttribute("style") ?? ""} ${banner.className}`).toContain("size-topbar");

    // Sin input global: el buscador es un disparador centrado que abre un diálogo.
    expect(screen.queryByRole("textbox", { name: "Buscar empresa" })).toBeNull();
    const trigger = searchTrigger(banner);
    expect(trigger).toHaveTextContent("Buscar empresa o grupo…");
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Buscar empresa o grupo" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(await screen.findByRole("status")).toHaveTextContent("Mock v1 · corte 08/2026");
  });

  it("topbar: marca, tablist con Empresa e Investigación, Añadir página, Añadir widget deshabilitado en fijos, sin banner de datos simulados", async () => {
    renderShell();
    await screen.findByRole("status");

    const banner = screen.getByRole("banner");
    const tablist = within(banner).getByRole("tablist", { name: "Tableros" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Empresa", "Investigación"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    expect(within(banner).getByRole("button", { name: "Añadir página" })).toBeEnabled();
    const addWidget = within(banner).getByRole("button", { name: "Añadir widget" });
    expect(addWidget).toBeDisabled();
    expect(addWidget).toHaveAttribute("title", FIXED_TITLE);

    expect(screen.queryByText(/Datos simulados/)).toBeNull();
    expect(screen.queryByText(/Leyenda/)).toBeNull();
  });

  it("orb layer and spotlight behind the content, hidden from assistive tech", () => {
    renderShell();

    const orb = document.querySelector("[data-orb]");
    expect(orb).not.toBeNull();
    expect(orb).toHaveAttribute("aria-hidden", "true");

    const spotlight = document.querySelector("[data-orb] [data-spotlight]");
    expect(spotlight).not.toBeNull();
  });

  it("«Empresa» en /: dos regiones Investigación e Investigación profunda con animate-panel-enter y sin asas de resize", () => {
    renderShell();

    for (const name of PANELS) {
      const region = screen.getByRole("region", { name });
      expect(region).toHaveClass("animate-panel-enter", "motion-reduce:animate-none");
    }
    expect(screen.getAllByRole("region")).toHaveLength(PANELS.length);
    expect(screen.queryByRole("region", { name: "Empresas" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Comparativa" })).toBeNull();

    // Un fijo: ni items enfocables, ni asa de resize, ni menú del widget.
    expect(document.querySelectorAll('[data-grid-item][role="group"]')).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Redimensionar widget" })).toBeNull();
    expect(document.querySelector("[data-resize-handle]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Menú del widget" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Maximizar widget" })).toHaveLength(
      PANELS.length,
    );
  });

  it("pestaña Investigación: seis regiones Mapa, Empresas, Favoritos, Cartera, Comparativa y Alertas", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("tab", { name: "Investigación" }));

    for (const name of ["Mapa", "Empresas", "Favoritos", "Cartera", "Comparativa", "Alertas"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("region")).toHaveLength(6);
    expect(document.querySelector("[data-resize-handle]")).toBeNull();
  });
});
