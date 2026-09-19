import { describe, expect, it } from "vitest";
import {
  FAMILY_LABEL,
  KPI_DEFINITION,
  METRIC_OPTIONS,
  PILLAR_DEFINITION,
  PILLAR_TOKEN,
  SHORT_LABEL,
  SIGNAL_DEFINITION,
} from "@/lib/definitions";
import { catalogFixture } from "@/test/fixtures/v2";

/** Las 29 filas del catálogo (28 que puntúan + A6), en el orden del fichero. */
const SIGNAL_IDS = catalogFixture.items.map((signal) => signal.signal_id);

const PILLARS = ["L", "P", "C", "D", "A"];

/** Tope de la etiqueta corta: cabe en una celda de KpiRow a cinco columnas. */
const MAX_SHORT_LABEL = 18;

/** KPIs de cabecera y motor con burbuja ⓘ. */
const KPI_KEYS = [
  "score",
  "delta",
  "confidence",
  "outlook",
  "base",
  "penalty",
  "cap",
  "band",
  "regime",
];

describe("lib/definitions", () => {
  it("DADO el catálogo CUANDO se leen SHORT_LABEL y SIGNAL_DEFINITION ENTONCES cubren las 28 señales y A6, y PILLAR_DEFINITION los 5 pilares", () => {
    expect(SIGNAL_IDS).toHaveLength(29);
    for (const id of SIGNAL_IDS) {
      expect(SHORT_LABEL, `falta SHORT_LABEL.${id}`).toHaveProperty(id);
      expect(SIGNAL_DEFINITION, `falta SIGNAL_DEFINITION.${id}`).toHaveProperty(id);
      expect(SIGNAL_DEFINITION[id as keyof typeof SIGNAL_DEFINITION].length).toBeGreaterThan(20);
    }
    expect(Object.keys(PILLAR_DEFINITION).sort()).toEqual([...PILLARS].sort());
    for (const pillar of PILLARS) {
      expect(PILLAR_DEFINITION[pillar as keyof typeof PILLAR_DEFINITION].length).toBeGreaterThan(
        20,
      );
    }

    // Muestras fijadas en el plan: la primera de Liquidez y la que no puntúa.
    expect(SHORT_LABEL.L1).toBe("Colchón de caja");
    expect(SHORT_LABEL.A6).toBe("Sin clasificar");
    expect(SHORT_LABEL.D4).toBe("Comisiones e int.");
  });

  it("DADO SHORT_LABEL CUANDO se mide cada etiqueta ENTONCES ninguna supera 18 caracteres ni está vacía", () => {
    for (const [id, label] of Object.entries(SHORT_LABEL)) {
      expect(label.trim().length, `${id}: «${label}»`).toBeGreaterThan(0);
      expect(label.length, `${id}: «${label}» tiene ${label.length}`).toBeLessThanOrEqual(
        MAX_SHORT_LABEL,
      );
    }
  });

  it("DADO KPI_DEFINITION, PILLAR_TOKEN, METRIC_OPTIONS y FAMILY_LABEL ENTONCES los KPIs tienen definición, cada pilar su token de gráfica y el menú ofrece score más cinco familias", () => {
    for (const key of KPI_KEYS) {
      expect(KPI_DEFINITION, `falta KPI_DEFINITION.${key}`).toHaveProperty(key);
    }

    expect(PILLAR_TOKEN).toEqual({
      L: "var(--chart-pillar-liquidity)",
      P: "var(--chart-pillar-payments)",
      C: "var(--chart-pillar-collections)",
      D: "var(--chart-pillar-debt)",
      A: "var(--chart-pillar-activity)",
    });

    expect(METRIC_OPTIONS.map((option) => option.value)).toEqual(["score", ...PILLARS]);
    expect(METRIC_OPTIONS[0].label).toBe("Health score");
    for (const option of METRIC_OPTIONS.slice(1)) {
      expect(option.label).toBe(FAMILY_LABEL[option.value as keyof typeof FAMILY_LABEL]);
    }
    expect(FAMILY_LABEL).toEqual({
      L: "Liquidez",
      P: "Pago",
      C: "Cobros",
      D: "Deuda",
      A: "Actividad",
    });
  });
});
