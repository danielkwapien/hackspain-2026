/**
 * Superficie publica de las primitivas de grafica.
 *
 * Los widgets importan SOLO de aqui: `@/charts`. Lo que no esta en este fichero
 * es interior de la primitiva (geometria, escalas, layout) y puede cambiar sin
 * avisar; sus tests lo importan por ruta directa, los widgets nunca.
 *
 * Ninguna primitiva usa `recharts`, ni por dentro ni en su firma: hoy las seis
 * son SVG propio. `migration.test.ts` fija esa contencion.
 *
 * Lo que estas primitivas NO hacen, y tiene que poner el widget que las usa:
 * la leyenda cuando hay dos o mas series, el titulo, la unidad en cabecera y el
 * estado de carga/vacio/error.
 */

export { LineNoAxes } from "@/charts/LineNoAxes";
export { AXIS_HEIGHT, HISTORY_SHARE, axisTicks, buildTimeScale } from "@/charts/time-scale";
export type { AxisTick, TimeScale } from "@/charts/time-scale";
export type {
  LineBaseline,
  LineForecast,
  LineMarker,
  LineNoAxesProps,
  LinePoint,
  LineSeries,
} from "@/charts/LineNoAxes";

export { Sparkline } from "@/charts/Sparkline";
export type { SparklineProps } from "@/charts/Sparkline";

export { RangeBar } from "@/charts/RangeBar";
export type { RangeBarProps } from "@/charts/RangeBar";

export { PillarBar, pillarTone } from "@/charts/PillarBar";
export type { PillarBarProps } from "@/charts/PillarBar";

export { Treemap } from "@/charts/Treemap";
export type {
  TreemapDatum,
  TreemapDatumGroup,
  TreemapProps,
  TreemapUnit,
} from "@/charts/Treemap";

export { ChartTooltip } from "@/charts/ChartTooltip";
export type { ChartTooltipProps, ChartTooltipRow } from "@/charts/ChartTooltip";

export {
  fmtConfidence,
  fmtDelta,
  fmtMonth,
  fmtMonthLong,
  fmtMonthShort,
  fmtPct,
  fmtPoints,
  fmtSignedPoints,
  fmtSize,
  fmtSizeShort,
  fmtU,
} from "@/charts/format";
export type { Delta, DeltaTone, SignedPoints } from "@/charts/format";

export { bandToken, regimeToken, treemapToken } from "@/charts/palette";
export type { Band, Regime, TreemapSign, TreemapStep } from "@/charts/palette";
