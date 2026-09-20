import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { TimelineRow } from "@/lib/api-v2";
import { SheetChart, pillarChart, scoreChart } from "@/panels/research/SheetChart";
import { AS_OF, monthsEndingAt, timelineExample } from "@/test/examples";

/** Los 24 meses del contrato, de `2024-09` a `AS_OF` (`2026-08`). */
const MONTHS = monthsEndingAt(AS_OF, 24);

const SCORES = [
  65.2, 64.0, 62.7, 61.5, 60.8, 60.1, 59.6, 59.0, 58.4, 57.9, 57.2, 56.6, 56.0, 55.4, 55.1, 54.8,
  54.3, 60.2, 61.9, 61.0, 59.7, 58.1, 56.3, 57.4,
];

/** El ejemplo del contrato; TS ensancha sus literales (`band`) al importar el JSON. */
const EXAMPLE = timelineExample[0] as TimelineRow;

/** Con régimen en cada fila: el motor lo publica y la gráfica deja de pintarlo. */
const TIMELINE: TimelineRow[] = MONTHS.map((month, index) => ({
  ...EXAMPLE,
  month,
  score: SCORES[index],
  regime: index < 17 ? "deteriorating" : "recovering",
  pillars: {
    L: { value: 0.3 + index * 0.01, weight: 0.25 },
    P: { value: 0.78, weight: 0.2 },
    C: { value: 0.74, weight: 0.15 },
    D: { value: 0.72, weight: 0.2 },
    A: { value: null, weight: 0 },
  },
}));

function chartOf(metric: "score" | "L") {
  const chart =
    metric === "score"
      ? scoreChart(TIMELINE, "1A", { label: "Health score de Acme, 1A" })
      : pillarChart(TIMELINE, "L", "1A", "Acme");
  expect(chart).not.toBeNull();
  return chart!;
}

function renderChart(metric: "score" | "L", range: "1M" | "1A" = "1A") {
  const chart =
    metric === "score"
      ? scoreChart(TIMELINE, range, { label: "Health score de Acme" })
      : pillarChart(TIMELINE, "L", range, "Acme");
  return render(
    <SheetChart
      range={range}
      onRange={() => {}}
      chart={chart}
      message="Sin gráfica"
      activeMonth={null}
      onHover={() => {}}
    />,
  );
}

function strokes(container: HTMLElement): string[] {
  return [...container.querySelectorAll<SVGPathElement>('path[data-slot="line-segment"]')].map(
    (path) => path.style.stroke,
  );
}

describe("XR-037 (E9): la línea del score, siempre azul claro", () => {
  it("scoreChart no adjunta el régimen a los puntos y declara el color de la serie", () => {
    const chart = chartOf("score");
    expect(chart.series).toHaveLength(1);
    expect(chart.series[0].color).toBe("var(--chart-score)");
    // Sin `regime`, `regimeSegments` devuelve un solo tramo y la línea no se parte.
    expect(chart.series[0].points.every((point) => point.regime === undefined)).toBe(true);
  });

  it("la línea se dibuja de una pieza, sin ningún color de régimen", () => {
    const { container } = renderChart("score");
    // Un tramo por serie: el verde de `improving` y el rojo de `deteriorating` ya no
    // salen en la gráfica; el régimen se lee escrito en la fila de identidad.
    expect(strokes(container)).toEqual(["var(--chart-score)"]);
  });

  it("pillarChart pone el pilar en su token y el score detrás, también en azul", () => {
    const chart = chartOf("L");
    expect(chart.series.map((line) => [line.id, line.color])).toEqual([
      ["Health score", "var(--chart-score)"],
      ["Liquidez", "var(--chart-pillar-liquidity)"],
    ]);
    // Rosa contra azul: dos líneas del mismo color no se distinguirían.
    expect(chart.series[0].color).not.toBe(chart.series[1].color);
  });
});

describe("XR-037 (E11): fuera la baseline, y leyenda cuando hay dos líneas", () => {
  it("ninguna de las dos gráficas lleva baseline", () => {
    expect(chartOf("score")).not.toHaveProperty("baseline");
    expect(chartOf("L")).not.toHaveProperty("baseline");
  });

  it("no se pinta ni la raya punteada ni su fecha", () => {
    const { container } = renderChart("L");
    expect(container.querySelector('path[data-slot="baseline"]')).toBeNull();
    // La fecha del primer mes del rango colgaba de esa raya.
    expect(screen.queryByText("09/2025")).toBeNull();
  });

  it("con dos series hay leyenda, con la principal primero y un punto de 8 px", () => {
    const { container } = renderChart("L");
    const legend = container.querySelector<HTMLElement>('[data-slot="chart-legend"]')!;
    const items = within(legend).getAllByRole("listitem");

    // El score se dibuja primero para quedar detrás; en la leyenda manda el pilar.
    expect(items.map((item) => item.textContent)).toEqual(["Liquidez", "Health score"]);
    const dots = items.map((item) => item.querySelector<HTMLElement>("span")!);
    expect(dots.map((dot) => dot.style.backgroundColor)).toEqual([
      "var(--chart-pillar-liquidity)",
      "var(--chart-score)",
    ]);
    for (const dot of dots) expect(dot.className).toContain("size-2");
  });

  it("con el Health score solo no se pinta leyenda", () => {
    const { container } = renderChart("score");
    expect(container.querySelector('[data-slot="chart-legend"]')).toBeNull();
  });
});

describe("XR-037 (E10): burbujas de valor en los picos", () => {
  function bubbles(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('[data-slot="peak-label"]')];
  }

  it("a 1A la gráfica dice cifras en reposo, sin tocar el ratón", () => {
    const { container } = renderChart("score", "1A");
    const labels = bubbles(container);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(4);
    // El último punto es el corte: siempre se ve.
    expect(labels.at(-1)!.textContent).toContain("57,4");
  });

  it("a 1M no hay pico que señalar y no sale ninguna burbuja", () => {
    const { container } = renderChart("score", "1M");
    expect(bubbles(container)).toHaveLength(0);
  });
});
