/**
 * Utilidades del sistema de tokens de X-Ray.
 *
 * La fuente de verdad es `src/index.css`: aquí solo se parsea, se clasifica por
 * capa y se mide contraste. Ningún color vive en este fichero.
 */

/** Nombre de custom property (`--x`) → valor declarado, tal cual aparece en la hoja. */
export type TokenMap = Record<string, string>;

/** Capas del sistema: primitivo → semántico → componente, más los alias de shadcn. */
export type TokenLayer = "primitive" | "semantic" | "component" | "alias";

/** Alias de shadcn y de compatibilidad: nombres heredados que apuntan a semánticos. */
const ALIAS_NAMES = new Set([
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--radius",
  "--positive",
  "--negative",
  "--warning",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
]);

/** Primitivos sin familia: los dos extremos de la escala. */
const PRIMITIVE_NAMES = new Set(["--white", "--black"]);

/** Familias de la capa primitiva (el único sitio con valores literales). */
const PRIMITIVE_PREFIXES = [
  "--navy-",
  "--gray-",
  "--green-",
  "--red-",
  "--orange-",
  "--yellow-",
  "--aqua-",
  "--tone-",
  "--alpha-",
];

/** Familias de la capa semántica (siempre referencian un primitivo). */
const SEMANTIC_PREFIXES = [
  "--surface-",
  "--content-",
  "--fills-",
  "--border-",
  "--regime-",
  "--band-",
  "--chart-",
  "--treemap-",
];

/** Extrae toda custom property `--x: valor;` declarada en la hoja (ignora comentarios). */
export function parseThemeTokens(css: string): TokenMap {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: TokenMap = {};

  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
    const [, name, value] = match;
    tokens[name] = value.trim();
  }

  return tokens;
}

/** Clasifica un token por su nombre. Los alias de shadcn se comprueban primero. */
export function tokenLayer(name: string): TokenLayer {
  // Los alias mandan: `--border` es alias aunque `--border-primary` sea semántico.
  if (ALIAS_NAMES.has(name) || name.startsWith("--color-")) return "alias";
  if (PRIMITIVE_NAMES.has(name)) return "primitive";
  if (PRIMITIVE_PREFIXES.some((prefix) => name.startsWith(prefix))) return "primitive";
  if (name === "--bg") return "semantic";
  if (SEMANTIC_PREFIXES.some((prefix) => name.startsWith(prefix))) return "semantic";
  return "component";
}

/**
 * Expande recursivamente las `var(--x)` del valor de `name` hasta que no queda
 * ninguna. Lanza si hay ciclo o referencia inexistente.
 */
export function expandToken(tokens: TokenMap, name: string): string {
  return expand(tokens, name, []);
}

function expand(tokens: TokenMap, name: string, chain: readonly string[]): string {
  if (chain.includes(name)) {
    throw new Error(`Ciclo de referencias en los tokens: ${[...chain, name].join(" → ")}`);
  }

  const value = tokens[name];
  if (value === undefined) {
    throw new Error(`Token inexistente: ${name}`);
  }

  const nextChain = [...chain, name];
  return value.replace(/var\((--[\w-]+)\)/g, (_match, reference: string) =>
    expand(tokens, reference, nextChain),
  );
}

/** Color en espacio sRGB con canal alfa (0..1). */
type Rgba = { r: number; g: number; b: number; a: number };

/**
 * Ratio de contraste WCAG 2.1 entre dos colores hex (`#rgb`, `#rrggbb` o
 * `#rrggbbaa`: el alfa se compone sobre el otro color si este es opaco; si ambos
 * llevan alfa, se ignora). Devuelve un valor entre 1 y 21.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = parseHex(hexA);
  const b = parseHex(hexB);

  const bothTranslucent = a.a < 1 && b.a < 1;
  const solidA = bothTranslucent ? opaque(a) : composite(a, b);
  const solidB = bothTranslucent ? opaque(b) : composite(b, a);

  const lumA = relativeLuminance(solidA);
  const lumB = relativeLuminance(solidB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return (lighter + 0.05) / (darker + 0.05);
}

function parseHex(hex: string): Rgba {
  const digits = hex.trim().replace(/^#/, "");
  const expanded =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;

  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(expanded)) {
    throw new Error(`Color hex inválido: ${hex}`);
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16) / 255,
    g: Number.parseInt(expanded.slice(2, 4), 16) / 255,
    b: Number.parseInt(expanded.slice(4, 6), 16) / 255,
    a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

/** Descarta el alfa: el color se mide contra sí mismo, sin fondo con el que mezclar. */
function opaque({ r, g, b }: Rgba): Rgba {
  return { r, g, b, a: 1 };
}

/** Compone `front` (con alfa) sobre `back`; si `front` es opaco lo devuelve tal cual. */
function composite(front: Rgba, back: Rgba): Rgba {
  if (front.a >= 1) return front;

  return {
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  };
}

function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function channel(value: number): number {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
