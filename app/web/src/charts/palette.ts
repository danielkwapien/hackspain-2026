/**
 * Paleta tipada de las primitivas de gráfica.
 *
 * Devuelve cadenas `var(--x)` listas para un `style`, para que ningún componente
 * escriba a mano el nombre de un token. La fuente de verdad sigue siendo
 * `src/index.css`: aquí se lee la hoja con `parseThemeTokens` y se falla pronto
 * si un token desaparece o se renombra.
 */

import css from "@/index.css?raw";
import { parseThemeTokens } from "@/design/tokens";

const sheet = parseThemeTokens(css);

/** `--x` → `var(--x)`, comprobando que el token existe en la hoja. */
function token(name: string): string {
  if (sheet[name] === undefined) {
    throw new Error(`Token de gráfica inexistente en index.css: ${name}`);
  }
  return `var(${name})`;
}

/** Los siete regímenes del motor (`docs/alfonso/ENGINE-EMBAT.md` §6.2). */
export type Regime =
  | "improving"
  | "deteriorating"
  | "blip"
  | "shock_pending"
  | "stable"
  | "recovering"
  | "warmup";

/** Banda de score. */
export type Band = "solid" | "healthy" | "watch" | "stress";

/** Signo del tamaño de un tile de treemap. */
export type TreemapSign = "pos" | "neg";

/** Escalón de intensidad de un tile de treemap. */
export type TreemapStep = 1 | 2 | 3 | 4;

const REGIME_TOKENS: Record<Regime, string> = {
  improving: "--regime-improving",
  deteriorating: "--regime-deteriorating",
  blip: "--regime-blip",
  // `shock_pending` es un bache aún sin confirmar («en tiempo real es sospecha»,
  // ENGINE-EMBAT.md §6.2): comparte color con `blip`, no tiene token propio.
  shock_pending: "--regime-blip",
  stable: "--regime-stable",
  recovering: "--regime-recovering",
  warmup: "--regime-warmup",
};

const BAND_TOKENS: Record<Band, string> = {
  solid: "--band-solid",
  healthy: "--band-healthy",
  watch: "--band-watch",
  stress: "--band-stress",
};

/** Color del régimen de un tramo de serie. */
export function regimeToken(regime: Regime): string {
  return token(REGIME_TOKENS[regime]);
}

/** Color de una banda de score. */
export function bandToken(band: Band): string {
  return token(BAND_TOKENS[band]);
}

/** Color de un tile de treemap por signo e intensidad. */
export function treemapToken(sign: TreemapSign, step: TreemapStep): string {
  return token(`--treemap-${sign}-${step}`);
}

/**
 * Todos los tokens que consumen las primitivas de `src/charts/`, sin repetir
 * (dos regímenes comparten el token de `blip`).
 */
export const CHART_TOKEN_NAMES: readonly string[] = [
  ...new Set([
    ...Object.values(REGIME_TOKENS),
    ...Object.values(BAND_TOKENS),
    "--treemap-pos-1",
    "--treemap-pos-2",
    "--treemap-pos-3",
    "--treemap-pos-4",
    "--treemap-neg-1",
    "--treemap-neg-2",
    "--treemap-neg-3",
    "--treemap-neg-4",
    "--chart-1",
    "--chart-2",
    "--content-positive",
    "--content-negative",
    "--content-secondary",
    "--content-tertiary",
    "--content-alert",
    "--alpha-white-5",
    "--alpha-white-10",
    "--alpha-white-30",
    "--surface-raised",
    "--surface-tooltip",
    "--bg",
    "--z-tooltip",
    "--size-sparkline-w",
    "--size-sparkline-h",
    "--size-chart-large",
    "--duration-fast",
    "--duration-moderate",
    "--ease-enter",
    "--radius-control",
    "--text-micro",
    "--text-control",
  ]),
];
