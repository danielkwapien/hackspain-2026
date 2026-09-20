/**
 * XR-038 (W2.4). A dos columnas el nombre de la señal iba a 11 px en gris y se
 * truncaba; la cifra, a 13 px, no destacaba sobre él. Nombre y valor suben un
 * escalón cada uno dentro de la escala, y la celda crece con ellos.
 *
 * El caso de control es `Dias de caja sobre salidas operativas` (`buffer_days`, 37
 * caracteres): el nombre más largo del catálogo que sirve la API, el que decide si
 * el cambio cabe a dos columnas.
 */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { SignalV2 } from "@/lib/api-v2";
import { FamilyStats } from "@/panels/research/FamilyStats";

/** `buffer_days`: 37 caracteres, el nombre más largo de las 21 señales del catálogo. */
const LONGEST_NAME = "Dias de caja sobre salidas operativas";

function signal(overrides: Partial<SignalV2> & { signal_id: string }): SignalV2 {
  return {
    name: "Dias de colchon de caja",
    unit: "dias",
    value: 32,
    value_fmt: "32 dias de colchon de caja",
    u: 0.62,
    u_smooth: 0.61,
    u_ref: 0.5,
    weight: 0.1,
    contribution: 0.4,
    delta_vs_prev: 0.02,
    is_available: true,
    quality_flag: null,
    series_24m: [],
    ...overrides,
  };
}

const SIGNALS: SignalV2[] = [
  signal({ signal_id: "L1" }),
  signal({ signal_id: "L2", name: LONGEST_NAME, value_fmt: "18 dias de caja sobre salidas" }),
  signal({
    signal_id: "L3",
    name: "Dias en negativo",
    value_fmt: "4 dias en negativo",
    quality_flag: "warmup",
  }),
  signal({
    signal_id: "D1",
    name: "Cuotas regulares",
    is_available: false,
    value: null,
    value_fmt: null,
    u: null,
    u_smooth: null,
    weight: 0,
    contribution: 0,
    delta_vs_prev: 0,
  }),
];

function cell(name: string): HTMLElement {
  const term = screen.getByTitle(name);
  const container = term.closest("div[style]");
  if (!container) throw new Error(`Sin celda para ${name}`);
  return container as HTMLElement;
}

describe("XR-038 (W2.4): los títulos de señal y su cifra", () => {
  it("DADO una señal con dato CUANDO se pinta ENTONCES nombre a 13 px blanco peso 600 y valor a 20 px peso 600", () => {
    render(<FamilyStats signals={SIGNALS} activeMonth={null} />);

    const name = screen.getByTitle("Dias de colchon de caja");
    expect(name.className).toContain("text-[length:var(--text-body)]");
    expect(name.className).toContain("font-semibold");
    expect(name.className).toContain("text-content-primary");

    const value = screen.getByTitle("32 dias de colchon de caja");
    expect(value.className).toContain("text-[length:var(--text-figure)]");
    expect(value.className).toContain("font-semibold");

    // El nombre deja de ser gris y micro: era lo que no se leía.
    const dt = name.closest("dt")!;
    expect(dt.className).not.toContain("text-[length:var(--text-micro)]");
    expect(dt.className).not.toContain("text-content-secondary");
  });

  it("DADO el nombre más largo del catálogo CUANDO cae en la retícula ENTONCES sigue completo en el title y la celda reserva --size-stat-row", () => {
    render(<FamilyStats signals={SIGNALS} activeMonth={null} />);

    const name = screen.getByTitle(LONGEST_NAME);
    expect(name).toHaveTextContent(LONGEST_NAME);
    // A dos columnas los nombres largos siguen truncando: el `title` es lo que
    // los rescata, y la celda tiene que dar de sí para el nombre y la cifra.
    expect(cell(LONGEST_NAME).style.minHeight).toBe("var(--size-stat-row)");
  });

  it("DADO la marca de calidad CUANDO acompaña al nombre ENTONCES se queda en micro, sin robarle el escalón", () => {
    render(<FamilyStats signals={SIGNALS} activeMonth={null} />);

    const badge = within(cell("Dias en negativo")).getByText("calentamiento");
    expect(badge.className).toContain("text-[length:var(--text-micro)]");
  });

  it("DADO una señal que no aplica CUANDO se pinta ENTONCES «No aplica» en secundario, no una cifra de 20 px", () => {
    render(<FamilyStats signals={SIGNALS} activeMonth={null} />);

    const empty = within(cell("Cuotas regulares")).getByText("No aplica");
    expect(empty.className).toContain("text-content-secondary");
    expect(empty.className).not.toContain("text-[length:var(--text-figure)]");
  });
});
