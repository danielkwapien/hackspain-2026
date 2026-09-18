import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { manifestFixture, monitorDemoFixture, monitorEngineFixture } from "@/test/fixtures";
import { mockApi, renderRoute } from "@/test/helpers";

const routes = [
  { match: "/api/v1/manifest", body: manifestFixture },
  { match: "/api/v1/monitor?demo=1", body: monitorDemoFixture },
  { match: "/api/v1/monitor", body: monitorEngineFixture },
];

describe("Monitor", () => {
  it("no muestra alertas de fixture cuando el modo demostración está desactivado", async () => {
    mockApi(routes);

    renderRoute("/monitor");

    expect(await screen.findByText("Motor pendiente")).toBeInTheDocument();
    expect(screen.queryByText(/Tres meses consecutivos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/DEMO/)).not.toBeInTheDocument();
    expect(screen.getByText("Desactivado")).toBeInTheDocument();
  });

  it("el modo demostración muestra el banner ámbar y las alertas del fixture", async () => {
    mockApi(routes);

    renderRoute("/monitor?demo=1");

    expect(await screen.findByText(/Tres meses consecutivos/)).toBeInTheDocument();
    expect(screen.getByText(/DEMO — datos sintéticos de ejemplo/)).toBeInTheDocument();
    expect(screen.getByText("Deterioro")).toBeInTheDocument();
    expect(screen.getByText("Severidad alta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "COMP_0047" })).toHaveAttribute(
      "href",
      "/companies/COMP_0047",
    );
    expect(screen.getByText("Meses consecutivos con neto negativo")).toBeInTheDocument();
  });
});
