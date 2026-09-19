/**
 * Datos con la forma REAL del contrato v2, sacados de `docs/api/examples/*.json`
 * (los ejemplos que publica la API). Los tests de panel simulan con ellos
 * `/api/v2/universe` y `/api/v2/companies/:id` sin depender de `fixtures/v2`, que
 * modelan el contrato viejo hasta que XR-030 las alinee.
 */

import companyJson from "../../../../docs/api/examples/company.json";
import metaJson from "../../../../docs/api/examples/meta.json";
import universeJson from "../../../../docs/api/examples/universe.json";

/** Los ejemplos llevan una clave `_truncated` de documentación que la API no envía. */
function withoutTruncated<T extends { _truncated: unknown }>(example: T): Omit<T, "_truncated"> {
  const copy: Record<string, unknown> = { ...example };
  delete copy._truncated;
  return copy as Omit<T, "_truncated">;
}

export const universeExample = withoutTruncated(universeJson);
export const companyExample = withoutTruncated(companyJson);
export const metaExample = withoutTruncated(metaJson);

/** Mes de corte de los ejemplos (`2026-08`). */
export const AS_OF: string = companyExample.as_of;

export type TimelineLike = {
  month: string;
  score: number;
  band: string;
  regime: string;
  outlook_low: number;
  outlook_high: number;
};

/** `count` meses `YYYY-MM` consecutivos que terminan en `last`. */
export function monthsEndingAt(last: string, count: number): string[] {
  const year = Number(last.slice(0, 4));
  const month = Number(last.slice(5, 7));
  const months: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const offset = month - 1 - back;
    const y = year + Math.floor(offset / 12);
    const m = ((offset % 12) + 12) % 12;
    months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  }
  return months;
}

/** Timeline con la forma de `company.timeline`: un punto por score, el último en `last`. */
export function timelineOf(scores: number[], last: string = AS_OF): TimelineLike[] {
  const months = monthsEndingAt(last, scores.length);
  return scores.map((score, index) => ({
    month: months[index],
    score,
    band: "watch",
    regime: index < 3 ? "warmup" : "stable",
    outlook_low: score - 8,
    outlook_high: score + 8,
  }));
}

/** Ficha con la forma exacta de `company.json` para otra empresa y otra historia. */
export function companyLike(id: string, name: string, timeline: TimelineLike[]) {
  const last = timeline.at(-1)?.score ?? companyExample.score;
  const previous = timeline.at(-2)?.score ?? last;
  return {
    ...companyExample,
    company: { ...companyExample.company, company_id: id, name },
    score: last,
    delta_1m: last - previous,
    timeline,
    alert: { ...companyExample.alert, company_id: id },
  };
}
