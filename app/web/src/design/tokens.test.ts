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
    // Corre sobre el `--navy-1000` que haya: XR-031 lo oscurece y el AA se mantiene.
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

/** Canales RGB (0–255) de un hex opaco `#rrggbb`. */
function channelsOf(hex: string): number[] {
  const digits = hex.replace("#", "");
  expect(digits, `${hex} tiene que ser opaco (#rrggbb)`).toMatch(/^[0-9a-f]{6}$/i);
  return [0, 2, 4].map((at) => Number.parseInt(digits.slice(at, at + 2), 16));
}

describe("XR-031: navy 1000, orbe azul y foco", () => {
  it("--navy-1000 is rgb(2, 10, 36) and still darker than --navy-950", () => {
    expect(channelsOf(tokens["--navy-1000"])).toEqual([2, 10, 36]);

    const black = expandToken(tokens, "--black");
    expect(contrastRatio(tokens["--navy-1000"], black)).toBeLessThan(
      contrastRatio(tokens["--navy-950"], black),
    );
    expect(tokens["--bg"]).toBe("var(--navy-1000)");
  });

  it("--blue-700 is a literal primitive and --orb-1 points to it", () => {
    expect(tokens["--blue-700"], "falta el primitivo --blue-700").toMatch(/^#[0-9a-f]{6}$/i);
    expect(tokenLayer("--blue-700")).toBe("primitive");
    expect(tokens["--orb-1"]).toBe("var(--blue-700)");
  });

  it("--spotlight is a semantic token that resolves without leaving a var()", () => {
    expect(tokens["--spotlight"], "falta --spotlight").toBeDefined();
    expect(tokenLayer("--spotlight")).toBe("semantic");
    expect(tokens["--spotlight"]).not.toMatch(/#[0-9a-f]/i);
    expect(tokenLayer(tokens["--spotlight"].replace(/^var\((--[\w-]+)\)$/, "$1"))).toBe(
      "primitive",
    );
    expect(expandToken(tokens, "--spotlight")).not.toContain("var(");
  });

  it("component tokens: spotlight size/blur/opacity, segment-sm 26px, stat-row 64px, popover 320px", () => {
    for (const name of [
      "--spotlight-size",
      "--spotlight-blur",
      "--spotlight-opacity",
      "--size-segment-sm",
      "--size-stat-row",
      "--size-popover-w",
    ]) {
      expect(tokens[name], `falta ${name}`).toBeDefined();
      expect(tokenLayer(name), `${name} no es de componente`).toBe("component");
    }
    expect(tokens["--size-segment-sm"]).toBe("26px");
    // XR-037 (E15): la fila de KPIs pasa a tarjetas glass con la cifra a 20 px.
    expect(tokens["--size-stat-row"]).toBe("64px");
    expect(tokens["--size-popover-w"]).toBe("320px");
  });

  it("the sheet declares .spotlight and hides it without hover", () => {
    expect(css).toContain(".spotlight");
    expect(css).toContain("@media (hover: none)");
  });
});

/** Mismo recorrido que el test de hex: fuentes `.ts`/`.tsx` de `src`, sin tests ni `test/`. */
function sourceFiles(): { file: string; source: string }[] {
  const srcRoot = path.resolve(import.meta.dirname, "..");
  return readdirSync(srcRoot, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file))
    .filter((file) => !/\.test\.tsx?$/.test(file) && !file.startsWith("test/"))
    .map((file) => ({ file, source: readFileSync(path.join(srcRoot, file), "utf8") }));
}

describe("XR-032: Inter", () => {
  it('--font-sans empieza por "Inter Variable" y --font-mono no existe', () => {
    expect(tokens["--font-sans"], "falta --font-sans").toBeDefined();
    expect(tokens["--font-sans"]).toMatch(/^"Inter Variable"/);
    // Una sola familia: las cifras van en Inter con `tabular-nums`, no en una monoespaciada.
    expect(tokens["--font-mono"]).toBeUndefined();
    expect(css).not.toContain("--font-mono");
    expect(css).not.toContain("Geist");
  });

  it("pesos 500/600/700 y --text-tile 16px", () => {
    // TR usa 500/580/680/740 de una fuente propia; con Inter se fijan tres pesos y nada más.
    expect(tokens["--font-weight-medium"]).toBe("500");
    expect(tokens["--font-weight-semibold"]).toBe("600");
    expect(tokens["--font-weight-bold"]).toBe("700");
    expect(tokens["--text-tile"]).toBe("16px");
    for (const name of [
      "--font-weight-medium",
      "--font-weight-semibold",
      "--font-weight-bold",
      "--text-tile",
    ]) {
      expect(tokenLayer(name), `${name} no es de componente`).toBe("component");
    }
  });

  it("ningún .tsx de src lleva font-mono ni font-[NNN]", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(10);

    for (const { file, source } of files) {
      expect(source, `${file} usa font-mono: las cifras van con .num, no con otra familia`).not.toMatch(
        /\bfont-mono\b/,
      );
      // `font-[580]` y similares: los pesos son los tres tokens, no números sueltos.
      expect(source, `${file} lleva un peso arbitrario font-[NNN]`).not.toMatch(/font-\[\d{3}\]/);
    }
  });
});

describe("XR-037 (E9): el score en azul claro y Liquidez en rosa", () => {
  it("--chart-score deja el blanco y pasa al aqua apagado de los tonos de pilar", () => {
    // La línea del score ya no cambia de color por régimen: un solo azul claro,
    // el mismo en la ficha y en el slot A de la Comparativa.
    expect(tokens["--chart-score"]).toBe("var(--tone-aqua)");
    expect(expandToken(tokens, "--chart-score")).toBe("#6fb9cc");
  });

  it("--tone-rose es un primitivo literal y solo lo referencia --chart-pillar-liquidity", () => {
    expect(tokens["--tone-rose"]).toBe("#c98fa8");
    expect(tokenLayer("--tone-rose")).toBe("primitive");
    // Liquidez se muda del aqua para no chocar con el score en la vista de familia.
    expect(tokens["--chart-pillar-liquidity"]).toBe("var(--tone-rose)");
    // Un primitivo no se consume desde un componente: solo lo toca la capa semántica.
    const consumers = Object.entries(tokens).filter(([, value]) => value.includes("var(--tone-rose)"));
    expect(consumers.map(([name]) => name)).toEqual(["--chart-pillar-liquidity"]);
  });

  it("los seis tonos de pilar son distintos y el score se distingue de Liquidez", () => {
    const tones = [
      "--tone-aqua",
      "--tone-green",
      "--tone-yellow",
      "--tone-orange",
      "--tone-violet",
      "--tone-rose",
    ].map((name) => expandToken(tokens, name));
    expect(new Set(tones).size).toBe(tones.length);
    // El rosa apagado no es el rojo del semáforo, que es el que sí alarma.
    expect(expandToken(tokens, "--tone-rose")).not.toBe(expandToken(tokens, "--red-500"));
    expect(expandToken(tokens, "--chart-pillar-liquidity")).not.toBe(
      expandToken(tokens, "--chart-score"),
    );
  });

  it("el slot A y el slot B de la Comparativa siguen siendo dos colores distintos", () => {
    // `ComparePanel` presta --chart-score al slot A y --content-accent al B. Con el
    // score en aqua apagado los dos son azules, así que lo que los separa ya no es
    // la luminancia (ratio 1,26) sino la saturación: apagado contra vivo.
    const slotA = expandToken(tokens, "--chart-score");
    const slotB = expandToken(tokens, "--content-accent");
    expect(slotA).toBe("#6fb9cc");
    expect(slotB).toBe("#5ed3e5");
    expect(slotA).not.toBe(slotB);
  });
});

describe("XR-038 (F0): dos tokens tipográficos y la animación de envío", () => {
  /** La escala completa tras XR-038: nueve tamaños y ninguno más. */
  const SCALE: Record<string, string> = {
    "--text-micro": "11px",
    "--text-control": "12px",
    "--text-body": "13px",
    "--text-panel-title": "14px",
    "--text-section": "15px",
    "--text-tile": "16px",
    "--text-widget-title": "18px",
    "--text-figure": "20px",
    "--text-figure-lg": "30px",
  };

  it("--text-section es 15px y --text-figure-lg es 30px, los dos de componente", () => {
    for (const name of ["--text-section", "--text-figure-lg"]) {
      expect(tokens[name], `falta ${name}`).toBeDefined();
      expect(tokenLayer(name), `${name} no es de componente`).toBe("component");
    }
    expect(tokens["--text-section"]).toBe("15px");
    expect(tokens["--text-figure-lg"]).toBe("30px");
  });

  it("la escala tipográfica tiene exactamente esos nueve tamaños", () => {
    // «Dos tokens nuevos y ninguno más»: cada «más grande» sube un escalón de la
    // escala, nunca inventa un `px` suelto.
    const declared = Object.keys(tokens).filter((name) => name.startsWith("--text-"));
    expect(declared.sort()).toEqual(Object.keys(SCALE).sort());
    for (const [name, value] of Object.entries(SCALE)) {
      expect(tokens[name], `${name} debe medir ${value}`).toBe(value);
    }
  });

  it("las dos utilidades de animación de W4.5 existen con su duración y su easing", () => {
    expect(tokens["--animate-envelope-fly"]).toBe("envelope-fly 900ms var(--ease-enter) both");
    expect(tokens["--animate-toast-enter"]).toBe(
      "toast-enter var(--duration-moderate) var(--ease-enter) both",
    );
    for (const name of ["--animate-envelope-fly", "--animate-toast-enter"]) {
      expect(tokenLayer(name), `${name} no es de componente`).toBe("component");
    }
  });

  it("los dos @keyframes están declarados en la hoja", () => {
    expect(css).toMatch(/@keyframes\s+envelope-fly\s*\{/);
    expect(css).toMatch(/@keyframes\s+toast-enter\s*\{/);
  });
});
