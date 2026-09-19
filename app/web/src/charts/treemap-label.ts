/**
 * Etiquetas del treemap: cuerpo por área, truncado por ancho y umbral de texto.
 *
 * Aritmética pura, sin React: lo que decide qué texto entra en un tile y a qué
 * tamaño, medido como lo hace Trade Republic (ticker 700 en 16/13/11 px según
 * el área, tiles pequeños sin texto). El ancho de un texto se estima por
 * caracteres, no se mide en el DOM: `AVG_CHAR_EM` es el ancho medio de un
 * carácter de Inter en em, suficiente para decidir un corte sin `overflow`. Hay
 * dos, y no es un detalle: el nombre va en negrita y ocupa un 22 % más que la
 * cifra al mismo cuerpo (`BOLD_CHAR_EM` frente a `AVG_CHAR_EM`).
 */

/** Relleno horizontal de tile y cabecera (`px-1`), en px, a descontar del ancho útil. */
export const TEXT_PADDING = 8;

/** Ancho medio de un carácter de Inter en peso normal, en em: la CIFRA del tile. */
export const AVG_CHAR_EM = 0.56;

/**
 * Ancho medio de un carácter de Inter en negrita (700), en em: el NOMBRE del tile.
 *
 * No es una estimación: «COMP_0075» a 11 px / 700 mide 67,7 px en el DOM real
 * —medido con `getBoundingClientRect` sobre un `Range` puesto al span del tile,
 * no calculado—, o sea 0,684 em por carácter, un 22 % más que los 0,56 del peso
 * normal (la misma cadena en normal mide 0,509 em). Se redondea a 0,70 para
 * dejar margen: el tile NO lleva `overflow: hidden` por contrato, así que
 * quedarse corto al medir se ve como texto desbordado sobre el tile vecino.
 */
export const BOLD_CHAR_EM = 0.7;

/** Cuerpos de tile, de mayor a menor (`--text-tile`, `--text-body`, `--text-micro`). */
export type TileFontSize = 16 | 13 | 11;

/** Cuerpo de la cifra bajo el nombre: 13 bajo un nombre de 16, 11 en el resto. */
export const VALUE_FONT_SIZE: Record<TileFontSize, TileFontSize> = { 16: 13, 13: 11, 11: 11 };

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

/** Cuerpos del tile, de mayor a menor: el orden en que se prueban. */
export const TILE_FONT_SIZES: readonly TileFontSize[] = [16, 13, 11];

/** El menor cuerpo: el suelo cuando ni siquiera él cabe. */
export const SMALLEST_FONT_SIZE: TileFontSize = 11;

/** TOPE de cuerpo según el área del tile en px²: una ficha enorme no va a 11 px. */
export function tileFontSize(area: number): TileFontSize {
  if (area >= LARGE_TILE_AREA) return 16;
  if (area >= MEDIUM_TILE_AREA) return 13;
  return SMALLEST_FONT_SIZE;
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
  // El suelo de ancho lo fija el NOMBRE, que va en negrita: con `AVG_CHAR_EM` se
  // daría por bueno un tile donde `truncateLabel` ya no devuelve ni un carácter.
  const wideEnough = rect.width >= MIN_CHARS * fontSize * BOLD_CHAR_EM;
  const name = wideEnough && rect.height >= NAME_ONLY_LINES * fontSize;
  const value = name && rect.height >= NAME_AND_VALUE_LINES * fontSize;
  return { name, value };
}

/**
 * ¿Entran DE VERDAD el código y su cifra en este rect a este cuerpo? Alto para
 * las dos líneas, el código entero sin elipsis y la cifra entera a lo ancho.
 * Es el suelo de legibilidad del Mapa, el mismo que mide `fitCount`.
 */
export function labelFits(
  rect: { width: number; height: number },
  fontSize: TileFontSize,
  code: string,
  valueText: string,
): boolean {
  if (!showsLabel(rect, fontSize).value) return false;
  const usable = rect.width - TEXT_PADDING;
  // El código va en negrita; la cifra, en peso normal y un cuerpo por debajo.
  if (truncateLabel(code, usable, fontSize, BOLD_CHAR_EM) !== code) return false;
  return textWidth(valueText, VALUE_FONT_SIZE[fontSize]) <= usable;
}

/**
 * Cuerpo real de una ficha: el MAYOR de 16 / 13 / 11 que cabe de verdad, con el
 * área como tope. `null` cuando no cabe ninguno.
 *
 * Que el cuerpo saliera solo del área (`tileFontSize`) rompía la monotonía del
 * Mapa: ensancharlo hacía DESAPARECER fichas. Medido en el navegador, un panel
 * de 537 px enseñaba 12 fichas y uno de 571 px, más ancho, solo 9. La cadena es
 * esta: `fitCount` prueba `n` de mayor a menor, al bajar `n` las fichas crecen,
 * el área sube el cuerpo a 13 o 16 px, un cuerpo mayor pide más ancho por
 * carácter, el código deja de caber y el reparto se rechaza. El área sigue
 * siendo el TOPE —una ficha enorme no lleva 11 px— pero ya no puede forzar un
 * cuerpo que no cabe: si a 16 px el código se corta, la ficha se pinta a 13.
 */
export function fitFontSize(
  rect: { width: number; height: number },
  code: string,
  valueText: string,
): TileFontSize | null {
  const cap = tileFontSize(rect.width * rect.height);
  for (const fontSize of TILE_FONT_SIZES) {
    if (fontSize > cap) continue;
    if (labelFits(rect, fontSize, code, valueText)) return fontSize;
  }
  return null;
}
