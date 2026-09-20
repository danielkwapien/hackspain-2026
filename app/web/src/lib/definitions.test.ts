import { describe, expect, it } from "vitest";
import {
  EVIDENCE_LABEL,
  EVIDENCE_UNIT,
  FAMILY_LABEL,
  FAMILY_OPTIONS,
  KPI_DEFINITION,
  METRIC_OPTIONS,
  PERSPECTIVE,
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

  it("DADO FAMILY_OPTIONS CUANDO lo lee Investigación profunda ENTONCES las cinco familias sin «Health score», Liquidez la primera (E16)", () => {
    expect(FAMILY_OPTIONS.map((option) => option.value)).toEqual(PILLARS);
    expect(FAMILY_OPTIONS[0].label).toBe("Liquidez");
    expect(FAMILY_OPTIONS.map((option) => option.label)).not.toContain("Health score");
    // El menú de la gráfica sigue ofreciendo el score: ahí no sobra.
    expect(METRIC_OPTIONS).toHaveLength(FAMILY_OPTIONS.length + 1);
  });

  it("DADO PERSPECTIVE CUANDO se pinta «Contexto» ENTONCES cuatro perspectivas en español, sin current_health, con dos claves de evidencia traducidas (E14)", () => {
    expect(Object.keys(PERSPECTIVE)).toEqual([
      "trajectory_pressure",
      "network_counterparty_health",
      "sector_benchmark_rank",
      "data_driven_peer_learning",
    ]);
    // `current_health` es el nivel del score: su evidencia son los cinco pilares.
    expect(PERSPECTIVE).not.toHaveProperty("current_health");

    for (const [name, { label, evidence }] of Object.entries(PERSPECTIVE)) {
      expect(label.trim().length, name).toBeGreaterThan(0);
      // Etiqueta escrita en el front: el motor publica `label: null`.
      expect(label, name).not.toBe(name);
      expect(evidence, name).toHaveLength(2);
      for (const key of evidence) {
        expect(EVIDENCE_LABEL, `falta EVIDENCE_LABEL.${key}`).toHaveProperty(key);
        expect(EVIDENCE_UNIT, `falta EVIDENCE_UNIT.${key}`).toHaveProperty(key);
      }
    }
  });

  it("DADO EVIDENCE_LABEL CUANDO se cruza con EVIDENCE_UNIT ENTONCES cada clave traducida sabe cómo se lee, y una que no esté no se pinta", () => {
    expect(Object.keys(EVIDENCE_LABEL).sort()).toEqual(Object.keys(EVIDENCE_UNIT).sort());
    for (const [key, label] of Object.entries(EVIDENCE_LABEL)) {
      expect(label.trim().length, key).toBeGreaterThan(0);
      expect(["points", "share", "count"]).toContain(EVIDENCE_UNIT[key]);
    }
    // Indexado defensivo: un código que publique el motor y el front no conozca sale
    // `undefined`, y quien lo lee lo descarta en vez de reventar la tarjeta.
    expect(EVIDENCE_LABEL["financial_sector"]).toBeUndefined();
    expect(EVIDENCE_LABEL["current_health"]).toBeUndefined();
  });
});
