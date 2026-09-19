/**
 * Guardarrail contra el motor antiguo.
 *
 * `scores` y `score_exports` siguen en MotherDuck, pero la API ya no las lee:
 * mientras alguna consulta las nombre, la misma entidad puede salir con dos
 * numeros distintos segun la ruta. El universo de sociedades sale de
 * `company_scores` y la fecha de corte de `engine_exports`.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "src");

/**
 * `score_exports` solo puede ser una tabla. `scores` se prohibe solo en
 * posicion de tabla: `company_scores` y `group_scores` son las tablas buenas y
 * `scores` tambien es el nombre de una columna del catalogo de senales.
 */
const LEGACY_TABLE = /\bscore_exports\b|\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:[A-Za-z_]\w*\.)?scores\b/i;

function sourceFiles(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => file.split(path.sep).join("/"));
}

describe("motherduck/legacy-tables", () => {
  it("DADO el codigo de la API CUANDO se buscan las tablas del motor antiguo ENTONCES ninguna consulta nombra scores ni score_exports", () => {
    const offenders = sourceFiles().flatMap((file) =>
      readFileSync(path.join(SRC_ROOT, file), "utf8")
        .split("\n")
        .flatMap((line, index) =>
          LEGACY_TABLE.test(line) ? [`src/${file}:${index + 1}: ${line.trim()}`] : [],
        ),
    );

    expect(
      offenders,
      `Tablas del motor antiguo en la API (usa company_scores y engine_exports):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("DADO las consultas vivas CUANDO se buscan las tablas del motor real ENTONCES el universo y el corte salen de ellas", () => {
    const sources = sourceFiles().map((file) => readFileSync(path.join(SRC_ROOT, file), "utf8"));

    expect(sources.some((source) => /FROM\s+company_scores\b/.test(source))).toBe(true);
    expect(sources.some((source) => /FROM\s+engine_exports\b/.test(source))).toBe(true);
  });
});
