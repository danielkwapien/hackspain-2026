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

/** Las seis líneas por régimen del catálogo de gráficas, por su etiqueta. */
const REGIME_LABELS = [
  "Mejorando",
  "Deteriorándose",
  "Bache",
  "Estable",
  "Recuperando",
  "Calentamiento",
];

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

  it("tokens: the charts catalog renders every primitive with fixed data", async () => {
    mockApi([{ match: "/api/v1/manifest", body: manifestFixture }]);

    renderRoute("/tokens");

    const catalog = await screen.findByRole("region", { name: "Gráficas de X-Ray" });

    // Sparkline: positiva, negativa, neutra y con punto final.
    expect(within(catalog).getAllByRole("img", { name: /^Sparkline/ })).toHaveLength(4);

    // LineNoAxes: seis regímenes, outlook y normalizada, cada una con su tabla
    // oculta; la novena tabla es la del treemap.
    expect(within(catalog).getAllByRole("table")).toHaveLength(9);
    for (const regime of REGIME_LABELS) {
      const line = within(catalog).getByRole("table", { name: `Score, régimen ${regime}` });
      expect(line).toBeInTheDocument();
    }
    expect(
      within(catalog).getByRole("table", { name: "Score con baseline y banda de outlook" }),
    ).toBeInTheDocument();
    expect(
      within(catalog).getByRole("table", { name: "Tres sociedades rebasadas a 100" }),
    ).toBeInTheDocument();
    // La leyenda de la normalizada la pone el consumidor, no la primitiva: es
    // la única que rotula una serie suelta con su token de color.
    const legend = within(catalog).getByText("--chart-score").closest("li");
    expect(legend).toHaveTextContent("Sociedad A");

    // RangeBar (2) y PillarBar (3 tramos + 2 divergentes) exponen role="meter".
    expect(within(catalog).getAllByRole("meter")).toHaveLength(7);

    // Treemap: 40 items en 2 grupos, con su tabla oculta de 40 filas más cabecera.
    const tiles = within(catalog).getByRole("group", { name: "Contribución por cliente" });
    expect(tiles).toBeInTheDocument();
    const treemap = within(catalog).getByRole("table", { name: "Contribución por cliente" });
    expect(within(treemap).getAllByRole("row")).toHaveLength(41);

    // ChartTooltip abierto y estático: se puede mirar sin pasar el puntero.
    const tooltip = within(catalog).getByRole("tooltip");
    expect(within(tooltip).getByText("12/2025")).toBeInTheDocument();
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
