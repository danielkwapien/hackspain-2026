import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as charts from "@/charts";

const SRC_ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Los unicos sitios donde `recharts` puede aparecer: las primitivas (hoy
 * ninguna lo usa, pero la regla permite que una lo use por dentro) y el
 * wrapper legado de shadcn.
 */
const RECHARTS_ALLOWED = ["charts/", "components/ui/chart.tsx"];

function sourceFiles(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" }).filter((file) =>
    /\.tsx?$/.test(file),
  );
}

describe("charts/migration", () => {
  it("migration: no component outside src/charts imports recharts", () => {
    const offenders = sourceFiles().filter((file) => {
      const relative = file.split(path.sep).join("/");
      if (RECHARTS_ALLOWED.some((allowed) => relative.startsWith(allowed) || relative === allowed)) {
        return false;
      }
      return /from\s+["']recharts["']|require\(["']recharts["']\)/.test(
        readFileSync(path.join(SRC_ROOT, file), "utf8"),
      );
    });

    expect(offenders, `recharts fuera de su sitio: ${offenders.join(", ")}`).toEqual([]);
  });

  it("migration: the public surface exports the six primitives and the formatters", () => {
    for (const name of [
      "LineNoAxes",
      "Sparkline",
      "RangeBar",
      "PillarBar",
      "Treemap",
      "ChartTooltip",
    ]) {
      expect(charts, `falta la primitiva ${name}`).toHaveProperty(name);
    }

    for (const name of ["fmtPoints", "fmtDelta", "fmtPct", "fmtU", "fmtMonth", "fmtSize"]) {
      expect(charts, `falta el formateador ${name}`).toHaveProperty(name);
    }

    for (const name of ["regimeToken", "bandToken", "treemapToken", "pillarTone"]) {
      expect(charts, `falta ${name}`).toHaveProperty(name);
    }
  });

  it("migration: the public surface does not re-export recharts", () => {
    // La palabra puede aparecer en un comentario; lo que no puede aparecer es
    // una sentencia que la importe o la reexporte.
    const surface = readFileSync(path.join(SRC_ROOT, "charts/index.ts"), "utf8");
    expect(surface).not.toMatch(/(?:from|require\()\s*["']recharts["']/);
    // Ni de rebote: ninguna primitiva lo importa hoy.
    const inside = readdirSync(path.join(SRC_ROOT, "charts"), { encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !file.includes(".test."))
      .filter((file) =>
        /from\s+["']recharts["']/.test(readFileSync(path.join(SRC_ROOT, "charts", file), "utf8")),
      );
    expect(inside).toEqual([]);
  });
});
