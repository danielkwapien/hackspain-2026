/**
 * Fila del widget Favoritos a partir de la ficha de una empresa (`/companies/:id`)
 * o de un grupo (`/groups/:id`). Aritmética pura: la clase sale del prefijo del id
 * y la sparkline son los doce últimos scores de la timeline, como `sparkline_12`
 * del universo.
 */

import type { Band, CompanyV2, GroupV2, Regime } from "@/lib/api-v2";
import type { EntityKind } from "@/lib/entity";
import { kindOf } from "@/lib/entity";

/** Los mismos doce meses que `sparkline_12` en `/universe`. */
const SPARKLINE_POINTS = 12;

export type FavoriteRow = {
  id: string;
  kind: EntityKind;
  name: string;
  score: number | null;
  delta_1m: number | null;
  delta_3m: number | null;
  regime: Regime | null;
  band: Band | null;
  sparkline: (number | null)[];
};

export function favoriteRow(id: string, data: CompanyV2 | GroupV2): FavoriteRow {
  const name = "group" in data ? data.group.name : data.company.name;
  const timeline: readonly { score: number | null }[] = data.timeline;
  return {
    id,
    kind: kindOf(id),
    name,
    score: data.score,
    delta_1m: data.delta_1m,
    delta_3m: data.delta_3m,
    regime: data.regime,
    band: data.band,
    sparkline: timeline.slice(-SPARKLINE_POINTS).map((point) => point.score),
  };
}
