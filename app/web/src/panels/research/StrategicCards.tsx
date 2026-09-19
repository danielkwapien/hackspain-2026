/**
 * Las cinco perspectivas estratégicas del mes, tal como las publica el motor
 * (`*_strategic_signals`): valor 0..100 con 50 neutro, dirección, confianza y la
 * evidencia observable que las sostiene. No son los cinco pilares del score.
 *
 * Sin datos no se pinta nada: si la fuente no publica perspectivas (el mock) el
 * bloque desaparece en vez de enseñar números inventados.
 */

import type { ReactElement } from "react";
import { fmtConfidence, fmtPoints, fmtSignedPoints } from "@/charts";
import type { StrategicSignal } from "@/lib/api-v2";
import { formatAmount } from "@/lib/format";
import { humanizeCode } from "@/lib/definitions";

const DIRECTION_LABEL: Record<string, string> = {
  improving: "Mejora",
  deteriorating: "Empeora",
  stable: "Estable",
  unknown: "Sin señal",
};

const DIRECTION_TONE: Record<string, string> = {
  improving: "var(--content-positive)",
  deteriorating: "var(--content-negative)",
};

/** Evidencia observable: hasta cuatro claves, con números en formato es-ES. */
function evidenceOf(evidence: Record<string, unknown> | null): [string, string][] {
  if (evidence === null) return [];
  return Object.entries(evidence)
    .slice(0, 4)
    .map(([key, value]) => [
      humanizeCode(key),
      value === null || value === undefined
        ? "—"
        : typeof value === "number"
          ? formatAmount(value)
          : String(value),
    ]);
}

export function StrategicCards({
  signals,
}: {
  signals: readonly StrategicSignal[] | null | undefined;
}): ReactElement | null {
  if (!signals || signals.length === 0) return null;
  return (
    <section
      aria-label="Perspectivas"
      className="flex shrink-0 flex-col gap-2 border-t border-border-glass pt-3"
    >
      <h3 className="text-[length:var(--text-micro)] font-semibold tracking-wide text-content-secondary uppercase">
        Perspectivas
      </h3>
      <ul className="grid grid-cols-2 gap-2">
        {signals.map((signal) => {
          const delta = signal.modifier_delta === null ? null : fmtSignedPoints(signal.modifier_delta);
          return (
            <li
              key={signal.name}
              className="flex min-w-0 flex-col gap-1 rounded-[var(--radius-card)] bg-surface-glass p-2 shadow-[inset_0_0_0_1px_var(--border-glass)]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[length:var(--text-control)] font-semibold text-content-primary">
                  {signal.label ?? humanizeCode(signal.name)}
                </span>
                <span className="num shrink-0 text-[length:var(--text-body)] text-content-primary">
                  {fmtPoints(signal.value)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[length:var(--text-micro)] text-content-secondary">
                <span style={{ color: DIRECTION_TONE[signal.direction ?? ""] ?? undefined }}>
                  {DIRECTION_LABEL[signal.direction ?? ""] ?? humanizeCode(signal.direction ?? "—")}
                </span>
                <span className="num">
                  confianza {fmtConfidence(signal.confidence)} · cobertura{" "}
                  {fmtConfidence(signal.coverage)}
                </span>
              </div>
              {delta === null ? null : (
                <div className="num text-[length:var(--text-micro)]" style={{ color: delta.tone }}>
                  ajuste al score: {delta.text}
                </div>
              )}
              {evidenceOf(signal.evidence).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-baseline justify-between gap-2 text-[length:var(--text-micro)] text-content-secondary"
                >
                  <span className="truncate">{key}</span>
                  <span className="num shrink-0">{value}</span>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
