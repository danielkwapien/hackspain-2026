import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import css from "@/index.css?raw";
import {
  DYNAMIC_TOKEN_NAMES,
  bandToken,
  regimeToken,
  treemapToken,
  type Band,
  type Regime,
} from "@/charts/palette";
import { parseThemeTokens } from "@/design/tokens";

const tokens = parseThemeTokens(css);

/** Los siete regímenes del motor (ENGINE-EMBAT.md §6.2), no los seis con token propio. */
const REGIMES: readonly Regime[] = [
  "improving",
  "deteriorating",
  "blip",
  "shock_pending",
  "stable",
  "recovering",
  "warmup",
];

const BANDS: readonly Band[] = ["solid", "healthy", "watch", "stress"];

describe("charts/palette", () => {
  it("palette: every chart token referenced by the primitives exists in index.css", () => {
    // La lista a mano no sirve: se dejo fuera `--radius-pill` y `--content-primary`
    // y el test paso igual. Se escanean las fuentes, que es lo unico exhaustivo.
    const chartsRoot = import.meta.dirname;
    const sources = readdirSync(chartsRoot, { recursive: true, encoding: "utf8" }).filter((file) =>
      /\.tsx?$/.test(file),
    );

    const referenced = new Set<string>();
    for (const file of sources) {
      // Los comentarios fuera: un `var(--x)` de un JSDoc no es un token.
      const source = readFileSync(path.join(chartsRoot, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const [, name] of source.matchAll(/var\((--[a-z0-9-]+)\)/g)) referenced.add(name);
    }
    // Los que se construyen con plantilla no los ve un escaneo estatico.
    for (const name of DYNAMIC_TOKEN_NAMES) referenced.add(name);

    expect(referenced.size).toBeGreaterThan(20);
    expect(referenced).toContain("--radius-pill");
    expect(referenced).toContain("--content-primary");

    for (const name of referenced) {
      expect(tokens[name], `${name} no existe en index.css`).toBeDefined();
    }
  });

  it("palette: regimeToken covers the seven engine regimes and shock_pending shares the blip token", () => {
    for (const regime of REGIMES) {
      const value = regimeToken(regime);
      expect(value).toMatch(/^var\(--regime-[a-z]+\)$/);
      expect(DYNAMIC_TOKEN_NAMES).toContain(value.slice(4, -1));
    }

    expect(regimeToken("improving")).toBe("var(--regime-improving)");
    expect(regimeToken("warmup")).toBe("var(--regime-warmup)");
    // `shock_pending` es un bache aún sin confirmar: comparte color con `blip`.
    expect(regimeToken("shock_pending")).toBe(regimeToken("blip"));
    expect(regimeToken("shock_pending")).toBe("var(--regime-blip)");

    // Seis tokens distintos para siete regímenes.
    expect(new Set(REGIMES.map(regimeToken)).size).toBe(6);
  });

  it("palette: bandToken covers the four bands", () => {
    expect(BANDS.map(bandToken)).toEqual([
      "var(--band-solid)",
      "var(--band-healthy)",
      "var(--band-watch)",
      "var(--band-stress)",
    ]);
  });

  it("palette: treemapToken covers the eight intensity steps", () => {
    const steps = [1, 2, 3, 4] as const;
    expect(steps.map((step) => treemapToken("pos", step))).toEqual([
      "var(--treemap-pos-1)",
      "var(--treemap-pos-2)",
      "var(--treemap-pos-3)",
      "var(--treemap-pos-4)",
    ]);
    expect(steps.map((step) => treemapToken("neg", step))).toEqual([
      "var(--treemap-neg-1)",
      "var(--treemap-neg-2)",
      "var(--treemap-neg-3)",
      "var(--treemap-neg-4)",
    ]);
  });

  it("palette: no hex literal in src/charts", () => {
    const chartsRoot = import.meta.dirname;
    const files = readdirSync(chartsRoot, { recursive: true, encoding: "utf8" }).filter((file) =>
      /\.tsx?$/.test(file),
    );

    expect(files.length).toBeGreaterThan(1);

    for (const file of files) {
      const source = readFileSync(path.join(chartsRoot, file), "utf8");
      expect(source, `${file} define un color literal: los colores viven en index.css`).not.toMatch(
        /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/,
      );
    }
  });
});
