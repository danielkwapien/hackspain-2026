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

/** Compone un hex con alfa (`#rrggbbaa`) sobre un fondo opaco: `fg·a + bg·(1−a)` por canal. */
function over(front: string, back: string): string {
  const fg = front.replace("#", "");
  const bg = back.replace("#", "");
  expect(bg, `${back} tiene que ser opaco (#rrggbb)`).toMatch(/^[0-9a-f]{6}$/i);
  const alpha = fg.length === 8 ? Number.parseInt(fg.slice(6, 8), 16) / 255 : 1;
  const channels = [0, 2, 4].map((at) => {
    const f = Number.parseInt(fg.slice(at, at + 2), 16);
    const b = Number.parseInt(bg.slice(at, at + 2), 16);
    return Math.round(f * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

describe("XR-030: navy, glass y orbe", () => {
  const CONTENT = [
    "--content-secondary",
    "--content-negative",
    "--content-positive",
    "--content-alert",
  ];

  it("--navy-1000 is a literal primitive darker than --navy-950 and --bg points to it", () => {
    expect(tokens["--navy-1000"], "falta el primitivo --navy-1000").toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokenLayer("--navy-1000")).toBe("primitive");

    // Contra negro el ratio crece con la luminancia: más oscuro es menor ratio.
    const black = expandToken(tokens, "--black");
    expect(contrastRatio(tokens["--navy-1000"], black)).toBeLessThan(
      contrastRatio(tokens["--navy-950"], black),
    );

    expect(tokens["--bg"]).toBe("var(--navy-1000)");
  });

  it("glass and orb semantic tokens exist and resolve without leaving a var()", () => {
    for (const name of [
      "--surface-glass",
      "--surface-glass-hover",
      "--border-glass",
      "--orb-1",
      "--orb-2",
    ]) {
      expect(tokens[name], `falta ${name}`).toBeDefined();
      expect(tokens[name], `${name} lleva un hex crudo`).not.toMatch(/#[0-9a-f]/i);
      expect(expandToken(tokens, name)).not.toContain("var(");
    }
  });

  it("component tokens: glass blur, orb, panel title 14px and table row 28px", () => {
    for (const name of ["--blur-glass", "--orb-size", "--orb-blur", "--orb-drift"]) {
      expect(tokens[name], `falta ${name}`).toBeDefined();
      expect(tokenLayer(name)).toBe("component");
    }
    expect(tokens["--text-panel-title"]).toBe("14px");
    expect(tokens["--size-table-row"]).toBe("28px");
  });

  it("the sheet declares the global prefers-reduced-motion rule", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("content colors keep AA (>= 4.5) on navy-1000 and on glass composed over it", () => {
    const navy = expandToken(tokens, "--navy-1000");
    const glass = over(expandToken(tokens, "--surface-glass"), navy);

    for (const content of CONTENT) {
      const color = expandToken(tokens, content);
      const onNavy = contrastRatio(color, navy);
      expect(onNavy, `${content} sobre --navy-1000: ${onNavy.toFixed(2)}`).toBeGreaterThanOrEqual(
        4.5,
      );
      const onGlass = contrastRatio(color, glass);
      expect(
        onGlass,
        `${content} sobre --surface-glass compuesto en navy-1000: ${onGlass.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
