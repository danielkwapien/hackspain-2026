/**
 * Etiquetas del treemap: cuerpo por área, truncado por ancho y umbral de texto.
 *
 * Aritmética pura, sin React: lo que decide qué texto entra en un tile y a qué
 * tamaño, medido como lo hace Trade Republic (ticker 700 en 16/13/11 px según
 * el área, tiles pequeños sin texto). El ancho de un texto se estima por
 * caracteres, no se mide en el DOM: `AVG_CHAR_EM` es el ancho medio de un
 * carácter de Inter en em, suficiente para decidir un corte sin `overflow`.
 */

/** Ancho medio de un carácter de Inter en em. */
export const AVG_CHAR_EM = 0.56;

/** Cuerpos de tile, de mayor a menor (`--text-tile`, `--text-body`, `--text-micro`). */
export type TileFontSize = 16 | 13 | 11;

/** Área a partir de la cual el tile va a 16 px. */
const LARGE_TILE_AREA = 20_000;
/** Área a partir de la cual el tile va a 13 px; por debajo, 11 px. */
const MEDIUM_TILE_AREA = 8_000;

/** Alto mínimo, en cuerpos, para nombre y valor. */
const NAME_AND_VALUE_LINES = 2.4;
/** Alto mínimo, en cuerpos, para solo el nombre. */
const NAME_ONLY_LINES = 1.3;
/** Ancho mínimo en caracteres: por debajo, ni una letra con su elipsis. */
const MIN_CHARS = 2;

const ELLIPSIS = "…";

/** Cuerpo del tile según su área en px². */
export function tileFontSize(area: number): TileFontSize {
  if (area >= LARGE_TILE_AREA) return 16;
  if (area >= MEDIUM_TILE_AREA) return 13;
  return 11;
}

/** Ancho estimado de `text` en px a un cuerpo dado. */
export function textWidth(text: string, fontSize: number, avgCharEm = AVG_CHAR_EM): number {
  return text.length * fontSize * avgCharEm;
}

/** Corta `text` con «…» para que quepa en `widthPx`; entero si ya cabe. */
export function truncateLabel(
  text: string,
  widthPx: number,
  fontSize: number,
  avgCharEm = AVG_CHAR_EM,
): string {
  const maxChars = Math.floor(widthPx / (fontSize * avgCharEm));
  if (text.length <= maxChars) return text;
  if (maxChars < MIN_CHARS) return "";
  return `${text.slice(0, maxChars - 1)}${ELLIPSIS}`;
}

/**
 * Qué texto entra en un rect a un cuerpo dado: nombre y valor desde 2,4 cuerpos
 * de alto, solo el nombre desde 1,3 y nada por debajo. Un tile demasiado
 * estrecho para dos caracteres tampoco lleva texto, por alto que sea.
 */
export function showsLabel(
  rect: { width: number; height: number },
  fontSize: number,
): { name: boolean; value: boolean } {
  const wideEnough = rect.width >= MIN_CHARS * fontSize * AVG_CHAR_EM;
  const name = wideEnough && rect.height >= NAME_ONLY_LINES * fontSize;
  const value = name && rect.height >= NAME_AND_VALUE_LINES * fontSize;
  return { name, value };
}
