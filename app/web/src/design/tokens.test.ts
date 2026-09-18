import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import css from "@/index.css?raw";
import { contrastRatio, expandToken, parseThemeTokens, tokenLayer } from "@/design/tokens";

const tokens = parseThemeTokens(css);
const semanticNames = Object.keys(tokens).filter((name) => tokenLayer(name) === "semantic");

/** Alias de shadcn → token semántico al que tiene que apuntar, literalmente. */
const SHADCN_ALIASES: Record<string, string> = {
  "--background": "--bg",
  "--foreground": "--content-primary",
  "--card": "--surface-primary",
  "--popover": "--surface-elevated",
  "--primary": "--content-accent",
  "--secondary": "--surface-elevated",
  "--muted": "--surface-elevated",
  "--muted-foreground": "--content-secondary",
  "--accent": "--surface-raised",
  "--destructive": "--content-negative",
  "--border": "--border-primary",
  "--input": "--border-primary",
  "--ring": "--border-focus",
  "--positive": "--content-positive",
  "--negative": "--content-negative",
  "--warning": "--content-warning",
  "--chart-1": "--chart-score",
  "--chart-2": "--chart-band",
  "--chart-3": "--chart-positive",
  "--chart-4": "--chart-negative",
  "--chart-5": "--chart-neutral",
};

const REGIMES = [
  "--regime-improving",
  "--regime-deteriorating",
  "--regime-blip",
  "--regime-stable",
  "--regime-recovering",
  "--regime-warmup",
];

const BANDS = ["--band-solid", "--band-healthy", "--band-watch", "--band-stress"];

describe("tokens", () => {
  it("every semantic token resolves to a primitive (no raw hex in semantic layer)", () => {
    expect(semanticNames.length).toBeGreaterThan(30);

    for (const name of semanticNames) {
      const raw = tokens[name];
      expect(raw, `${name} lleva un hex crudo: la capa semántica solo referencia primitivos`)
        .not.toMatch(/#[0-9a-f]/i);

      const refs = [...raw.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]);
      expect(refs.length, `${name} no referencia ningún primitivo`).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(tokenLayer(ref), `${name} referencia ${ref}, que no es un primitivo`).toBe(
          "primitive",
        );
      }
      expect(expandToken(tokens, name)).not.toContain("var(");
    }
  });

  it("shadcn aliases map to semantic tokens", () => {
    for (const [alias, semantic] of Object.entries(SHADCN_ALIASES)) {
      expect(tokens[alias], `falta el alias ${alias}`).toBeDefined();
      expect(tokens[alias], `${alias} debe apuntar a ${semantic}`).toBe(`var(${semantic})`);
      expect(tokenLayer(semantic)).toBe("semantic");
    }
  });

  it("regime and band tokens exist and are distinct", () => {
    for (const group of [REGIMES, BANDS]) {
      const values = group.map((name) => {
        expect(tokens[name], `falta ${name}`).toBeDefined();
        return expandToken(tokens, name);
      });
      expect(new Set(values).size, `valores repetidos en ${group.join(", ")}`).toBe(group.length);
    }
  });

  it("contrast of content-primary and content-secondary on bg and surface-primary >= 4.5", () => {
    for (const content of ["--content-primary", "--content-secondary"]) {
      for (const surface of ["--bg", "--surface-primary"]) {
        const ratio = contrastRatio(expandToken(tokens, content), expandToken(tokens, surface));
        expect(ratio, `${content} sobre ${surface}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it("contrast of positive/negative/alert on surface-primary >= 3.0 (large text / graphics)", () => {
    const surface = expandToken(tokens, "--surface-primary");
    for (const content of ["--content-positive", "--content-negative", "--content-alert"]) {
      const ratio = contrastRatio(expandToken(tokens, content), surface);
      expect(ratio, `${content} sobre --surface-primary: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("no hex literal outside index.css", () => {
    const srcRoot = path.resolve(import.meta.dirname, "..");
    const files = readdirSync(srcRoot, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => !/\.test\.tsx?$/.test(file) && !file.startsWith("test/"));

    expect(files.length).toBeGreaterThan(10);

    for (const file of files) {
      const source = readFileSync(path.join(srcRoot, file), "utf8")
        // Selectores de atributo de recharts (`[stroke='#ccc']`): no son color nuestro.
        .replace(/\[[\w-]+='#[0-9a-fA-F]{3,8}'\]/g, "");
      expect(source, `${file} define un color literal: los colores viven en index.css`).not.toMatch(
        /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/,
      );
    }
  });
});
