/**
 * Miniaturas del catálogo de widgets: seis SVG de 60 × 30 que sugieren la forma
 * de cada tipo. Solo `currentColor` y tokens `--content-*`: heredan el color del
 * texto de la tarjeta y no fijan ningún literal.
 */

import type { ReactElement, ReactNode } from "react";

const SECONDARY = "var(--content-secondary)";
const ACCENT = "var(--content-accent)";
const POSITIVE = "var(--content-positive)";
const NEGATIVE = "var(--content-negative)";
const ALERT = "var(--content-alert)";

function Frame({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg viewBox="0 0 60 30" aria-hidden="true" className="block h-auto w-full">
      {children}
    </svg>
  );
}

/** Tabla: cabecera y cuatro filas con el score a la derecha. */
export function CompaniesThumb(): ReactElement {
  return (
    <Frame>
      {[6, 12, 18, 24].map((y) => (
        <g key={y}>
          <rect x="4" y={y - 1} width="26" height="2" rx="1" fill="currentColor" />
          <rect x="46" y={y - 1} width="10" height="2" rx="1" fill={SECONDARY} />
        </g>
      ))}
    </Frame>
  );
}

/** Ficha: titular, gráfica sin ejes y una línea base punteada. */
export function ResearchThumb(): ReactElement {
  return (
    <Frame>
      <rect x="4" y="4" width="20" height="2" rx="1" fill="currentColor" />
      <line x1="4" y1="20" x2="56" y2="20" stroke={SECONDARY} strokeDasharray="0 3.6" strokeLinecap="round" />
      <polyline
        points="4,22 14,18 24,20 34,13 44,15 56,10"
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Dos series en una sola gráfica. */
export function CompareThumb(): ReactElement {
  return (
    <Frame>
      <polyline
        points="4,22 16,16 28,18 40,10 56,12"
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polyline
        points="4,14 16,19 28,12 40,20 56,22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Bandeja: punto de severidad y texto por fila. */
export function AlertsThumb(): ReactElement {
  return (
    <Frame>
      {[7, 15, 23].map((y, index) => (
        <g key={y}>
          <circle cx="7" cy={y} r="2" fill={index === 0 ? NEGATIVE : ALERT} />
          <rect x="13" y={y - 1} width="30" height="2" rx="1" fill="currentColor" />
          <rect x="48" y={y - 1} width="8" height="2" rx="1" fill={SECONDARY} />
        </g>
      ))}
    </Frame>
  );
}

/** Treemap: rectángulos por tamaño, color por Δ. */
export function TreemapThumb(): ReactElement {
  return (
    <Frame>
      <rect x="4" y="4" width="26" height="22" rx="1.5" fill={POSITIVE} opacity="0.85" />
      <rect x="32" y="4" width="24" height="12" rx="1.5" fill={NEGATIVE} opacity="0.85" />
      <rect x="32" y="18" width="11" height="8" rx="1.5" fill={POSITIVE} opacity="0.6" />
      <rect x="45" y="18" width="11" height="8" rx="1.5" fill={SECONDARY} opacity="0.6" />
    </Frame>
  );
}

/** Grupo: cabecera con score y filiales sangradas. */
export function GroupThumb(): ReactElement {
  return (
    <Frame>
      <rect x="4" y="4" width="22" height="3" rx="1.5" fill="currentColor" />
      <rect x="46" y="4" width="10" height="3" rx="1.5" fill={ACCENT} />
      {[13, 19, 25].map((y) => (
        <g key={y}>
          <rect x="10" y={y - 1} width="20" height="2" rx="1" fill={SECONDARY} />
          <rect x="46" y={y - 1} width="10" height="2" rx="1" fill={SECONDARY} />
        </g>
      ))}
    </Frame>
  );
}
