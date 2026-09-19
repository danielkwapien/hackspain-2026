/**
 * Escala horizontal de `LineNoAxes`: aritmética pura, sin React.
 *
 * El eje completo es toda la historia más el horizonte de outlook, y no cambia con el
 * rango: cada `<path>` lleva un comando por mes del eje y CSS puede interpolar `d` al
 * pasar de 3M a Máx. Lo que cambia con el rango es qué meses son visibles: los
 * visibles se reparten a partes iguales entre 0 y el presente, los anteriores a `from`
 * colapsan a `x = 0` (comandos degenerados, invisibles) y el horizonte ocupa el tramo
 * que queda hasta el borde derecho.
 *
 * El presente cae siempre en el mismo sitio: al 78 % del ancho con forecast, como en la
 * ficha de Trade Republic, o en el borde derecho sin él.
 */

/** Fracción del ancho que ocupa la historia visible cuando hay horizonte de outlook. */
export const HISTORY_SHARE = 0.78;
/** Alto en píxeles del eje de fechas que `LineNoAxes` pinta bajo el SVG. */
export const AXIS_HEIGHT = 16;

/** Ancho del `viewBox` de `LineNoAxes`. */
const VIEW_W = 600;
/** Ticks del horizonte: uno cada tres meses (+3, +6). */
const HORIZON_TICK_EVERY = 3;

export type TimeScale = {
  /** Toda la historia más los meses del horizonte posteriores al presente. */
  axis: string[];
  /** Meses de historia desde `from`: los únicos con `x` propia y con hover. */
  visible: string[];
  /** Primer mes visible. */
  from: string;
  /** Último mes de historia. */
  present: string;
  /** X en unidades del `viewBox` (0..600); `NaN` si el mes no está en el eje. */
  x: (month: string) => number;
  /** Igual que `x`, en porcentaje: la capa HTML se posiciona con `left: X%`. */
  pct: (month: string) => number;
  /** Mes visible más cercano a una fracción 0..1 del ancho; nunca oculto ni horizonte. */
  nearest: (ratio: number) => string;
};

export type AxisTick = { month: string; muted: boolean };

export function buildTimeScale({
  history,
  forecast = [],
  from,
}: {
  history: readonly string[];
  forecast?: readonly string[];
  from?: string;
}): TimeScale {
  const present = history.at(-1) ?? "";
  const horizon = [...new Set(forecast.filter((month) => month > present))].sort();
  const share = horizon.length > 0 ? HISTORY_SHARE : 1;

  const fromIndex = from === undefined ? 0 : Math.max(0, history.findIndex((month) => month >= from));
  const visible = history.slice(fromIndex);
  const visibleIndex = new Map(visible.map((month, index) => [month, index]));
  const historySet = new Set(history);
  const horizonIndex = new Map(horizon.map((month, index) => [month, index]));
  const last = visible.length - 1;

  function x(month: string): number {
    const at = visibleIndex.get(month);
    if (at !== undefined) return last <= 0 ? VIEW_W * share : (at / last) * VIEW_W * share;
    if (historySet.has(month)) return 0;
    const step = horizonIndex.get(month);
    if (step === undefined) return Number.NaN;
    return VIEW_W * (share + ((1 - share) * (step + 1)) / horizon.length);
  }

  function nearest(ratio: number): string {
    const clamped = Math.min(1, Math.max(0, ratio / share));
    return visible[Math.round(clamped * Math.max(0, last))] ?? present;
  }

  return {
    axis: [...history, ...horizon],
    visible,
    from: visible[0] ?? present,
    present,
    x,
    pct: (month) => (x(month) * 100) / VIEW_W,
    nearest,
  };
}

/**
 * Etiquetas del eje: `n ≤ 7` todos los meses visibles, `n ≤ 13` cada tercero y por
 * encima cada sexto, contados desde el último mes para que el presente siempre lleve
 * etiqueta. Con horizonte, +3 y +6 se añaden al final en `muted`.
 */
export function axisTicks(scale: TimeScale): AxisTick[] {
  const count = scale.visible.length;
  const every = count <= 7 ? 1 : count <= 13 ? 3 : 6;
  const ticks: AxisTick[] = [];
  for (let index = count - 1; index >= 0; index -= every) {
    ticks.unshift({ month: scale.visible[index], muted: false });
  }
  const horizon = scale.axis.slice(scale.axis.indexOf(scale.present) + 1);
  horizon.forEach((month, index) => {
    if ((index + 1) % HORIZON_TICK_EVERY === 0) ticks.push({ month, muted: true });
  });
  return ticks;
}
