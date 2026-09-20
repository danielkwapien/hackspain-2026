/**
 * Aritmética de la simulación de «Operar», aparte del componente porque es la
 * parte que una pregunta de un tesorero puede tumbar.
 *
 * **Cuota francesa**, no interés simple (decisión de §10 del informe): la cuota
 * es constante y amortiza, `c = P·i / (1 − (1+i)^−n)` con `i` mensual. Sobre
 * 150.000 € al 6,5 % a 24 meses la diferencia contra el interés simple es de
 * 380 € al mes y 9.100 € de intereses; el producto va dirigido a tesoreros y esa
 * diferencia se ve. Con `i = 0` la fórmula divide por cero y degrada a `P/n`.
 *
 * Sigue siendo una simulación y el descargo del widget lo dice: aquí no hay
 * comisiones, ni carencia, ni día de devengo.
 */

/** Rango del importe en euros (W4.3). */
export const AMOUNT_MIN = 1_000;
export const AMOUNT_MAX = 10_000_000;

/** Rango del tipo anual en porcentaje (W4.3). */
export const RATE_MIN = 0.1;
export const RATE_MAX = 25;

/** Los seis plazos del desplegable, en meses. */
export const TERMS = [3, 6, 12, 24, 36, 60] as const;
export type Term = (typeof TERMS)[number];

/** Los dos lados de la operación: ofrecer deuda o reclamarla. */
export type TradeSide = "offer" | "claim";

export type Loan = {
  /** Cuota constante del mes. */
  monthly: number;
  /** Lo que se mueve en total: `monthly × n`. */
  total: number;
  /** `total − principal`. */
  interest: number;
};

const EMPTY_LOAN: Loan = { monthly: 0, total: 0, interest: 0 };

/** Tipo contratado con una decimal y su unidad: `6,5 %`. */
const RATE_FORMAT = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Importe tecleado, sin decimales y con millares: `150.000`. */
const AMOUNT_INPUT_FORMAT = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
  useGrouping: "always",
});

/** Espacio fino entre la cifra y su unidad, como en `charts/format.ts`. */
const THIN_SPACE = " ";

/**
 * Cuota francesa. `principal <= 0` o `months <= 0` devuelven ceros: el campo del
 * importe se puede vaciar mientras se teclea y un `NaN` en pantalla es peor que
 * un cero.
 */
export function frenchLoan(principal: number, annualRate: number, months: number): Loan {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate)) return EMPTY_LOAN;
  if (principal <= 0 || months <= 0) return EMPTY_LOAN;

  const rate = annualRate / 100 / 12;
  const monthly = rate === 0 ? principal / months : (principal * rate) / (1 - (1 + rate) ** -months);
  const total = monthly * months;
  return { monthly, total, interest: total - principal };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Lo tecleado en es-ES: el punto es millar y la coma decimal. Devuelve `null`
 * cuando no hay número, para distinguir «campo vacío» de «cero».
 */
export function parseEsNumber(text: string): number | null {
  const cleaned = text.trim().replaceAll(".", "").replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * `6,5 %`. No es `fmtPct`: aquel escribe `+6,5 %` porque nació para variaciones
 * y un tipo contratado no lleva signo.
 */
export function fmtRate(value: number): string {
  return `${RATE_FORMAT.format(value)}${THIN_SPACE}%`;
}

/** El importe como se escribe en su campo al perder el foco: `150.000`. */
export function fmtAmountInput(value: number): string {
  return AMOUNT_INPUT_FORMAT.format(value);
}

/** El tipo como se escribe en su campo al perder el foco: `6,5`. */
export function fmtRateInput(value: number): string {
  return RATE_FORMAT.format(value);
}
