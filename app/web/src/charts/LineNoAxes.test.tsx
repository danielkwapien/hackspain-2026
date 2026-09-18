import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  LineNoAxes,
  chartMonths,
  forecastArea,
  rebaseSeries,
  regimeSegments,
  xAt,
  type LineForecast,
  type LineMarker,
  type LineSeries,
} from "@/charts/LineNoAxes";

/** Espacio fino (U+2009) entre la cifra y su unidad. */
const THIN = "\u2009";

/**
 * `getByText` normaliza el espacio fino a un espacio normal, y el contrato
 * tipográfico es justo ese carácter: comparamos el `textContent` en crudo.
 */
function exactly(expected: string) {
  return (_content: string, element: Element | null) => element?.textContent === expected;
}

/** Seis meses con dos regímenes: estable y luego deterioro. */
const SCORE: LineSeries = {
  id: "Score",
  points: [
    { month: "2026-01", value: 66.1, regime: "stable" },
    { month: "2026-02", value: 65.4, regime: "stable" },
    { month: "2026-03", value: 64.0, regime: "stable" },
    { month: "2026-04", value: 58.2, regime: "deteriorating" },
    { month: "2026-05", value: 52.9, regime: "deteriorating" },
    { month: "2026-06", value: 47.3, regime: "deteriorating" },
  ],
};

const FORECAST: LineForecast = {
  from: "2026-06",
  // El primer punto es pasado a propósito: la banda no debe dibujarlo.
  points: [
    { month: "2026-05", value: 52.9 },
    { month: "2026-06", value: 47.3 },
    { month: "2026-07", value: 45.0 },
    { month: "2026-08", value: 43.1 },
  ],
  low: [50.0, 45.0, 41.0, 38.0],
  high: [55.0, 49.0, 49.0, 48.0],
};

const MARKERS: LineMarker[] = [
  { month: "2026-02", kind: "warmup" },
  { month: "2026-03", kind: "cap" },
  { month: "2026-05", kind: "alert" },
];

function paths(container: HTMLElement) {
  return [...container.querySelectorAll<SVGPathElement>('path[data-slot="line-segment"]')];
}

/** Primera coordenada `y` de un `d` con forma `M x,y L x,y …`. */
function firstY(path: SVGPathElement): number {
  const match = /^M[\d.]+,([\d.]+)/.exec(path.getAttribute("d") ?? "");
  return Number(match![1]);
}

/** Coordenadas `x` de un `points="x,y x,y …"`. */
function polygonXs(polygon: SVGPolygonElement): number[] {
  return (polygon.getAttribute("points") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((pair) => Number(pair.split(",")[0]));
}

describe("charts/LineNoAxes", () => {
  it("LineNoAxes: renders one path per regime segment with the matching token color", () => {
    // El punto de corte pertenece a los dos tramos: la línea no se rompe.
    const segments = regimeSegments(SCORE.points);
    expect(segments).toHaveLength(2);
    expect(segments[0].regime).toBe("stable");
    expect(segments[0].points).toHaveLength(4);
    expect(segments[1].regime).toBe("deteriorating");
    expect(segments[1].points).toHaveLength(3);
    expect(segments[0].points.at(-1)).toBe(segments[1].points[0]);

    const { container } = render(<LineNoAxes series={[SCORE]} label="Score de 24 meses" />);
    const drawn = paths(container);

    expect(drawn).toHaveLength(2);
    expect(drawn[0].style.stroke).toBe("var(--regime-stable)");
    expect(drawn[1].style.stroke).toBe("var(--regime-deteriorating)");

    for (const path of drawn) {
      expect(path.style.fill).toBe("none");
      expect(path.getAttribute("stroke-width")).toBe("2");
      // Con `preserveAspectRatio="none"` el escalado horizontal adelgazaría el trazo.
      expect(path.getAttribute("vector-effect")).toBe("non-scaling-stroke");
      expect(path.getAttribute("class")).toContain("transition:d_var(--duration-moderate)");
      expect(path.getAttribute("class")).toContain("motion-reduce:[transition:none]");
    }

    // Sin ejes, sin rejilla y sin área bajo la serie.
    expect(container.querySelectorAll("polygon")).toHaveLength(0);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("preserveAspectRatio", "none");
    expect(svg).toHaveAttribute("viewBox", "0 0 600 148");

    // Sin régimen, un solo trazo con el color de la serie.
    const plain = render(
      <LineNoAxes
        series={[{ id: "Sector", points: SCORE.points.map(({ month, value }) => ({ month, value })) }]}
        label="Sector"
      />,
    );
    expect(paths(plain.container)).toHaveLength(1);
    expect(paths(plain.container)[0].style.stroke).toBe("var(--chart-1)");
  });

  it("LineNoAxes: draws a dashed baseline at the first point of the range", () => {
    const { container } = render(
      <LineNoAxes
        series={[SCORE]}
        baseline={{ value: SCORE.points[0].value, label: "Inicio del rango" }}
        label="Score de 24 meses"
      />,
    );

    const baseline = container.querySelector<SVGLineElement>('line[data-slot="baseline"]')!;
    expect(baseline).toBeInTheDocument();
    // Referencia, no rejilla: el guion está reservado a este caso (spec §6).
    expect(baseline.getAttribute("stroke-dasharray")).toBe("2 3");
    expect(baseline.style.stroke).toBe("var(--content-tertiary)");

    // Va a la altura del primer punto del rango, en la misma escala que la serie.
    const y = Number(baseline.getAttribute("y1"));
    expect(baseline.getAttribute("y2")).toBe(baseline.getAttribute("y1"));
    expect(y).toBeCloseTo(firstY(paths(container)[0]), 6);

    const label = screen.getByText("Inicio del rango");
    expect(label.style.fontSize).toBe("var(--text-micro)");
  });

  it('LineNoAxes: forecast band is drawn only forward from "from" and never over the past', () => {
    const months = chartMonths([SCORE], FORECAST);
    expect(months).toHaveLength(8);

    const fromX = xAt(months.indexOf("2026-06"), months.length);
    const area = forecastArea(FORECAST, months);

    // El punto de 2026-05 cae fuera: la banda arranca en `from`.
    expect(area).toHaveLength(3);
    expect(Math.min(...area.map((column) => column.x))).toBe(fromX);

    const { container } = render(
      <LineNoAxes series={[SCORE]} forecast={FORECAST} label="Score de 24 meses" />,
    );

    const band = container.querySelector<SVGPolygonElement>('polygon[data-slot="forecast-band"]')!;
    expect(Math.min(...polygonXs(band))).toBeGreaterThanOrEqual(fromX);

    // Proyección punteada y separación de 1 px en el corte.
    const center = container.querySelector<SVGPolylineElement>(
      'polyline[data-slot="forecast-center"]',
    )!;
    expect(center.getAttribute("stroke-dasharray")).toBe("2 3");

    const split = container.querySelector<SVGLineElement>('line[data-slot="forecast-split"]')!;
    expect(Number(split.getAttribute("x1"))).toBe(fromX);
    expect(split.getAttribute("stroke-width")).toBe("1");
    expect(split.style.stroke).toBe("var(--alpha-white-10)");
  });

  it("LineNoAxes: forecast band opacity is at most 0.18", () => {
    const { container } = render(
      <LineNoAxes series={[SCORE]} forecast={FORECAST} label="Score de 24 meses" />,
    );

    const band = container.querySelector<SVGPolygonElement>('polygon[data-slot="forecast-band"]')!;
    expect(band.style.fill).toBe("var(--chart-2)");
    expect(Number(band.getAttribute("fill-opacity"))).toBeLessThanOrEqual(0.18);
    expect(band.getAttribute("fill-opacity")).toBe("0.18");
  });

  it("LineNoAxes: normalize=true rebases every series to 100 at the first point", () => {
    const a: LineSeries = {
      id: "Score",
      points: [
        { month: "2026-01", value: 50 },
        { month: "2026-02", value: 60 },
        { month: "2026-03", value: 45 },
      ],
    };
    const b: LineSeries = {
      id: "Sector",
      points: [
        { month: "2026-01", value: 200 },
        { month: "2026-02", value: 210 },
        { month: "2026-03", value: 190 },
      ],
    };

    expect(rebaseSeries(a).points.map((point) => point.value)).toEqual([100, 120, 90]);
    expect(rebaseSeries(b).points.map((point) => point.value)).toEqual([100, 105, 95]);

    // Con `v0 = 0` no hay base: la serie se deja tal cual en vez de dividir por cero.
    const zero: LineSeries = {
      id: "Cero",
      points: [
        { month: "2026-01", value: 0 },
        { month: "2026-02", value: 5 },
      ],
    };
    expect(rebaseSeries(zero).points.map((point) => point.value)).toEqual([0, 5]);

    render(<LineNoAxes series={[a, b]} normalize label="Score contra sector" />);
    // Las dos series arrancan en 100 en la tabla oculta.
    expect(screen.getAllByText(exactly(`100,0${THIN}pts`))).toHaveLength(2);
    expect(screen.getByText(exactly(`120,0${THIN}pts`))).toBeInTheDocument();
    expect(screen.getByText(exactly(`105,0${THIN}pts`))).toBeInTheDocument();
  });

  it("LineNoAxes: markers render for cap, alert and warmup", () => {
    const { container } = render(
      <LineNoAxes series={[SCORE]} markers={MARKERS} label="Score de 24 meses" />,
    );

    const cap = container.querySelector<HTMLElement>('[data-slot="marker-cap"]')!;
    expect(cap.style.backgroundColor).toBe("var(--content-negative)");
    expect(cap.style.width).toBe("4px");
    expect(cap.style.height).toBe("4px");
    // Anillo de 2 px en color de superficie: 8 px de diámetro exterior (spec §6).
    expect(cap.style.boxShadow).toBe("0 0 0 2px var(--bg)");
    expect(cap.style.left).toBe("40%");

    const alert = container.querySelector<HTMLElement>('[data-slot="marker-alert"]')!;
    expect(alert.style.backgroundColor).toBe("var(--content-alert)");
    expect(alert.style.boxShadow).toBe("0 0 0 2px var(--bg)");

    const warmup = container.querySelector<HTMLElement>('[data-slot="marker-warmup"]')!;
    expect(warmup.style.backgroundColor).toBe("var(--alpha-white-5)");
    expect(warmup.style.width).toBe("20%");
    expect(warmup.style.left).toBe("0%");

    // La severidad de la alerta puede venir en el marcador.
    const severe = render(
      <LineNoAxes
        series={[SCORE]}
        markers={[{ month: "2026-05", kind: "alert", color: "var(--content-negative)" }]}
        label="Score de 24 meses"
      />,
    );
    expect(
      severe.container.querySelector<HTMLElement>('[data-slot="marker-alert"]')!.style
        .backgroundColor,
    ).toBe("var(--content-negative)");
  });

  it("LineNoAxes: hover shows the vertical line and the tooltip with month, value and regime", () => {
    // jsdom no hace layout: sin este mock `getBoundingClientRect` devuelve ceros
    // y el porcentaje del puntero sería siempre NaN.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 600,
      bottom: 148,
      width: 600,
      height: 148,
      toJSON: () => ({}),
    } as DOMRect);

    const { container } = render(<LineNoAxes series={[SCORE]} label="Score de 24 meses" />);
    const surface = container.querySelector<HTMLElement>('[data-slot="line-no-axes"]')!;

    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerMove(surface, { clientX: 600 });

    const crosshair = container.querySelector<HTMLElement>('[data-slot="crosshair"]')!;
    expect(crosshair.style.width).toBe("1px");
    expect(crosshair.style.backgroundColor).toBe("var(--alpha-white-30)");
    expect(crosshair.style.left).toBe("100%");

    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("06/2026");
    expect(tip.textContent).toContain(`47,3${THIN}pts`);
    expect(tip).toHaveTextContent("deterioro");

    // El puntero apunta a una X: el punto más cercano manda.
    fireEvent.pointerMove(surface, { clientX: 10 });
    expect(screen.getByRole("tooltip")).toHaveTextContent("01/2026");
    expect(screen.getByRole("tooltip").textContent).toContain(`66,1${THIN}pts`);
    expect(screen.getByRole("tooltip")).toHaveTextContent("estable");
  });

  it("LineNoAxes: exposes an aria-label summary and a visually hidden data table", () => {
    const { container } = render(<LineNoAxes series={[SCORE]} label="Score de 24 meses" />);

    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute(
      "aria-label",
      `Score de 24 meses, de 66,1${THIN}pts a 47,3${THIN}pts, régimen deterioro`,
    );

    // La tabla no es opcional: ningún valor se queda detrás del hover.
    const table = screen.getByRole("table");
    expect(table).toHaveClass("sr-only");
    expect(screen.getAllByRole("row")).toHaveLength(SCORE.points.length + 1);
    expect(screen.getByRole("columnheader", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "enero de 2026" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "junio de 2026" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: `47,3${THIN}pts` })).toBeInTheDocument();

    // Sin leyenda: con dos o más series la pone el widget consumidor.
    expect(container.querySelectorAll('[data-slot="legend"]')).toHaveLength(0);
  });
});
