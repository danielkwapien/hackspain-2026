import { describe, expect, it } from "vitest";
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  RATE_MAX,
  RATE_MIN,
  TERMS,
  clamp,
  fmtRate,
  frenchLoan,
  parseEsNumber,
} from "@/widgets/trade/trade-math";

describe("aritmética de Operar", () => {
  it("DADO 150.000 al 6,5 % a 24 meses ENTONCES cuota francesa 6.681,94, y NO la cuota de interés simple", () => {
    // `c = P·i / (1 − (1+i)^−n)` con i = 6,5/100/12. La decisión de §10 del
    // informe: interés simple sobre 24 meses daría 7.062,50 de cuota y 19.500
    // de intereses, que no es lo que cobra nadie que amortice.
    const loan = frenchLoan(150_000, 6.5, 24);
    expect(loan.monthly).toBeCloseTo(6681.937715, 5);
    expect(loan.total).toBeCloseTo(160_366.505161, 4);
    expect(loan.interest).toBeCloseTo(10_366.505161, 4);
    expect(loan.total - loan.interest).toBeCloseTo(150_000, 6);

    expect(loan.monthly).not.toBeCloseTo(7062.5, 2);
    expect(loan.interest).not.toBeCloseTo(19_500, 2);
  });

  it("DADO interés 0 ENTONCES la cuota degrada a P/n y no hay intereses", () => {
    // Sin el caso aparte, `1 − (1+0)^−n` es 0 y la división da Infinity.
    const loan = frenchLoan(150_000, 0, 24);
    expect(loan.monthly).toBe(6250);
    expect(loan.total).toBe(150_000);
    expect(loan.interest).toBe(0);
  });

  it("DADO un importe o un plazo sin sentido ENTONCES las tres cifras son 0, nunca NaN ni Infinity", () => {
    for (const loan of [frenchLoan(0, 6.5, 24), frenchLoan(-1, 6.5, 24), frenchLoan(1000, 6.5, 0)]) {
      expect(loan).toEqual({ monthly: 0, total: 0, interest: 0 });
    }
  });

  it("DADO los seis plazos ENTONCES el total sube con el plazo y la cuota baja", () => {
    expect([...TERMS]).toEqual([3, 6, 12, 24, 36, 60]);
    const loans = TERMS.map((months) => frenchLoan(150_000, 6.5, months));
    for (let index = 1; index < loans.length; index += 1) {
      expect(loans[index].total).toBeGreaterThan(loans[index - 1].total);
      expect(loans[index].monthly).toBeLessThan(loans[index - 1].monthly);
    }
  });

  it("DADO clamp ENTONCES respeta los rangos de la spec: 1.000–10.000.000 € y 0,1–25 %", () => {
    expect(AMOUNT_MIN).toBe(1_000);
    expect(AMOUNT_MAX).toBe(10_000_000);
    expect(RATE_MIN).toBe(0.1);
    expect(RATE_MAX).toBe(25);

    expect(clamp(500, AMOUNT_MIN, AMOUNT_MAX)).toBe(1_000);
    expect(clamp(99_000_000, AMOUNT_MIN, AMOUNT_MAX)).toBe(10_000_000);
    expect(clamp(150_000, AMOUNT_MIN, AMOUNT_MAX)).toBe(150_000);
    expect(clamp(0, RATE_MIN, RATE_MAX)).toBe(0.1);
    expect(clamp(90, RATE_MIN, RATE_MAX)).toBe(25);
  });

  it("DADO lo tecleado en es-ES ENTONCES parseEsNumber lee el punto como millar y la coma como decimal", () => {
    expect(parseEsNumber("150.000")).toBe(150_000);
    expect(parseEsNumber("6,5")).toBe(6.5);
    expect(parseEsNumber("1.234.567,89")).toBeCloseTo(1_234_567.89, 2);
    expect(parseEsNumber("")).toBeNull();
    expect(parseEsNumber("   ")).toBeNull();
    expect(parseEsNumber("nueve")).toBeNull();
  });

  it("DADO un tipo ENTONCES se escribe con una decimal y su unidad, sin el «+» de fmtPct", () => {
    expect(fmtRate(6.5)).toBe("6,5 %");
    expect(fmtRate(25)).toBe("25,0 %");
  });
});
