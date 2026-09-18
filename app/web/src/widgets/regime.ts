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
 * Color del régimen: un token por estado, sin colapsar dos regímenes en el mismo
 * color (`recovering` no es `improving` y `blip` no es `deteriorating`).
 * `shock_pending` no tiene token de régimen: es un aviso del negocio y se pinta
 * con `--content-alert` hasta que el sistema le dé el suyo.
 */
export const REGIME_CLASS: Record<Regime, string> = {
  warmup: "text-regime-warmup",
  stable: "text-regime-stable",
  improving: "text-regime-improving",
  deteriorating: "text-regime-deteriorating",
  blip: "text-regime-blip",
  shock_pending: "text-content-alert",
  recovering: "text-regime-recovering",
};

export const BAND_LABEL: Record<Band, string> = {
  A: "Sólida",
  B: "Sana",
  C: "Vigilancia",
  D: "Tensión",
};

/** Color de la banda: califica el nivel del score, no su dirección. */
export const BAND_CLASS: Record<Band, string> = {
  A: "text-band-solid",
  B: "text-band-healthy",
  C: "text-band-watch",
  D: "text-band-stress",
};
