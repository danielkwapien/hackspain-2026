import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { manifestFixture } from "@/test/fixtures";
import { mockApi, renderRoute } from "@/test/helpers";

const CHART_TOKENS = [
  "--chart-score",
  "--chart-band",
  "--chart-positive",
  "--chart-negative",
  "--chart-neutral",
  "--chart-pillar-liquidity",
  "--chart-pillar-payments",
  "--chart-pillar-collections",
  "--chart-pillar-debt",
  "--chart-pillar-activity",
];

const REGIMES = [
  "--regime-improving",
  "--regime-deteriorating",
  "--regime-blip",
  "--regime-stable",
  "--regime-recovering",
  "--regime-warmup",
];

const BANDS = ["--band-solid", "--band-healthy", "--band-watch", "--band-stress"];

describe("Playground de tokens", () => {
  it("muestra las tres capas, la tipografía y la semántica de datos", async () => {
    mockApi([{ match: "/api/v1/manifest", body: manifestFixture }]);

    renderRoute("/tokens");

    expect(await screen.findByRole("heading", { name: "Tokens de X-Ray" })).toBeInTheDocument();
    for (const section of [
      "Primitivos",
      "Semánticos",
      "Componente",
      "Tipografía",
      "Regímenes",
      "Bandas",
      "Gráficas",
      "Contraste",
    ]) {
      expect(screen.getByRole("heading", { name: section })).toBeInTheDocument();
    }
  });

  it("muestra un swatch y una sparkline por régimen, las cuatro bandas y los diez tokens de gráfica", async () => {
    mockApi([{ match: "/api/v1/manifest", body: manifestFixture }]);

    renderRoute("/tokens");

    const regimes = await screen.findByRole("region", { name: "Regímenes" });
    for (const token of REGIMES) {
      expect(within(regimes).getByText(token)).toBeInTheDocument();
    }
    expect(within(regimes).getAllByRole("img", { name: /sparkline/i })).toHaveLength(REGIMES.length);

    const bands = screen.getByRole("region", { name: "Bandas" });
    for (const token of BANDS) {
      expect(within(bands).getByText(token)).toBeInTheDocument();
    }

    const charts = screen.getByRole("region", { name: "Gráficas" });
    for (const token of CHART_TOKENS) {
      expect(within(charts).getByText(token)).toBeInTheDocument();
    }
  });

  it("mide el contraste real de los pares de texto sobre fondo", async () => {
    mockApi([{ match: "/api/v1/manifest", body: manifestFixture }]);

    renderRoute("/tokens");

    const contrast = await screen.findByRole("region", { name: "Contraste" });
    const rows = within(contrast).getAllByRole("row");
    expect(rows.length).toBeGreaterThan(4);
    // Cada fila lleva el ratio medido con contrastRatio, con dos decimales.
    expect(within(contrast).getAllByText(/^\d+,\d{2}$/).length).toBeGreaterThan(3);
  });
});
