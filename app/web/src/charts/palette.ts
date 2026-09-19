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
 * Nombres de token que `palette.ts` resuelve por si mismo (los dinamicos: los
 * construye con plantilla, asi que ningun escaneo estatico del codigo los ve).
 * Los tokens escritos literalmente como `var(--x)` en las primitivas NO viven
 * aqui: los descubre el test recorriendo las fuentes, que es la unica forma de
 * que «todos» sea de verdad todos.
 */
export const DYNAMIC_TOKEN_NAMES: readonly string[] = [
  ...new Set([...Object.values(REGIME_TOKENS), ...Object.values(BAND_TOKENS)]),
  "--treemap-pos-1",
  "--treemap-pos-2",
  "--treemap-pos-3",
  "--treemap-pos-4",
  "--treemap-neg-1",
  "--treemap-neg-2",
  "--treemap-neg-3",
  "--treemap-neg-4",
];
