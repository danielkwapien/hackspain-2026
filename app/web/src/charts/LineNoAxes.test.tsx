import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  LineNoAxes,
  rebaseSeries,
  regimeSegments,
  type LineForecast,
  type LineMarker,
  type LineSeries,
} from "@/charts/LineNoAxes";
import { buildTimeScale } from "@/charts/time-scale";
import { monthsEndingAt } from "@/test/examples";

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

/**
 * jsdom no hace layout: sin este mock `getBoundingClientRect` devuelve ceros y el
 * porcentaje del puntero sería siempre NaN. `restoreMocks` lo deshace tras cada test.
 */
function mockSurfaceRect() {
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
}

/** Primera coordenada `y` de un `d` con forma `M x,y L x,y …`. */
function firstY(path: SVGPathElement): number {
  const match = /^M[\d.]+,([\d.]+)/.exec(path.getAttribute("d") ?? "");
  return Number(match![1]);
}

/** Pares `[x, y]` de un `d` con forma `M x,y L x,y …`. */
function pathPairs(path: Element | null): [number, number][] {
  return [...(path?.getAttribute("d") ?? "").matchAll(/[ML]\s*([\d.-]+),([\d.-]+)/g)].map(
    ([, x, y]) => [Number(x), Number(y)],
  );
}

/** Coordenadas `x` de un `d`. */
function pathXs(path: Element | null): number[] {
  return pathPairs(path).map(([x]) => x);
}

/** Número de comandos (`M` + `L`) de un `d`: lo que CSS necesita constante para interpolar. */
function commandCount(path: Element | null): number {
  return (path?.getAttribute("d") ?? "").match(/[ML]/g)?.length ?? 0;
}

/** `x` de la línea de corte, sea `<line x1>` o `<path d="M x,…">`. */
function splitX(element: Element | null): number {
  const x1 = element?.getAttribute("x1");
  if (x1 !== null && x1 !== undefined) return Number(x1);
  return pathXs(element)[0] ?? Number.NaN;
}

/** `stroke-opacity` de un trazo, esté en el atributo o en el `style`. */
function strokeOpacity(path: SVGPathElement): number {
  const inline = path.style.strokeOpacity;
  if (inline !== "") return Number(inline);
  const attribute = path.getAttribute("stroke-opacity");
  return attribute === null ? 1 : Number(attribute);
}

/** 24 meses hasta el corte con dos regímenes, y el horizonte de outlook (corte + 6). */
const AS_OF = "2026-08";
const HISTORY_MONTHS = monthsEndingAt(AS_OF, 24);
const HISTORY: LineSeries = {
  id: "Score",
  points: HISTORY_MONTHS.map((month, index) => ({
    month,
    value: 70 - index * 0.8,
    regime: index < 12 ? "stable" : "deteriorating",
  })),
};
const HORIZON_MONTHS = monthsEndingAt("2027-02", 7);
const HORIZON: LineForecast = {
  from: AS_OF,
  points: HORIZON_MONTHS.map((month, index) => ({ month, value: 51.6 - index * 0.5 })),
  low: HORIZON_MONTHS.map((_, index) => 51.6 - index * 2),
  high: HORIZON_MONTHS.map((_, index) => 51.6 + index * 1.5),
};
/** Primer mes visible de 3M, 6M, 1A y Máx. */
const RANGE_FROM = [4, 7, 13, 24].map((points) => HISTORY_MONTHS[24 - points]);

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

  it("LineNoAxes: draws a dotted baseline (dasharray 0 3.6, round caps)", () => {
    const { container } = render(
      <LineNoAxes
        series={[SCORE]}
        baseline={{ value: SCORE.points[0].value, label: "Inicio del rango" }}
        label="Score de 24 meses"
      />,
    );

    const baseline = container.querySelector<SVGPathElement>('path[data-slot="baseline"]')!;
    expect(baseline).toBeInTheDocument();
    // Referencia, no rejilla: puntos redondos como la línea base de Trade Republic.
    expect(baseline.getAttribute("stroke-dasharray")).toBe("0 3.6");
    expect(baseline.getAttribute("stroke-linecap")).toBe("round");
    expect(baseline.getAttribute("stroke-width")).toBe("1.3");
    expect(baseline.style.stroke).toBe("var(--content-disabled)");

    // Va a la altura del primer punto del rango, en la misma escala que la serie, y
    // es un `path` de dos comandos de borde a borde para transicionar como la serie.
    const pairs = pathPairs(baseline);
    expect(pairs.map(([x]) => x)).toEqual([0, 600]);
    expect(pairs[0][1]).toBeCloseTo(pairs[1][1], 6);
    expect(pairs[0][1]).toBeCloseTo(firstY(paths(container)[0]), 6);

    const label = screen.getByText("Inicio del rango");
    expect(label.style.fontSize).toBe("var(--text-micro)");
  });

  it('LineNoAxes: forecast band is drawn only forward from "from" and never over the past', () => {
    const scale = buildTimeScale({
      history: SCORE.points.map((point) => point.month),
      forecast: FORECAST.points.map((point) => point.month),
    });
    expect(scale.axis).toHaveLength(8);

    // El presente al 78 % del ancho: la banda arranca ahí y termina en el borde.
    const fromX = scale.x("2026-06");
    expect(fromX).toBeCloseTo(468, 6);

    const { container } = render(
      <LineNoAxes series={[SCORE]} forecast={FORECAST} label="Score de 24 meses" />,
    );

    // El punto de 2026-05 cae fuera: la banda arranca en `from`.
    const band = container.querySelector<SVGPathElement>('path[data-slot="forecast-band"]')!;
    expect(band).toBeInTheDocument();
    expect(Math.min(...pathXs(band))).toBeGreaterThanOrEqual(fromX - 1e-6);
    expect(Math.max(...pathXs(band))).toBeCloseTo(600, 6);
    // Banda y centro transicionan como la serie: `d` por CSS.
    expect(band.getAttribute("class")).toContain("transition:d_var(--duration-moderate)");

    // Proyección punteada y separación de 1 px en el corte.
    const center = container.querySelector<SVGPathElement>('path[data-slot="forecast-center"]')!;
    expect(center.getAttribute("stroke-dasharray")).toBe("2 3");
    expect(Math.min(...pathXs(center))).toBeGreaterThanOrEqual(fromX - 1e-6);
    expect(center.getAttribute("class")).toContain("transition:d_var(--duration-moderate)");

    const split = container.querySelector('[data-slot="forecast-split"]')!;
    expect(splitX(split)).toBeCloseTo(fromX, 6);
    expect(split.getAttribute("stroke-width")).toBe("1");
    expect((split as SVGElement).style.stroke).toBe("var(--alpha-white-10)");
  });

  it("LineNoAxes: forecast band opacity is at most 0.18", () => {
    const { container } = render(
      <LineNoAxes series={[SCORE]} forecast={FORECAST} label="Score de 24 meses" />,
    );

    const band = container.querySelector<SVGPathElement>('path[data-slot="forecast-band"]')!;
    expect(band.style.fill).toBe("var(--chart-2)");
    expect(Number(band.getAttribute("fill-opacity"))).toBeLessThanOrEqual(0.18);
    expect(band.getAttribute("fill-opacity")).toBe("0.18");
  });

  it("LineNoAxes: a flat series stays flat instead of filling the height", () => {
    // Un regimen `stable` real recorre menos de 1 pt. Sin suelo de escala el
    // dominio se ajusta a esos 0,7 pts y la linea llena los 132 px utiles: la
    // grafica no tiene ejes, asi que nadie puede ver que es ruido amplificado.
    const flat = [60.9, 61.5, 60.7, 61.2, 61.6, 61.0];
    const points = flat.map((value, index) => ({ month: `2026-0${index + 1}`, value }));

    const { container } = render(
      <LineNoAxes series={[{ id: "score", points }]} label="Score estable" />,
    );

    const ys = [...(container.querySelector("path")?.getAttribute("d") ?? "").matchAll(/,([\d.]+)/g)]
      .map(([, y]) => Number(y));
    const drawnSpan = Math.max(...ys) - Math.min(...ys);

    // 0,9 pts sobre un dominio de 10 no puede pasar del 10 % de los 132 px utiles.
    expect(drawnSpan).toBeLessThan(15);

    // Y el suelo no aplasta un movimiento de verdad: 30 pts siguen llenando.
    const wide = [80, 74, 66, 60, 54, 50].map((value, index) => ({
      month: `2026-0${index + 1}`,
      value,
    }));
    const { container: big } = render(
      <LineNoAxes series={[{ id: "score", points: wide }]} label="Score en caida" />,
    );
    const bigYs = [...(big.querySelector("path")?.getAttribute("d") ?? "").matchAll(/,([\d.]+)/g)]
      .map(([, y]) => Number(y));
    expect(Math.max(...bigYs) - Math.min(...bigYs)).toBeGreaterThan(100);
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

  it("LineNoAxes: activeMonth controls the crosshair without pointer events", () => {
    const { container } = render(
      <LineNoAxes series={[SCORE]} activeMonth="2026-03" label="Score de 24 meses" />,
    );

    // Tercer mes de seis: 2 / 5 del ancho, sin que nadie haya movido el puntero.
    const crosshair = container.querySelector<HTMLElement>('[data-slot="crosshair"]')!;
    expect(crosshair).toBeInTheDocument();
    expect(crosshair.style.left).toBe("40%");
  });

  it("LineNoAxes: activeMonth null hides the crosshair even after pointerMove", () => {
    mockSurfaceRect();
    const onHover = vi.fn();
    const { container } = render(
      <LineNoAxes
        series={[SCORE]}
        activeMonth={null}
        onHover={onHover}
        label="Score de 24 meses"
      />,
    );
    const surface = container.querySelector<HTMLElement>('[data-slot="line-no-axes"]')!;

    fireEvent.pointerMove(surface, { clientX: 600 });

    // Controlado: el puntero solo avisa; el crosshair lo decide el padre.
    expect(onHover).toHaveBeenCalledWith("2026-06");
    expect(container.querySelector('[data-slot="crosshair"]')).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("LineNoAxes: tooltip=false keeps the crosshair and onHover but renders no role=tooltip", () => {
    mockSurfaceRect();
    const onHover = vi.fn();
    const { container } = render(
      <LineNoAxes series={[SCORE]} tooltip={false} onHover={onHover} label="Score de 24 meses" />,
    );
    const surface = container.querySelector<HTMLElement>('[data-slot="line-no-axes"]')!;

    fireEvent.pointerMove(surface, { clientX: 600 });

    expect(onHover).toHaveBeenCalledWith("2026-06");
    expect(container.querySelector<HTMLElement>('[data-slot="crosshair"]')!.style.left).toBe(
      "100%",
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("LineNoAxes: activeMonth not in the axis renders no crosshair", () => {
    const { container } = render(
      <LineNoAxes series={[SCORE]} activeMonth="2030-01" label="Score de 24 meses" />,
    );

    expect(container.querySelector('[data-slot="crosshair"]')).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
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

  it("DADO la serie completa CUANDO cambia el rango 3M/6M/1A/Máx ENTONCES segmentos, banda y centro conservan el número de comandos", () => {
    const { container, rerender } = render(
      <LineNoAxes series={[HISTORY]} forecast={HORIZON} from={RANGE_FROM[3]} label="Score" />,
    );

    function snapshot() {
      return {
        segments: paths(container).map(commandCount),
        band: commandCount(container.querySelector('path[data-slot="forecast-band"]')),
        center: commandCount(container.querySelector('path[data-slot="forecast-center"]')),
      };
    }

    const whole = snapshot();
    expect(whole.segments).toHaveLength(2);
    expect(whole.segments.every((count) => count > 0)).toBe(true);
    expect(whole.band).toBeGreaterThan(0);
    expect(whole.center).toBeGreaterThan(0);

    // Mismo número de comandos en todos los rangos: es lo que `transition: d` necesita para
    // interpolar; si cambiara, el navegador saltaría a la nueva forma sin animar.
    for (const from of RANGE_FROM) {
      rerender(<LineNoAxes series={[HISTORY]} forecast={HORIZON} from={from} label="Score" />);
      expect(snapshot(), `from=${from}`).toEqual(whole);
    }

    // En 3M el tramo estable queda entero fuera de la ventana: colapsa a x=0 y a la y del
    // primer punto visible (comandos degenerados) y no se pinta.
    rerender(<LineNoAxes series={[HISTORY]} forecast={HORIZON} from={RANGE_FROM[0]} label="Score" />);
    const [stable, deteriorating] = paths(container);
    expect(stable.style.stroke).toBe("var(--regime-stable)");
    expect(pathXs(stable).every((x) => x === 0)).toBe(true);
    expect(new Set(pathPairs(stable).map(([, y]) => y)).size).toBe(1);
    expect(strokeOpacity(stable)).toBe(0);
    // El tramo visible sigue pintado y llega hasta el presente (468).
    expect(strokeOpacity(deteriorating)).toBe(1);
    expect(Math.max(...pathXs(deteriorating))).toBeCloseTo(468, 6);
    // Sus meses ocultos también colapsan a x=0 con la y del primer visible (que está en x=0).
    const hiddenY = pathPairs(stable)[0][1];
    const collapsed = pathPairs(deteriorating).filter(([x]) => x === 0);
    expect(collapsed.length).toBeGreaterThan(1);
    for (const [, y] of collapsed) expect(y).toBeCloseTo(hiddenY, 6);
  });

  it("DADO forecast CUANDO cambia el rango ENTONCES el corte forecast-split queda idéntico en 468", () => {
    const { container, rerender } = render(
      <LineNoAxes series={[HISTORY]} forecast={HORIZON} from={RANGE_FROM[0]} label="Score" />,
    );

    for (const from of RANGE_FROM) {
      rerender(<LineNoAxes series={[HISTORY]} forecast={HORIZON} from={from} label="Score" />);
      const split = container.querySelector('[data-slot="forecast-split"]');
      expect(split, `from=${from}`).not.toBeNull();
      expect(splitX(split), `from=${from}`).toBeCloseTo(468, 6);
    }

    // Sin forecast no hay corte y el presente cae en el borde derecho.
    rerender(<LineNoAxes series={[HISTORY]} from={RANGE_FROM[0]} label="Score" />);
    expect(container.querySelector('[data-slot="forecast-split"]')).toBeNull();
    expect(Math.max(...paths(container).flatMap(pathXs))).toBeCloseTo(600, 6);
  });

  it("DADO axis por defecto CUANDO se pinta ENTONCES hay etiquetas micro tabulares sin línea, y con axis=false ninguna", () => {
    const { container, rerender } = render(<LineNoAxes series={[SCORE]} label="Score" />);

    const axis = container.querySelector<HTMLElement>('div[data-slot="x-axis"]')!;
    expect(axis).toBeInTheDocument();
    expect(axis.style.height).toBe("16px");
    // Sin línea de eje: ni SVG, ni regla, ni borde superior.
    expect(axis.querySelectorAll("svg, hr, line")).toHaveLength(0);
    expect(axis.className).not.toMatch(/border-t/);

    // 6 meses (≤ 7): todos con etiqueta `mes año`, cifras tabulares en cuerpo micro.
    const ticks = [...axis.querySelectorAll<HTMLElement>("span")];
    expect(ticks.map((tick) => tick.textContent)).toEqual([
      "ene 26",
      "feb 26",
      "mar 26",
      "abr 26",
      "may 26",
      "jun 26",
    ]);
    for (const tick of ticks) {
      expect(tick.className).toMatch(/\bnum\b/);
      expect(tick.style.fontSize).toBe("var(--text-micro)");
      expect(tick.style.position).toBe("absolute");
    }
    // Colocados por porcentaje del eje: extremos en 0 % y 100 %, el resto centrado.
    expect(ticks[0].style.left).toBe("0%");
    expect(ticks.at(-1)!.style.left).toBe("100%");
    expect(ticks[2].style.left).toBe("40%");
    expect(ticks[2].style.transform).toContain("translateX(-50%)");
    expect(ticks[0].style.transform).not.toContain("-50%");
    expect(ticks.at(-1)!.style.transform).toContain("-100%");

    // Con forecast, +3 y +6 se añaden atenuados (terciario) tras los visibles (secundario).
    rerender(<LineNoAxes series={[HISTORY]} forecast={HORIZON} from={RANGE_FROM[2]} label="Score" />);
    const withForecast = [...container.querySelectorAll<HTMLElement>('div[data-slot="x-axis"] span')];
    expect(withForecast).toHaveLength(5 + 2);
    expect(withForecast.slice(-2).map((tick) => tick.textContent)).toEqual(["nov 26", "feb 27"]);
    expect(withForecast.slice(-2).every((tick) => tick.style.color === "var(--content-tertiary)")).toBe(
      true,
    );
    expect(
      withForecast.slice(0, 5).every((tick) => tick.style.color === "var(--content-secondary)"),
    ).toBe(true);
    expect(withForecast[4].textContent).toBe("ago 26");
    expect(withForecast[4].style.left).toBe("78%");

    // `axis={false}`: la gráfica queda como antes, sin eje.
    rerender(<LineNoAxes series={[SCORE]} axis={false} label="Score" />);
    expect(container.querySelector('[data-slot="x-axis"]')).toBeNull();
  });

  it("DADO una ventana de 3M CUANDO se mueve el puntero ENTONCES el hover salta solo a meses visibles", () => {
    mockSurfaceRect();
    const onHover = vi.fn();
    const { container } = render(
      <LineNoAxes
        series={[HISTORY]}
        forecast={HORIZON}
        from={RANGE_FROM[0]}
        onHover={onHover}
        label="Score"
      />,
    );
    const surface = container.querySelector<HTMLElement>('[data-slot="line-no-axes"]')!;

    // Borde derecho: el presente, nunca un mes del horizonte.
    fireEvent.pointerMove(surface, { clientX: 600 });
    expect(onHover).toHaveBeenLastCalledWith(AS_OF);
    expect(screen.getByRole("tooltip")).toHaveTextContent("08/2026");
    expect(container.querySelector<HTMLElement>('[data-slot="crosshair"]')!.style.left).toBe("78%");

    // Borde izquierdo: el primer mes visible, nunca uno oculto de la historia.
    fireEvent.pointerMove(surface, { clientX: 0 });
    expect(onHover).toHaveBeenLastCalledWith(RANGE_FROM[0]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("05/2026");
    expect(container.querySelector<HTMLElement>('[data-slot="crosshair"]')!.style.left).toBe("0%");

    // Y la tabla oculta solo lista los meses visibles.
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(4);
    expect(within(table).getByRole("rowheader", { name: "mayo de 2026" })).toBeInTheDocument();
    expect(within(table).queryByRole("rowheader", { name: "abril de 2026" })).toBeNull();
    expect(within(table).queryByRole("rowheader", { name: "septiembre de 2026" })).toBeNull();
  });
});

describe("XR-037 (E10): burbujas de valor en los picos", () => {
  /** Trece meses con un valle en 2025-12 y una cima en 2026-05; acaba en 70,0. */
  const SHAPE: LineSeries = {
    id: "Score",
    points: [66, 62, 55, 46, 40, 48, 61, 74, 82, 86, 78, 72, 70].map((value, index) => ({
      month: monthsEndingAt("2026-08", 13)[index],
      value,
    })),
  };

  function bubbles(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>('[data-slot="peak-label"]')];
  }

  it("sin `peaks` no pinta ninguna: la Comparativa superpone series y no las pide", () => {
    const { container } = render(<LineNoAxes series={[SHAPE, SCORE]} label="Dos sociedades" />);
    expect(bubbles(container)).toHaveLength(0);
  });

  it("con `peaks` pinta la cifra en la capa HTML, nunca en el SVG", () => {
    const { container } = render(<LineNoAxes series={[SHAPE]} peaks={2} label="Score" />);
    const labels = bubbles(container);

    expect(labels.map((label) => label.textContent)).toEqual([
      `40,0${THIN}pts`,
      `86,0${THIN}pts`,
      `70,0${THIN}pts`,
    ]);
    // Con `preserveAspectRatio="none"` el texto dentro del SVG se deformaría.
    for (const label of labels) expect(label.closest("svg")).toBeNull();
    expect(container.querySelector("svg")!.textContent).toBe("");
  });

  it("el valle cuelga por debajo del punto y la cima por encima", () => {
    const { container } = render(<LineNoAxes series={[SHAPE]} peaks={2} label="Score" />);
    const [valley, crest] = bubbles(container);

    // Un punto bajo la media se etiqueta debajo, o la burbuja pisa la línea.
    expect(valley.style.transform).toContain("translateY(6px)");
    expect(crest.style.transform).toContain("translateY(calc(-100% - 6px))");
  });

  it("las burbujas de los extremos se pegan al borde, como las etiquetas del eje", () => {
    const { container } = render(<LineNoAxes series={[SHAPE]} peaks={3} label="Score" />);
    const labels = bubbles(container);
    const last = labels.at(-1)!;

    // Sin forecast el último mes cae al 100 %: centrada se saldría del recorte.
    expect(last.style.left).toBe("100%");
    expect(last.style.transform).toContain("translateX(-100%)");
    expect(labels[0].style.left).toBe("0%");
    expect(labels[0].style.transform).toContain("translateX(0)");
    expect(labels[1].style.transform).toContain("translateX(-50%)");
  });

  it("con `peaks` la serie respira 28 px arriba y abajo en vez de 8", () => {
    const flat: LineSeries = {
      id: "Score",
      points: SHAPE.points.map((point, index) => ({ ...point, value: index === 6 ? 100 : 0 })),
    };
    const bare = render(<LineNoAxes series={[flat]} height={148} label="Score" />);
    const padded = render(<LineNoAxes series={[flat]} height={148} peaks={1} label="Score" />);

    // El máximo se dibuja a `PAD_Y` del borde: 8 px sin burbujas y 28 con ellas,
    // que es lo que mide la burbuja (22) más su separación del punto (6). Medido en
    // 4199: con los 20 px que pedía el informe la del corte se salía 5,9 px por
    // arriba y el contenedor de la ficha, que es `overflow-hidden`, se la comía.
    const topOf = (result: ReturnType<typeof render>) =>
      Math.min(...pathPairs(paths(result.container)[0]).map(([, y]) => y));
    expect(topOf(bare)).toBeCloseTo(8, 6);
    expect(topOf(padded)).toBeCloseTo(28, 6);
  });

  it("con dos series la burbuja es de la que se dibuja encima", () => {
    const ghost: LineSeries = {
      id: "Health score",
      points: SHAPE.points.map((point) => ({ ...point, value: 55 })),
    };
    const { container } = render(<LineNoAxes series={[ghost, SHAPE]} peaks={1} label="Liquidez" />);

    // `SheetChart` dibuja el score detrás y el pilar encima: la cifra es del pilar.
    expect(bubbles(container).map((label) => label.textContent)).toEqual([
      `40,0${THIN}pts`,
      `70,0${THIN}pts`,
    ]);
  });
});
