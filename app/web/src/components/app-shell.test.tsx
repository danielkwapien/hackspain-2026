import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getSelection, resetSelection } from "@/dashboard/selection";
import { metaFixture, universeFixture } from "@/test/fixtures/v2";
import { mockApi, renderRoute } from "@/test/helpers";

const PANELS = ["Empresas", "Comparativa", "Investigación"];

function renderShell() {
  mockApi([
    { match: "/api/v2/meta", body: metaFixture },
    { match: "/api/v2/universe", body: universeFixture },
  ]);
  return renderRoute("/");
}

describe("marco de la aplicación", () => {
  beforeEach(() => {
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

  it("no tabs, no widget catalog and no simulated-data banner", async () => {
    renderShell();
    await screen.findByRole("status");

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir widget" })).toBeNull();
    expect(screen.queryByText(/Datos simulados/)).toBeNull();
  });

  it("orb layer behind the content, hidden from assistive tech", () => {
    renderShell();

    const orb = document.querySelector("[data-orb]");
    expect(orb).not.toBeNull();
    expect(orb).toHaveAttribute("aria-hidden", "true");
  });

  it("three panels as named regions with the enter animation under motion-reduce", () => {
    renderShell();

    for (const name of PANELS) {
      const region = screen.getByRole("region", { name });
      expect(region).toHaveClass("animate-panel-enter", "motion-reduce:animate-none");
    }
  });
});
