import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PillarBar, pillarTone, type PillarBarProps } from "@/charts/PillarBar";

function bar(props: PillarBarProps) {
  const { container } = render(<PillarBar {...props} />);
  return {
    meter: container.querySelector('[role="meter"]') as HTMLElement,
    track: container.querySelector('[data-slot="pillar-bar-track"]') as HTMLElement,
    fill: container.querySelector('[data-slot="pillar-bar-fill"]') as HTMLElement,
    text: container.textContent ?? "",
  };
}

describe("charts/PillarBar", () => {
  it("PillarBar: pillarTone maps 0.7/0.5/0.3 to positive/alert/negative tokens", () => {
    expect(pillarTone(0.7)).toBe("var(--content-positive)");
    expect(pillarTone(0.5)).toBe("var(--content-alert)");
    expect(pillarTone(0.3)).toBe("var(--content-negative)");

    // Los bordes exactos: 0,6 ya es positivo y 0,45 ya es alerta.
    expect(pillarTone(0.6)).toBe("var(--content-positive)");
    expect(pillarTone(0.5999)).toBe("var(--content-alert)");
    expect(pillarTone(0.45)).toBe("var(--content-alert)");
    expect(pillarTone(0.4499)).toBe("var(--content-negative)");
    expect(pillarTone(0)).toBe("var(--content-negative)");
    expect(pillarTone(1)).toBe("var(--content-positive)");

    const good = bar({ value: 0.7, label: "Liquidez" });
    expect(good.fill.style.width).toBe("70%");
    expect(good.fill.style.backgroundColor).toBe("var(--content-positive)");
    expect(good.track.style.height).toBe("6px");
    expect(good.track.style.backgroundColor).toBe("var(--alpha-white-10)");
    expect(bar({ value: 0.5, label: "Deuda" }).fill.style.backgroundColor).toBe(
      "var(--content-alert)",
    );
    expect(bar({ value: 0.3, label: "Pagos" }).fill.style.backgroundColor).toBe(
      "var(--content-negative)",
    );

    // Accesible como medidor, y nunca texto dentro de la barra.
    expect(good.meter).toHaveAttribute("aria-valuenow", "0.7");
    expect(good.meter.getAttribute("aria-label")).toMatch(/liquidez/i);
    expect(good.text).toBe("");
  });

  it("PillarBar: diverging variant centers zero and scales by the maximum absolute value", () => {
    const positive = bar({ value: 2, maxAbs: 4, label: "Cobros", variant: "diverging" });
    expect(positive.fill.style.left).toBe("50%");
    expect(positive.fill.style.width).toBe("25%");

    const negative = bar({ value: -4, maxAbs: 4, label: "Pagos", variant: "diverging" });
    expect(negative.fill.style.left).toBe("0%");
    expect(negative.fill.style.width).toBe("50%");

    const half = bar({ value: -2, maxAbs: 4, label: "Pagos", variant: "diverging" });
    expect(half.fill.style.left).toBe("25%");
    expect(half.fill.style.width).toBe("25%");

    // Cero en el centro, sin ancho.
    const zero = bar({ value: 0, maxAbs: 4, label: "Actividad", variant: "diverging" });
    expect(zero.fill.style.left).toBe("50%");
    expect(zero.fill.style.width).toBe("0%");

    // Sin escala (tabla vacía o toda a cero): ancho 0, no una división por cero.
    const unscaled = bar({ value: 3, maxAbs: 0, label: "Actividad", variant: "diverging" });
    expect(unscaled.fill.style.width).toBe("0%");
    expect(unscaled.fill.style.left).toBe("50%");

    // Tono por signo de la contribución y rango declarado por el máximo absoluto.
    expect(positive.fill.style.backgroundColor).toBe("var(--content-positive)");
    expect(negative.fill.style.backgroundColor).toBe("var(--content-negative)");
    expect(positive.meter).toHaveAttribute("aria-valuenow", "2");
    expect(positive.meter).toHaveAttribute("aria-valuemin", "-4");
    expect(positive.meter).toHaveAttribute("aria-valuemax", "4");

    // Nunca texto dentro de la barra.
    expect(positive.text).toBe("");
  });
});
