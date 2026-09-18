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
 * Color del régimen: solo significado (mejora, deterioro, aviso), nunca decoración.
 * `warmup` es "todavía no sabemos" y `stable` es "sin noticias": ambos neutros.
 */
export const REGIME_CLASS: Record<Regime, string> = {
  warmup: "text-muted-foreground",
  stable: "text-foreground",
  improving: "text-positive",
  deteriorating: "text-negative",
  blip: "text-warning",
  shock_pending: "text-negative",
  recovering: "text-positive",
};

export const BAND_LABEL: Record<Band, string> = {
  A: "Sólida",
  B: "Sana",
  C: "Vigilancia",
  D: "Tensión",
};
