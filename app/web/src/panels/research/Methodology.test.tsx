import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { fmtMonth } from "@/charts";
import { Methodology } from "@/panels/research/Methodology";
import type { CatalogSignals, CompanySignals, TemporalCompanyV2, MetaV2, TimelineRow } from "@/lib/api-v2";
import {
  AS_OF,
  catalogExample,
  companyExample,
  metaExample,
  monthsEndingAt,
  signalsExample,
  timelineExample,
} from "@/test/examples";

/** Identidad: 70,0 + (−3,1) − 9,5 − 0,0 = 57,4. */
const BASE = 70;
const PENALTY = 9.5;
const SCORE = 57.4;
const CONTRIBUTIONS = [-1.2, -0.6, -1.3];

const company = {
  ...companyExample,
  base: BASE,
  score: SCORE,
  cap: null,
  penalty: { ...companyExample.penalty, points: PENALTY, weakest_pillar: "L" },
} as unknown as TemporalCompanyV2;

/** Las tres primeras señales de Liquidez con contribuciones controladas; el resto a 0. */
const signals = {
  ...signalsExample,
  company_id: company.company.company_id,
  pillars: signalsExample.pillars.map((pillar, pillarIndex) => ({
    ...pillar,
    signals: pillar.signals.map((signal, index) => ({
      ...signal,
      contribution: pillarIndex === 0 ? (CONTRIBUTIONS[index] ?? 0) : 0,
    })),
  })),
} as unknown as CompanySignals;

const timeline = monthsEndingAt(AS_OF, 3).map((month) => ({
  ...timelineExample[0],
  month,
  score: SCORE,
  base: BASE,
  penalty: PENALTY,
  cap: null,
})) as unknown as TimelineRow[];

/** `reference` con la forma del manifest: pesos por pilar y cortes de banda. */
const meta = {
  ...metaExample,
  reference: {
    ...metaExample.reference,
    pillar_weights: { L: 25, P: 20, C: 15, D: 20, A: 20 },
    bands: { solid: [80, null], healthy: [60, 80], watch: [40, 60], stress: [null, 40] },
  },
} as unknown as MetaV2;

/** Regex tolerante al espacio fino (U+2009) y a los saltos entre nodos. */
function loose(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
}

function renderMethodology(activeMonth: string | null = null) {
  render(
    <Methodology
      company={company}
      signals={signals}
      timeline={timeline}
      meta={meta}
      catalog={catalogExample as unknown as CatalogSignals}
      activeMonth={activeMonth}
    />,
  );
  return screen.getByRole("region", { name: "Cómo se calcula" });
}

describe("panels/research/Methodology", () => {
  it("renders bands and pillar weights from meta.reference", () => {
    const section = renderMethodology();

    expect(within(section).getByText("Cómo se calcula")).toBeInTheDocument();

    expect(section).toHaveTextContent(loose("≥ 80 Sólida"));
    expect(section).toHaveTextContent(loose("60–80 Sana"));
    expect(section).toHaveTextContent(loose("40–60 Vigilancia"));
    expect(section).toHaveTextContent(loose("< 40 Tensión"));

    expect(section).toHaveTextContent(/Liquidez.{0,40}25/s);
    expect(section).toHaveTextContent(/Cobros.{0,40}15/s);
  });

  it("identity base + Σcontrib − penalty − cap equals score", () => {
    const section = renderMethodology();

    expect(section).toHaveTextContent(loose("70,0 + (−3,1) − 9,5 − 0,0 = 57,4"));
    expect(section).toHaveTextContent(loose("λ = 0,5"));
    expect(section).toHaveTextContent(loose("τ = 0,45"));
    expect(section).toHaveTextContent(/sin techo/i);
  });

  it("identity with activeMonth in the timeline carries the month suffix", () => {
    const section = renderMethodology(timeline[0].month);

    expect(section).toHaveTextContent(loose(`= 57,4 pts · ${fmtMonth(timeline[0].month)}`));
  });

  it("DADO activeMonth fuera de la timeline ENTONCES la identidad muestra las cifras del corte sin sufijo de mes", () => {
    const section = renderMethodology("2099-01");

    expect(section).toHaveTextContent(loose("70,0 + (−3,1) − 9,5 − 0,0 = 57,4 pts"));
    expect(section).not.toHaveTextContent("01/2099");
    expect(section).not.toHaveTextContent(loose("57,4 pts ·"));
  });
});
