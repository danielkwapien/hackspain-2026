import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkline, sparklinePath } from "@/charts/Sparkline";
import * as format from "@/charts/format";

/** Δ +3,5: por encima del umbral de neutro. */
const UP = [10, 11, 12, 13.5];
/** Δ −3,5. */
const DOWN = [13.5, 12, 11, 10];
/** Δ +0,3: por debajo del umbral de neutro 0,5, así que no tiene dirección. */
const FLAT = [10, 10.1, 10.2, 10.3];

function line(points: readonly number[], extra?: { regime?: "recovering"; dot?: boolean }) {
  const { container } = render(<Sparkline points={points} {...extra} />);
  return {
    svg: container.querySelector("svg") as SVGSVGElement,
    path: container.querySelector("path") as SVGPathElement,
    dot: container.querySelector("circle") as SVGCircleElement | null,
  };
}

describe("charts/Sparkline", () => {
  it("Sparkline: renders 64x16 by default and colors by delta sign with a 0.5 neutral threshold", () => {
    const up = line(UP);

    expect(up.svg).toHaveAttribute("viewBox", "0 0 64 16");
    expect(up.svg).toHaveAttribute("preserveAspectRatio", "none");
    expect(up.svg).toHaveAttribute("role", "img");
    expect(up.svg.style.width).toBe("var(--size-sparkline-w)");
    expect(up.svg.style.height).toBe("var(--size-sparkline-h)");
    expect(up.svg.style.overflow).not.toBe("visible");
    // Sin ejes, sin rejilla, sin relleno y sin puntos: solo el trazo.
    expect(up.svg.querySelectorAll("path")).toHaveLength(1);
    expect(up.svg.querySelectorAll("circle")).toHaveLength(0);
    expect(up.path.style.fill).toBe("none");
    expect(up.path.getAttribute("stroke-width")).toBe("1.5");

    // El signo del Δ del rango (último − primero) decide el tono.
    expect(up.path.style.stroke).toBe("var(--content-positive)");
    expect(line(DOWN).path.style.stroke).toBe("var(--content-negative)");
    expect(line(FLAT).path.style.stroke).toBe("var(--content-secondary)");

    // La dirección viaja también en palabras: el verde y el rojo quedan a ΔE 6,2
    // en deutan y solo son legales con codificación secundaria (spec §6).
    expect(screen.getByRole("img", { name: /sube/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /baja/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /estable/i })).toBeInTheDocument();

    // Si se pasa un régimen, manda el token del régimen; la palabra sigue siendo el Δ.
    const recovering = line(DOWN, { regime: "recovering" });
    expect(recovering.path.style.stroke).toBe("var(--regime-recovering)");
    expect(recovering.svg.getAttribute("aria-label")).toMatch(/baja/i);

    // `dot` marca el último punto con 2 px del mismo color.
    const dotted = line(UP, { dot: true });
    expect(dotted.dot).not.toBeNull();
    expect(dotted.dot).toHaveAttribute("r", "1");
    expect(dotted.dot?.style.fill).toBe("var(--content-positive)");

    // `width`/`height` sobreescriben el tamaño por defecto, y la geometría con ellos.
    const { container } = render(<Sparkline points={UP} width={120} height={32} />);
    const custom = container.querySelector("svg") as SVGSVGElement;
    expect(custom).toHaveAttribute("viewBox", "0 0 120 32");
    expect(custom.style.width).toBe("120px");
    expect(custom.style.height).toBe("32px");

    // La geometría es pura y cabe dentro del lienzo.
    const d = sparklinePath(UP, 64, 16);
    expect(d).toMatch(/^M /);
    expect(d.match(/L /g)).toHaveLength(UP.length - 1);
    for (const [x, y] of [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]])) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(64);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(16);
    }
    // Serie plana: la línea va por el centro y no divide por cero.
    expect(sparklinePath([5, 5, 5], 64, 16)).toBe("M 0.75 8 L 32 8 L 63.25 8");
  });

  it("Sparkline: is memoized and renders 500 instances under the performance budget", () => {
    // El testigo del re-render es `fmtDelta`, no `sparklinePath`: bajo la transformación
    // SSR de Vite una llamada interna al propio módulo no pasa por el namespace, así que
    // un `vi.spyOn` sobre `sparklinePath` no se dispararía nunca y la aserción sería vacía.
    // `fmtDelta` es la otra llamada del cuerpo de render y sí es cross-module.
    const body = vi.spyOn(format, "fmtDelta");
    const points = [...UP];

    const { rerender } = render(<Sparkline points={points} />);
    expect(body).toHaveBeenCalledTimes(1);

    // Mismas props (mismo array por referencia): memo corta el re-render.
    rerender(<Sparkline points={points} />);
    expect(body).toHaveBeenCalledTimes(1);

    // Array distinto: sí vuelve a renderizar.
    rerender(<Sparkline points={[...points]} />);
    expect(body).toHaveBeenCalledTimes(2);

    const series = Array.from({ length: 500 }, (_, index) => [index, index + 1, index + 3]);
    const started = performance.now();
    render(
      <div>
        {series.map((serie, index) => (
          <Sparkline key={index} points={serie} />
        ))}
      </div>,
    );
    const elapsed = performance.now() - started;

    // Techo generoso a propósito: un umbral fino ataría el check al reloj de la máquina,
    // pero 1500 ms sigue cazando una regresión de orden (un ResizeObserver por instancia,
    // una geometría O(n²)).
    expect(elapsed).toBeLessThan(1500);
  });
});
