/**
 * Formatos de presentación del dashboard.
 *
 * Convenciones documentadas en `docs/dani/contrato-visual-v1.md`:
 * - importes: separador de millares con punto y 2 decimales (`1.234.567,89 EUR`);
 * - fechas: `DD/MM/YYYY`; meses: `MM/YYYY`;
 * - valor ausente: `—` (nunca 0 cuando el dato no existe).
 */

export const EMPTY_VALUE = "—";

const AMOUNT_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // El locale es-ES omite el separador en cifras de 4 dígitos; el contrato
  // visual exige millares con punto siempre.
  useGrouping: "always",
});

const COUNT_FORMAT = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
  useGrouping: "always",
});

const PERCENT_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function isUsableNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Importe con millares y 2 decimales; signo solo cuando es negativo. */
export function formatAmount(value: number | null | undefined): string {
  if (!isUsableNumber(value)) return EMPTY_VALUE;
  return AMOUNT_FORMAT.format(value);
}

/** Importe con signo explícito en positivos (netos, variaciones). */
export function formatSigned(value: number | null | undefined): string {
  if (!isUsableNumber(value)) return EMPTY_VALUE;
  const formatted = AMOUNT_FORMAT.format(value);
  return value > 0 ? `+${formatted}` : formatted;
}

/** Recuento entero con separador de millares. */
export function formatCount(value: number | null | undefined): string {
  if (!isUsableNumber(value)) return EMPTY_VALUE;
  return COUNT_FORMAT.format(value);
}

/** Porcentaje ya expresado en puntos (12,4 -> `+12,4 %`). */
export function formatPercent(value: number | null | undefined): string {
  if (!isUsableNumber(value)) return EMPTY_VALUE;
  const formatted = `${PERCENT_FORMAT.format(value)} %`;
  return value > 0 ? `+${formatted}` : formatted;
}

/** `2026-09` -> `09/2026`. */
export function formatMonth(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  const match = MONTH_PATTERN.exec(value);
  if (!match) return value;
  return `${match[2]}/${match[1]}`;
}

/** `2026-09-01` (o un ISO completo) -> `01/09/2026`. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  const match = DATE_PATTERN.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** ISO con hora -> `18/09/2026 20:45 UTC`. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${DATE_TIME_FORMAT.format(parsed).replace(",", "")} UTC`;
}

/** Variación relativa en puntos porcentuales; `null` si no hay base comparable. */
export function relativeChange(
  current: number,
  previous: number | null | undefined,
): number | null {
  if (!isUsableNumber(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
