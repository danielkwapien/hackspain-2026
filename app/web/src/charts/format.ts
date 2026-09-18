/**
 * Formato de dominio de las primitivas de gráfica.
 *
 * Única fuente de verdad del signo, la unidad y el glifo de delta. Reutiliza
 * `src/lib/format.ts` para lo que ya resuelve (importes de 2 decimales y meses
 * `MM/YYYY`) y añade encima las tres reglas tipográficas del contrato visual:
 * coma decimal y millares con punto (los da `Intl` es-ES), signo menos U+2212
 * (nunca el guion ASCII) y espacio fino U+2009 antes de la unidad.
 */

import { EMPTY_VALUE, formatAmount, formatMonth } from "@/lib/format";

/** Espacio fino entre la cifra y su unidad (`47,3 pts`). */
const THIN_SPACE = " ";
/** Signo menos tipográfico; `Intl` emite el guion ASCII y hay que sustituirlo. */
const MINUS_SIGN = "−";

/** Umbral por debajo del cual un delta no tiene dirección: ni sube ni baja. */
const NEUTRAL_THRESHOLD = 0.5;

/** Cifras de una decimal (puntos, deltas y porcentajes). */
const POINTS_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: "always",
});

const MONTH_LONG_FORMAT = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** Token de color con el que se pinta un delta. */
export type DeltaTone = "--content-positive" | "--content-negative" | "--content-secondary";

/** Dirección de un delta: el signo viaja siempre en el glifo, nunca solo en el color. */
export type Delta = {
  text: string;
  glyph: string;
  tone: DeltaTone;
  sign: -1 | 0 | 1;
};

/** Sustituye el guion ASCII de `Intl` por el menos tipográfico. */
function minus(text: string): string {
  return text.replaceAll("-", MINUS_SIGN);
}

/** Cifra de una decimal, o `null` si el valor no es utilizable. */
function oneDecimal(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return POINTS_FORMAT.format(value);
}

/** Puntos de score con una decimal: `47,3 pts`. */
export function fmtPoints(value: number | null | undefined): string {
  const formatted = oneDecimal(value);
  if (formatted === null) return EMPTY_VALUE;
  return minus(`${formatted}${THIN_SPACE}pts`);
}

/**
 * Delta en puntos con su glifo y su token de color. Es la única función que
 * decide signo, color y glifo a la vez: nadie más repite el umbral de neutro.
 */
export function fmtDelta(value: number | null | undefined): Delta {
  const formatted = oneDecimal(value);
  if (formatted === null || value == null) {
    return { text: EMPTY_VALUE, glyph: EMPTY_VALUE, tone: "--content-secondary", sign: 0 };
  }

  const unit = `${THIN_SPACE}pts`;

  if (Math.abs(value) < NEUTRAL_THRESHOLD) {
    return {
      text: minus(`${EMPTY_VALUE} ${formatted}${unit}`),
      glyph: EMPTY_VALUE,
      tone: "--content-secondary",
      sign: 0,
    };
  }

  if (value > 0) {
    return {
      text: `▲ +${formatted}${unit}`,
      glyph: "▲",
      tone: "--content-positive",
      sign: 1,
    };
  }

  return {
    text: minus(`▼ ${formatted}${unit}`),
    glyph: "▼",
    tone: "--content-negative",
    sign: -1,
  };
}

/** Porcentaje ya expresado en puntos, con signo explícito en positivos: `+3,9 %`. */
export function fmtPct(value: number | null | undefined): string {
  const formatted = oneDecimal(value);
  if (formatted === null) return EMPTY_VALUE;
  const signed = (value as number) > 0 ? `+${formatted}` : formatted;
  return minus(`${signed}${THIN_SPACE}%`);
}

/** Nota normalizada `u ∈ [0,1]` con dos decimales: `0,70`. */
export function fmtU(value: number | null | undefined): string {
  return minus(formatAmount(value));
}

/** `2026-06` → `06/2026`. */
export function fmtMonth(value: string | null | undefined): string {
  return formatMonth(value);
}

/** `2026-06` → `junio de 2026` (para `aria-label`; en minúscula, es-ES). */
export function fmtMonthLong(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  const match = MONTH_PATTERN.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return MONTH_LONG_FORMAT.format(date).toLocaleLowerCase("es-ES");
}

/** Tamaño con la moneda etiquetada aparte (contrato visual §3): `EUR 32.477,26`. */
export function fmtSize(value: number | null | undefined, currency: string): string {
  const amount = formatAmount(value);
  if (amount === EMPTY_VALUE) return EMPTY_VALUE;
  return `${currency} ${minus(amount)}`;
}
