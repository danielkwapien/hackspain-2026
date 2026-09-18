import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RangeBar, type RangeBarProps } from "@/charts/RangeBar";
import { bandToken } from "@/charts/palette";

const LABELS = { min: "0 pts", max: "100 pts" };

function bar(props: Partial<RangeBarProps> & Pick<RangeBarProps, "min" | "max" | "value">) {
  const { container } = render(<RangeBar labels={LABELS} {...props} />);
  const meter = container.querySelector('[role="meter"]') as HTMLElement;
  return {
    meter,
    dot: container.querySelector('[data-slot="range-bar-dot"]') as HTMLElement,
    track: container.querySelector('[data-slot="range-bar-track"]') as HTMLElement,
    segments: [...container.querySelectorAll('[data-slot="range-bar-segment"]')] as HTMLElement[],
    markers: [...container.querySelectorAll('[data-slot="range-bar-marker"]')] as HTMLElement[],
    text: container.textContent ?? "",
  };
}

describe("charts/RangeBar", () => {
  it("RangeBar: positions the dot proportionally and clamps out-of-range values", () => {
    const middle = bar({ min: 0, max: 100, value: 25 });
    expect(middle.dot.style.left).toBe("25%");
    expect(middle.track.style.height).toBe("6px");
    expect(middle.track.style.borderRadius).toBe("var(--radius-pill)");
    expect(middle.track.style.backgroundColor).toBe("var(--surface-raised)");
    expect(middle.dot.style.width).toBe("8px");
    expect(middle.dot.style.height).toBe("8px");
    expect(middle.dot.style.backgroundColor).toBe("var(--content-primary)");
    expect(middle.dot.style.border).toBe("1px solid var(--bg)");

    // Los extremos y un rango que no empieza en cero.
    expect(bar({ min: 0, max: 100, value: 0 }).dot.style.left).toBe("0%");
    expect(bar({ min: 0, max: 100, value: 100 }).dot.style.left).toBe("100%");
    expect(bar({ min: 20, max: 60, value: 30 }).dot.style.left).toBe("25%");

    // Fuera de rango: se recorta a [0, 1], nunca se sale del track.
    expect(bar({ min: 0, max: 100, value: -10 }).dot.style.left).toBe("0%");
    expect(bar({ min: 0, max: 100, value: 150 }).dot.style.left).toBe("100%");

    // `max === min`: el punto va al centro y no se divide por cero.
    const degenerate = bar({ min: 50, max: 50, value: 50 });
    expect(degenerate.dot.style.left).toBe("50%");
    expect(bar({ min: 50, max: 50, value: 999 }).dot.style.left).toBe("50%");

    // Accesible como medidor, con el valor recortado dentro del rango declarado.
    expect(middle.meter).toHaveAttribute("aria-valuemin", "0");
    expect(middle.meter).toHaveAttribute("aria-valuemax", "100");
    expect(middle.meter).toHaveAttribute("aria-valuenow", "25");
    expect(middle.meter.getAttribute("aria-label")).toBeTruthy();
    expect(bar({ min: 0, max: 100, value: 150 }).meter).toHaveAttribute("aria-valuenow", "100");

    // Etiquetas de 11 px a los extremos.
    expect(middle.text).toContain("0 pts");
    expect(middle.text).toContain("100 pts");
    const labels = [
      ...middle.meter.parentElement!.querySelectorAll('[data-slot="range-bar-label"]'),
    ] as HTMLElement[];
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.style.fontSize).toBe("var(--text-micro)");
      expect(label.style.color).toBe("var(--content-secondary)");
    }

    // Los marcadores también se colocan proporcionalmente y con el color que se les da.
    const marked = bar({
      min: 0,
      max: 100,
      value: 25,
      markers: [{ value: 40, color: bandToken("watch") }],
    });
    expect(marked.markers).toHaveLength(1);
    expect(marked.markers[0].style.left).toBe("40%");
    expect(marked.markers[0].style.backgroundColor).toBe("var(--band-watch)");
  });

  it("RangeBar: segmented variant paints the four band tokens", () => {
    const segmented = bar({ min: 0, max: 100, value: 25, variant: "segmented" });

    // De peor a mejor, izquierda a derecha: es como crece el score.
    expect(segmented.segments.map((segment) => segment.style.backgroundColor)).toEqual([
      bandToken("stress"),
      bandToken("watch"),
      bandToken("healthy"),
      bandToken("solid"),
    ]);
    for (const segment of segmented.segments) {
      expect(segment.style.opacity).toBe("0.4");
      expect(segment.style.width).toBe("25%");
    }

    // La variante por defecto es un track liso, sin tramos.
    expect(bar({ min: 0, max: 100, value: 25 }).segments).toHaveLength(0);
    expect(bar({ min: 0, max: 100, value: 25, variant: "plain" }).segments).toHaveLength(0);
  });
});
