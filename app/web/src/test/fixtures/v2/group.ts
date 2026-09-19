import type { GroupRowV2, GroupV2, TimelinePoint } from "@/lib/api-v2";
import { AS_OF, MONTHS, bandForScore, groupUniverseFixture, universeFixture } from "./universe";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

const GROUP_ID = "GROUP_0288";

const consolidated = groupUniverseFixture.items.find((candidate) => candidate.id === GROUP_ID)!;

/** Filiales del grupo tal como las sirve `/groups/:id`: por score descendente. */
const companies = universeFixture.items
  .filter((candidate) => candidate.group_id === GROUP_ID)
  .sort((a, b) => b.score - a.score);

const strongest = companies[0];
const weakest = companies.at(-1)!;

/** Fila de `groups.csv`, con la forma de `group.json`. */
const group: GroupRowV2 = {
  group_id: GROUP_ID,
  name: consolidated.name,
  erp: null,
  countries: [],
  currencies: ["EUR"],
  consolidation_currency: "EUR",
  has_intercompany: true,
  n_companies: companies.length,
  op_in_12m_eur: consolidated.op_in_12m_eur,
};

/**
 * 24 meses de `group_timeline.csv`: los 12 ultimos son la `sparkline_12` del item de
 * grupo; los 12 primeros, una rampa hacia atras con ruido determinista.
 */
function buildTimeline(): GroupV2["timeline"] {
  const recent = consolidated.sparkline_12;
  const scores: number[] = [];
  for (let index = 0; index < 12; index += 1) {
    const monthsBack = 12 - index;
    const wobble = ((consolidated.score * (index + 5)) % 5) - 2;
    scores.push(round1(clampScore(recent[0] - monthsBack * 0.6 + wobble)));
  }
  scores.push(...recent);

  const spread = round1(4 + (1 - consolidated.confidence) * 10);
  return scores.map((score, index) => {
    const previous = index === 0 ? null : scores[index - 1];
    let regime: TimelinePoint["regime"] = "stable";
    if (index < 3) regime = "warmup";
    else if (previous !== null && score - previous > 1) regime = "improving";
    else if (previous !== null && score - previous < -1) regime = "deteriorating";
    return {
      month: MONTHS[index],
      score,
      band: bandForScore(score),
      regime: index === scores.length - 1 ? consolidated.regime : regime,
      delta_1m: previous === null ? null : round1(score - previous),
      dispersion: round1(consolidated.dispersion - (scores.length - 1 - index) * 0.4),
      n_companies_scored: index < 6 ? companies.length - 1 : companies.length,
      outlook_low: round1(clampScore(score - spread)),
      outlook_high: round1(clampScore(score + spread)),
    };
  });
}

/** `/api/v2/groups/GROUP_0288` (Grupo Ribalta): consolidado, timeline y filiales. */
export const groupFixture: { [K in keyof GroupV2]: NonNullable<GroupV2[K]> } = {
  group,
  as_of: AS_OF,
  score: consolidated.score,
  band: consolidated.band,
  delta_1m: consolidated.delta_1m,
  delta_3m: consolidated.delta_3m,
  regime: consolidated.regime,
  confidence: consolidated.confidence,
  outlook_6m: round1(clampScore(consolidated.score + consolidated.delta_3m * 0.8)),
  outlook_low: round1(clampScore(consolidated.score - 8)),
  outlook_high: round1(clampScore(consolidated.score + 8)),
  n_companies_scored: consolidated.n_companies_scored,
  dispersion: consolidated.dispersion,
  strongest_company: strongest.id,
  strongest_score: strongest.score,
  weakest_company: weakest.id,
  weakest_score: weakest.score,
  intragroup_dependency_max: 0.31,
  alert: consolidated.alert,
  timeline: buildTimeline(),
  companies,
};
