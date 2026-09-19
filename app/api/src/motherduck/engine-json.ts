import { z } from "zod";
import type { DriverRow, NarrativeRow } from "../v2/store.js";

const driverSchema = z.object({
  signal_id: z.string(),
  pillar: z.string().nullable(),
  contribution: z.number().nullable(),
  delta_vs_prev: z.number().nullable(),
  value: z.number().nullable(),
  value_fmt: z.string().nullable(),
  direction: z.string().nullable(),
  kind: z.string().nullable(),
  message: z.string().nullable(),
  rank: z.number().int().nullable(),
});

const narrativeSchema = z.object({
  headline: z.string().nullable().optional(),
  sentence: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  watch_next: z.string().nullable().optional(),
  guardrail_passed: z.boolean().nullable().optional(),
});

function parseJson<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (raw === null) return null;
  return schema.parse(JSON.parse(raw));
}

/** Identidad y columnas JSON de una fila mensual; lo mínimo para leer sus detalles. */
export type ScoreJsonSource = {
  entity_kind: "company" | "group";
  company_id: string | null;
  group_id: string | null;
  month: string;
  drivers_json: string | null;
  narrative_json: string | null;
};

export function driversFromScore(row: ScoreJsonSource): DriverRow[] {
  const parsed = parseJson(row.drivers_json, z.array(driverSchema));
  if (parsed === null) return [];
  const entityKind = row.entity_kind;
  return parsed.map((driver) => ({
    entity_kind: entityKind,
    company_id: row.company_id,
    group_id: row.group_id,
    month: row.month,
    rank: driver.rank,
    signal_id: driver.signal_id,
    pillar: driver.pillar,
    contribution: driver.contribution,
    delta_vs_prev: driver.delta_vs_prev,
    value: driver.value,
    value_fmt: driver.value_fmt,
    direction: driver.direction,
    kind: driver.kind,
    message: driver.message,
  }));
}

export function narrativeFromScore(row: ScoreJsonSource): NarrativeRow | null {
  const parsed = parseJson(row.narrative_json, narrativeSchema);
  if (parsed === null) return null;
  return {
    entity_kind: row.entity_kind,
    company_id: row.company_id,
    group_id: row.group_id,
    month: row.month,
    headline: parsed.headline ?? null,
    body: parsed.body ?? parsed.sentence ?? null,
    watch_next: parsed.watch_next ?? null,
    guardrail_passed: parsed.guardrail_passed ?? null,
  };
}

export function jsonObject(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  return z.record(z.string(), z.json()).parse(JSON.parse(raw));
}
