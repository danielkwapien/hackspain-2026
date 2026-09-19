/**
 * «Contexto»: las perspectivas del motor (`*_strategic_signals`) como cuatro tarjetas
 * de cuatro líneas (XR-037, E14). No son los cinco pilares del score: son lecturas que
 * sitúan a la empresa, y solo dos de las cinco mueven de verdad la nota.
 *
 * Lo que cambia respecto de la versión de ocho líneas de `clave: valor`:
 * - `current_health` no se pinta: es el nivel del score y su evidencia son los cinco
 *   pilares, o sea la fila de KPIs otra vez. El mismo número tres veces en pantalla;
 * - la etiqueta sale de `PERSPECTIVE`, en español, porque el motor publica
 *   `label: null` y `humanizeCode` dejaba «current health» y «data driven peer
 *   learning» en inglés y en minúsculas dentro de un producto en español;
 * - de la evidencia salen DOS claves fijadas por perspectiva, traducidas por
 *   `EVIDENCE_LABEL`. Lo que no esté en el diccionario NO se pinta;
 * - el ajuste al score solo cuando `modifier_applied` es `true`, que no es lo mismo que
 *   `modifier_delta != null`;
 * - `confianza · cobertura` es metadato de ingeniería: se va al `title`.
 *
 * Los diccionarios se leen con degradado (lección de XR-034): un `name` o una clave de
 * evidencia que el motor publique y el front no conozca se ignora; nunca tumba el árbol
 * de React dejando la pantalla en blanco con los tests en verde.
 *
 * Sin datos no se pinta nada: si la fuente no publica perspectivas (el mock) el bloque
 * desaparece en vez de enseñar números inventados.
 */

import type { ReactElement } from "react";
import { PillarBar, fmtConfidence, fmtPointsBare, fmtSignedPoints } from "@/charts";
import type { StrategicSignal } from "@/lib/api-v2";
import { EMPTY_VALUE, formatAmount, formatCount } from "@/lib/format";
import { EVIDENCE_LABEL, EVIDENCE_UNIT, PERSPECTIVE } from "@/lib/definitions";

const DIRECTION_LABEL: Record<string, string> = {
  improving: "▲ Mejora",
  deteriorating: "▼ Empeora",
  stable: "Estable",
  unknown: "Sin señal",
};

const DIRECTION_TONE: Record<string, string> = {
  improving: "var(--content-positive)",
  deteriorating: "var(--content-negative)",
};

/** Las perspectivas del catálogo, en el orden del catálogo. Las demás se ignoran. */
function perspectives(signals: readonly StrategicSignal[]): StrategicSignal[] {
  return Object.keys(PERSPECTIVE)
    .map((name) => signals.find((signal) => signal.name === name))
    .filter((signal): signal is StrategicSignal => signal !== undefined);
}

/** El número de una clave según cómo se lee: 0-100, proporción 0-1 o recuento. */
function evidenceValue(key: string, value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  switch (EVIDENCE_UNIT[key]) {
    case "points":
      return fmtPointsBare(value);
    case "share":
      return fmtConfidence(value);
    case "count":
      return formatCount(value);
    default:
      // Clave traducida sin unidad declarada: el número tal cual antes que inventarle
      // una escala.
      return formatAmount(value);
  }
}

/** «Momento 100 · Obligaciones 29 %»: las dos claves fijadas para esa perspectiva. */
function evidenceOf(signal: StrategicSignal): string | null {
  const keys = PERSPECTIVE[signal.name]?.evidence;
  const evidence = signal.evidence;
  if (keys === undefined || evidence === null) return null;
  const parts = keys
    .map((key) => {
      const label = EVIDENCE_LABEL[key];
      const value = label === undefined ? null : evidenceValue(key, evidence[key]);
      return value === null ? null : `${label} ${value}`;
    })
    .filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

export function StrategicCards({
  signals,
}: {
  signals: readonly StrategicSignal[] | null | undefined;
}): ReactElement | null {
  const cards = signals ? perspectives(signals) : [];
  if (cards.length === 0) return null;
  return (
    <section
      aria-label="Contexto"
      className="flex shrink-0 flex-col gap-2 border-t border-border-glass pt-3"
    >
      <h3 className="text-[length:var(--text-micro)] font-semibold tracking-wide text-content-secondary uppercase">
        Contexto
      </h3>
      <ul className="grid grid-cols-2 gap-2">
        {cards.map((signal) => {
          const label = PERSPECTIVE[signal.name].label;
          const direction = signal.direction ?? "unknown";
          const delta =
            signal.modifier_applied === true && signal.modifier_delta !== null
              ? fmtSignedPoints(signal.modifier_delta)
              : null;
          const evidence = evidenceOf(signal);
          return (
            <li
              key={signal.name}
              title={`Confianza ${fmtConfidence(signal.confidence)} · cobertura ${fmtConfidence(signal.coverage)}`}
              className="flex min-w-0 flex-col gap-1 rounded-[var(--radius-card)] bg-surface-glass p-2 shadow-[inset_0_0_0_1px_var(--border-glass)]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[length:var(--text-micro)] text-content-secondary">
                  {label}
                </span>
                <span className="num shrink-0 text-[length:var(--text-figure)] leading-tight font-semibold text-content-primary">
                  {fmtPointsBare(signal.value)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[length:var(--text-micro)] text-content-secondary">
                <span className="truncate" style={{ color: DIRECTION_TONE[direction] }}>
                  {DIRECTION_LABEL[direction] ?? EMPTY_VALUE}
                </span>
                {delta === null ? null : (
                  <span className="num shrink-0" style={{ color: delta.tone }}>
                    ajuste {delta.text}
                  </span>
                )}
              </div>
              {signal.value === null ? null : (
                <PillarBar
                  value={signal.value / 100}
                  label={`${label}, ${fmtPointsBare(signal.value)} sobre 100`}
                />
              )}
              {evidence === null ? null : (
                <span
                  className="num truncate text-[length:var(--text-micro)] text-content-secondary"
                  title={evidence}
                >
                  {evidence}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
