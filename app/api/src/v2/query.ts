/**
 * Validación de query params para v2, con el mismo patrón que v1: dominio
 * cerrado, 400 con `{error, message}` y el mensaje diciendo qué valores valen.
 */

export const BANDS = ["solid", "healthy", "watch", "stress"] as const;
export const REGIMES = [
  "warmup",
  "stable",
  "improving",
  "deteriorating",
  "blip",
  "shock_pending",
  "recovering",
] as const;
export const UNITS = ["company", "group"] as const;
export const UNIVERSE_SORTS = ["score", "delta_1m", "delta_3m"] as const;
export const ORDERS = ["asc", "desc"] as const;
export const GROUP_BYS = ["group", "country", "erp"] as const;
export const METRICS = ["delta_3m", "delta_1m", "score"] as const;
export const SIZE_BYS = [
  "op_in_12m",
  "n_companies",
  "n_invoices",
  "n_transactions",
  "pending_eur",
] as const;
export const SEVERITIES = ["watch", "review", "urgent"] as const;
export const DIRECTIONS = ["down", "up"] as const;
export const PILLARS = ["L", "P", "C", "D", "A"] as const;

export const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export type QueryReader = {
  /** Texto libre ya recortado, o `null` si no viene. */
  text: (key: string) => string | null;
  /** Identificador con formato fijo (`COMP_0001`, `GROUP_0001`). */
  id: (key: string, pattern: RegExp, example: string) => string | null;
  enumOf: <T extends string>(key: string, domain: readonly T[], fallback: T) => T;
  optionalEnum: <T extends string>(key: string, domain: readonly T[]) => T | null;
  int: (key: string, min: number, max: number, fallback: number) => number;
  /** Mes libre (`YYYY-MM`), sin exigir que exista en el dataset. */
  month: (key: string) => string | null;
  /** Mes que debe existir en el dataset; si no viene, el último disponible. */
  asOf: (key: string, months: string[]) => string;
  readonly message: string | null;
};

export function reader(query: Record<string, unknown>): QueryReader {
  let message: string | null = null;
  const fail = (text: string): void => {
    if (message === null) message = text;
  };
  const raw = (key: string): string | null => {
    const value = query[key];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };

  return {
    text: raw,
    id(key, pattern, example) {
      const value = raw(key);
      if (value === null) return null;
      if (!pattern.test(value)) {
        fail(`${key} inválido: ${value}. Formato esperado ${example}`);
        return null;
      }
      return value;
    },
    enumOf(key, domain, fallback) {
      const value = raw(key);
      if (value === null) return fallback;
      if (!(domain as readonly string[]).includes(value)) {
        fail(`${key} inválido: ${value}. Válidos: ${domain.join(", ")}`);
        return fallback;
      }
      return value as typeof fallback;
    },
    optionalEnum(key, domain) {
      const value = raw(key);
      if (value === null) return null;
      if (!(domain as readonly string[]).includes(value)) {
        fail(`${key} inválido: ${value}. Válidos: ${domain.join(", ")}`);
        return null;
      }
      return value as (typeof domain)[number];
    },
    int(key, min, max, fallback) {
      const value = raw(key);
      if (value === null) return fallback;
      if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
        fail(`${key} inválido: ${value}. Entero entre ${min} y ${max}`);
        return fallback;
      }
      return Number(value);
    },
    month(key) {
      const value = raw(key);
      if (value === null) return null;
      if (!MONTH_PATTERN.test(value)) {
        fail(`${key} inválido: ${value}. Formato esperado YYYY-MM`);
        return null;
      }
      return value;
    },
    asOf(key, months) {
      const last = months.at(-1) ?? "";
      const value = raw(key);
      if (value === null) return last;
      if (!MONTH_PATTERN.test(value) || !months.includes(value)) {
        fail(`${key} inválido: ${value}. Válidos: de ${months[0]} a ${last} (YYYY-MM)`);
        return last;
      }
      return value;
    },
    get message() {
      return message;
    },
  };
}
