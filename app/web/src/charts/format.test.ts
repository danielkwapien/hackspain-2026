import { describe, expect, it } from "vitest";
import { fmtConfidence, fmtSignedPoints, fmtSizeShort } from "@/charts";
import { fmtDelta, fmtMonth, fmtMonthLong, fmtPct, fmtPoints, fmtSize, fmtU } from "@/charts/format";

/** Signo menos tipográfico (U+2212), el único legal en pantalla. */
const MINUS = "−";
/** Espacio fino (U+2009) entre la cifra y su unidad. */
const THIN = " ";
/** Guion ASCII (U+002D): prohibido en cualquier salida. */
const HYPHEN = "-";
const EMPTY = "—";

describe("charts/format", () => {
  it("format: fmtPoints, fmtDelta, fmtPct and fmtU use comma decimal and the minus sign U+2212", () => {
    expect(fmtPoints(47.3)).toBe(`47,3${THIN}pts`);
    expect(fmtPoints(1234.5)).toBe(`1.234,5${THIN}pts`);
    expect(fmtPoints(-5.8)).toBe(`${MINUS}5,8${THIN}pts`);
    expect(fmtPoints(-5.8)).toContain(MINUS);
    expect(fmtPoints(-5.8)).not.toContain(HYPHEN);
    expect(fmtPoints(null)).toBe(EMPTY);
    expect(fmtPoints(undefined)).toBe(EMPTY);
    expect(fmtPoints(Number.NaN)).toBe(EMPTY);

    expect(fmtPct(3.9)).toBe(`+3,9${THIN}%`);
    expect(fmtPct(-4.8)).toBe(`${MINUS}4,8${THIN}%`);
    expect(fmtPct(-4.8)).not.toContain(HYPHEN);
    expect(fmtPct(null)).toBe(EMPTY);

    expect(fmtU(0.7)).toBe("0,70");
    expect(fmtU(-0.7)).toBe(`${MINUS}0,70`);
    expect(fmtU(-0.7)).not.toContain(HYPHEN);
    expect(fmtU(null)).toBe(EMPTY);

    expect(fmtDelta(2.4).text).toBe(`▲ +2,4${THIN}pts`);
    expect(fmtDelta(-5.8).text).toBe(`▼ ${MINUS}5,8${THIN}pts`);
    expect(fmtDelta(-5.8).text).not.toContain(HYPHEN);
    expect(fmtDelta(0.2).text).toBe(`— 0,2${THIN}pts`);
  });

  it("format: fmtDelta returns the neutral token when the absolute delta is below 0.5", () => {
    const neutral = { glyph: "—", tone: "var(--content-secondary)", sign: 0 };
    expect(fmtDelta(0.4)).toMatchObject(neutral);
    expect(fmtDelta(-0.4)).toMatchObject(neutral);

    expect(fmtDelta(0.5)).toMatchObject({ glyph: "▲", tone: "var(--content-positive)", sign: 1 });
    expect(fmtDelta(2.4)).toMatchObject({ glyph: "▲", tone: "var(--content-positive)", sign: 1 });
    expect(fmtDelta(-0.5)).toMatchObject({ glyph: "▼", tone: "var(--content-negative)", sign: -1 });
    expect(fmtDelta(-5.8)).toMatchObject({ glyph: "▼", tone: "var(--content-negative)", sign: -1 });

    expect(fmtDelta(null)).toMatchObject({ text: EMPTY, tone: "var(--content-secondary)", sign: 0 });
    expect(fmtDelta(undefined).text).toBe(EMPTY);
  });

  it("format: fmtMonth and fmtMonthLong render the period in es-ES", () => {
    expect(fmtMonth("2026-06")).toBe("06/2026");
    expect(fmtMonth("2026-12")).toBe("12/2026");
    expect(fmtMonth(null)).toBe(EMPTY);

    expect(fmtMonthLong("2026-06")).toBe("junio de 2026");
    expect(fmtMonthLong("2026-01")).toBe("enero de 2026");
    expect(fmtMonthLong(null)).toBe(EMPTY);
  });

  it("format: fmtSize labels the currency apart from the amount", () => {
    expect(fmtSize(32477.26, "EUR")).toBe("EUR 32.477,26");
    expect(fmtSize(-32477.26, "EUR")).toBe(`EUR ${MINUS}32.477,26`);
    expect(fmtSize(-32477.26, "EUR")).not.toContain(HYPHEN);
    expect(fmtSize(1234, "USD")).toBe("USD 1.234,00");
    expect(fmtSize(null, "EUR")).toBe(EMPTY);
  });

  it("format: fmtSignedPoints signs the contribution, tones it by sign and floors neutral at 0.05", () => {
    expect(fmtSignedPoints(0.2)).toMatchObject({
      text: `+0,2${THIN}pts`,
      tone: "var(--content-positive)",
      sign: 1,
    });
    expect(fmtSignedPoints(-0.6)).toMatchObject({
      text: `${MINUS}0,6${THIN}pts`,
      tone: "var(--content-negative)",
      sign: -1,
    });
    expect(fmtSignedPoints(-0.6).text).not.toContain(HYPHEN);
    expect(fmtSignedPoints(3.47661350034).text).toBe(`+3,5${THIN}pts`);

    // Por debajo de 0,05 no hay dirección: sin signo y en tono secundario.
    expect(fmtSignedPoints(0.04)).toMatchObject({
      text: `0,0${THIN}pts`,
      tone: "var(--content-secondary)",
      sign: 0,
    });
    expect(fmtSignedPoints(-0.04).text).not.toContain(MINUS);
    expect(fmtSignedPoints(0.05).sign).toBe(1);

    expect(fmtSignedPoints(null)).toMatchObject({ text: EMPTY, tone: "var(--content-secondary)", sign: 0 });
    expect(fmtSignedPoints(undefined).text).toBe(EMPTY);
    expect(fmtSignedPoints(Number.NaN).text).toBe(EMPTY);
  });

  it("format: fmtConfidence renders u01 as a whole percent with the thin space", () => {
    expect(fmtConfidence(0.81)).toBe(`81${THIN}%`);
    expect(fmtConfidence(0.976777117198)).toBe(`98${THIN}%`);
    expect(fmtConfidence(1)).toBe(`100${THIN}%`);
    expect(fmtConfidence(0)).toBe(`0${THIN}%`);
    expect(fmtConfidence(null)).toBe(EMPTY);
    expect(fmtConfidence(undefined)).toBe(EMPTY);
  });

  it("format: fmtSizeShort abbreviates to M and k with the currency apart", () => {
    expect(fmtSizeShort(26_233_293.89, "EUR")).toBe(`EUR 26,2${THIN}M`);
    expect(fmtSizeShort(485_000, "EUR")).toBe(`EUR 485${THIN}k`);
    expect(fmtSizeShort(950, "EUR")).toBe("EUR 950");
    expect(fmtSizeShort(-1_500_000, "EUR")).toBe(`EUR ${MINUS}1,5${THIN}M`);
    expect(fmtSizeShort(-1_500_000, "EUR")).not.toContain(HYPHEN);
    expect(fmtSizeShort(null, "EUR")).toBe(EMPTY);
  });
});
