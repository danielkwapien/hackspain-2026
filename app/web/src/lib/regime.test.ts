import { describe, expect, it } from "vitest";
import { confidenceClass } from "@/lib/regime";

/**
 * XR-037 (E7.c). Baremo medido sobre las 1.286 sociedades del corte: el rojo queda
 * reservado a lo que está por debajo del 15 % (hoy, una sola sociedad, con 0).
 */
describe("confidenceClass", () => {
  it("DADO 0,85 o más ENTONCES verde", () => {
    expect(confidenceClass(1)).toBe("text-content-positive");
    expect(confidenceClass(0.9)).toBe("text-content-positive");
    expect(confidenceClass(0.85)).toBe("text-content-positive");
  });

  it("DADO entre 0,60 y 0,85 ENTONCES sin color: el valor por defecto", () => {
    expect(confidenceClass(0.849)).toBe("text-content-primary");
    expect(confidenceClass(0.75)).toBe("text-content-primary");
    expect(confidenceClass(0.6)).toBe("text-content-primary");
  });

  it("DADO entre 0,15 y 0,60 ENTONCES naranja", () => {
    expect(confidenceClass(0.599)).toBe("text-content-alert");
    expect(confidenceClass(0.488)).toBe("text-content-alert");
    expect(confidenceClass(0.15)).toBe("text-content-alert");
  });

  it("DADO por debajo de 0,15 ENTONCES rojo", () => {
    expect(confidenceClass(0.149)).toBe("text-content-negative");
    expect(confidenceClass(0)).toBe("text-content-negative");
  });

  it("DADO ninguna cifra ENTONCES no califica: el color por defecto del valor", () => {
    expect(confidenceClass(null)).toBe("text-content-primary");
    expect(confidenceClass(undefined)).toBe("text-content-primary");
    expect(confidenceClass(Number.NaN)).toBe("text-content-primary");
  });
});
