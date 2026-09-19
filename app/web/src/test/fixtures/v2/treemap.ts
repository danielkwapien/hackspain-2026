import type { TreemapGroup, TreemapResponse } from "@/lib/api-v2";
import { AS_OF, groupUniverseFixture, universeFixture } from "./universe";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Empresas sin `delta_3m` en el corte: el contrato prohibe imputar 0, asi que llegan
 * con `color_value: null` y no cuentan en `coverage.items_with_metric`.
 */
export const TREEMAP_WITHOUT_METRIC = ["COMP_0010"];

function buildGroup(groupId: string): TreemapGroup {
  const consolidated = groupUniverseFixture.items.find((candidate) => candidate.id === groupId)!;
  const items = universeFixture.items
    .filter((candidate) => candidate.group_id === groupId)
    .sort((a, b) => b.op_in_12m - a.op_in_12m)
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      size: entity.op_in_12m,
      color_value: TREEMAP_WITHOUT_METRIC.includes(entity.id) ? null : entity.delta_3m,
      score: entity.score,
      band: entity.band,
    }));
  const withMetric = items.filter((item) => item.color_value !== null);
  return {
    key: groupId,
    label: consolidated.name,
    value_sum: round2(items.reduce((sum, item) => sum + item.size, 0)),
    delta: consolidated.delta_3m,
    coverage: {
      items_with_metric: withMetric.length,
      items_total: items.length,
      size_with_metric: round2(withMetric.reduce((sum, item) => sum + item.size, 0)),
    },
    items,
  };
}

/** `/api/v2/treemap` por grupo: los 3 grupos del universo, delta_3m como color. */
export const treemapFixture: TreemapResponse = {
  as_of: AS_OF,
  group_by: "group",
  metric: "delta_3m",
  size_by: "op_in_12m",
  delta_source: "group_timeline",
  groups: groupUniverseFixture.items.map((group) => buildGroup(group.id)),
};
