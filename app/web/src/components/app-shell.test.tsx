import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getSelection, resetSelection } from "@/dashboard/selection";
import { resetStore } from "@/dashboard/store";
import { metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi, renderRoute } from "@/test/helpers";

const PANELS = ["Empresas", "Investigación", "Comparativa"];

function renderShell() {
  mockApi([
    { match: "/api/v2/meta", body: metaFixture },
    { match: "/api/v2/universe", body: universeFixture },
  ]);
  return renderRoute("/");
}

describe("marco de la aplicación", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    resetSelection();
  });

  it("topbar: brand, global search wired to the store and the mock indicator", async () => {
    const user = userEvent.setup();
    renderShell();

    const banner = screen.getByRole("banner");
    expect(banner).toHaveTextContent("X-Ray");
    expect(`${banner.getAttribute("style") ?? ""} ${banner.className}`).toContain("size-topbar");

    await user.type(screen.getByRole("textbox", { name: "Buscar empresa" }), "duero");
    await waitFor(() => expect(getSelection().search).toBe("duero"));

    expect(await screen.findByRole("status")).toHaveTextContent("Mock v1 · corte 08/2026");
  });

  it("topbar: marca, tablist con Principal, Añadir página, Añadir widget deshabilitado en Principal, sin banner de datos simulados", async () => {
    renderShell();
    await screen.findByRole("status");

    const banner = screen.getByRole("banner");
    const tablist = within(banner).getByRole("tablist", { name: "Tableros" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Principal"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    expect(within(banner).getByRole("button", { name: "Añadir página" })).toBeEnabled();
    const addWidget = within(banner).getByRole("button", { name: "Añadir widget" });
    expect(addWidget).toBeDisabled();
    expect(addWidget).toHaveAttribute(
      "title",
      "El tablero Principal es fijo: crea uno con «Añadir página»",
    );

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

  it("Principal: tres regiones con animate-panel-enter y sin asas de resize", () => {
    renderShell();

    for (const name of PANELS) {
      const region = screen.getByRole("region", { name });
      expect(region).toHaveClass("animate-panel-enter", "motion-reduce:animate-none");
    }
    expect(screen.getAllByRole("region")).toHaveLength(PANELS.length);

    // Principal es fijo: ni items enfocables, ni asa de resize, ni menú del widget.
    expect(screen.queryAllByRole("group")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Redimensionar widget" })).toBeNull();
    expect(document.querySelector("[data-resize-handle]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Menú del widget" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Maximizar widget" })).toHaveLength(
      PANELS.length,
    );
  });
});
