/**
 * Traducción al español de los dominios cerrados del contrato v2 y su color.
 *
 * Un solo sitio: la etiqueta de régimen aparece en el selector de entidad, en la
 * tarjeta de score y en el buscador, y las tres deben decir exactamente lo mismo.
 */

import type { Band, Regime } from "@/lib/api-v2";

export const REGIME_LABEL: Record<Regime, string> = {
  warmup: "Calentamiento",
  stable: "Estable",
  improving: "Mejorando",
  deteriorating: "Deteriorándose",
  blip: "Bache",
  shock_pending: "Choque pendiente",
  recovering: "Recuperando",
};

/**
 * Color del régimen **como texto**: un token por estado, sin colapsar dos regímenes
 * en el mismo color (`recovering` no es `improving` y `blip` no es `deteriorating`).
 * `shock_pending` no tiene token de régimen: es un aviso del negocio y se pinta
 * con `--content-alert` hasta que el sistema le dé el suyo.
 *
 * Todo lo de aquí cumple el mínimo de 4,5:1 sobre `--bg` que exige
 * `docs/dani/contrato-visual-v1.md` §5. Para el trazo de la serie, `REGIME_STROKE_CLASS`.
 */
export const REGIME_CLASS: Record<Regime, string> = {
  // Único régimen que no usa su propio token: `--regime-warmup` mide 2,26:1 como texto.
  warmup: "text-content-secondary",
  stable: "text-regime-stable",
  improving: "text-regime-improving",
  deteriorating: "text-regime-deteriorating",
  blip: "text-regime-blip",
  shock_pending: "text-content-alert",
  recovering: "text-regime-recovering",
};

/**
 * Color del régimen **como trazo** de una serie: idéntico al de texto salvo en
 * `warmup`, donde el gris apagado de `--regime-warmup` sí dice lo correcto (histórico
 * insuficiente, serie de ruido). Al no ser texto no le aplica el mínimo de 4,5:1.
 *
 * Hoy el Buscador y la Tarjeta de score colorean su sparkline por el signo del delta,
 * no por régimen, y eso no cambia aquí: este mapa existe para XR-012, que unifica las
 * primitivas de gráfica y es quien decide qué serie se pinta por régimen.
 */
export const REGIME_STROKE_CLASS: Record<Regime, string> = {
  ...REGIME_CLASS,
  warmup: "text-regime-warmup",
};

export const BAND_LABEL: Record<Band, string> = {
  solid: "Sólida",
  healthy: "Sana",
  watch: "Vigilancia",
  stress: "Tensión",
};

/** Color de la banda: califica el nivel del score, no su dirección. */
export const BAND_CLASS: Record<Band, string> = {
  solid: "text-band-solid",
  healthy: "text-band-healthy",
  watch: "text-band-watch",
  stress: "text-band-stress",
};
