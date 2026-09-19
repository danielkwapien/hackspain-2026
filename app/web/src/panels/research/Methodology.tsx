/**
 * «Cómo se calcula»: la metodología del score (ENGINE-EMBAT §5–§7) con las cifras de
 * la empresa, siempre visible al pie de Investigación.
 *
 * Nueve bloques: nota por señal, pilares, nivel y penalización, techos, bandas,
 * contribuciones e identidad aditiva, outlook, confianza y regímenes. Ningún número va
 * escrito aquí: todos salen de `meta.params`, `meta.reference`, `catalog` y la ficha.
 * Mientras meta o catálogo no llegan, las fórmulas llevan «…»; con `activeMonth` la
 * identidad se recalcula para ese mes con `/timeline` y `series_24m`.
 *
 * Dos variantes: `stack` (bloques apilados con su título, al pie de un panel) y `grid`
 * (el diálogo «Cómo se calcula»: sin título propio, `BandScale` y `WeightsRow` delante
 * y los bloques en tarjetas glass a dos columnas).
 */

import type { ReactElement, ReactNode } from "react";
import { fmtConfidence, fmtMonth, fmtPoints } from "@/charts";
import type {
  Band,
  CatalogSignal,
  CatalogSignals,
  CompanySignals,
  TemporalCompanyV2,
  MetaV2,
  Pillar,
  TimelineRow,
} from "@/lib/api-v2";
import { BAND_LABEL, REGIME_LABEL } from "@/lib/regime";
import { EMPTY_VALUE } from "@/lib/format";
import { FAMILY_LABEL } from "@/panels/research/FamilyStats";
import { BandScale, WeightsRow } from "@/panels/research/MethodologyVisuals";
import { signalAt } from "@/panels/research/hover";

export type MethodologyVariant = "stack" | "grid";

export type MethodologyProps = {
  company: TemporalCompanyV2;
  /** Pendientes (`undefined`) → fórmulas con «…». */
  signals?: CompanySignals;
  timeline?: readonly TimelineRow[];
  meta?: MetaV2;
  catalog?: CatalogSignals;
  /** Familia cuyas señales se detallan en el primer bloque. */
  family?: Pillar;
  activeMonth?: string | null;
  /** Meta o catálogo en error: se sustituye el contenido por un aviso. */
  error?: boolean;
  variant?: MethodologyVariant;
};

const TITLE = "Cómo se calcula";
const PENDING = "…";
const MINUS_SIGN = "−";

const BANDS: Band[] = ["solid", "healthy", "watch", "stress"];
const PILLARS: Pillar[] = ["L", "P", "C", "D", "A"];

/** Regla de una línea por régimen (ENGINE §6.2); el orden es el de `REGIME_LABEL`. */
const REGIME_RULE: Record<keyof typeof REGIME_LABEL, string> = {
  warmup: "primeros meses de historia; sin régimen hasta el séptimo mes.",
  stable: "ninguna de las otras reglas se cumple.",
  improving:
    "cuatro o más meses seguidos al alza, amplitud ≥ 65 % y pendiente 6 m positiva, CUSUM o escalón ≥ +6.",
  deteriorating:
    "tres o más meses seguidos a la baja, amplitud ≤ 35 % y pendiente 6 m negativa, CUSUM o escalón ≤ −6.",
  blip: "|z| ≥ 2 uno o dos meses, amplitud 40–60 %, sin tendencia, y vuelve a ±1 σ en dos meses.",
  shock_pending: "un bache cuya vuelta aún no se ha confirmado.",
  recovering:
    "tras deterioro, pendiente 3 m positiva dos meses y aún ≥ 5 pts bajo el máximo de 12 m.",
};

/** Parámetros del motor: hasta dos decimales, sin ceros de relleno (`0,5`, `1,28`, `3`). */
const PARAM_FORMAT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
/** Puntos de la identidad: siempre una decimal. */
const ONE_DECIMAL = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function minus(text: string): string {
  return text.replaceAll("-", MINUS_SIGN);
}

function param(value: number | null | undefined): string {
  return value == null ? PENDING : minus(PARAM_FORMAT.format(value));
}

function points(value: number): string {
  return minus(ONE_DECIMAL.format(value));
}

/** `[80, null]` → `≥ 80`; `[null, 40]` → `< 40`; `[60, 80]` → `60–80`. */
function bandRange([low, high]: [number | null, number | null]): string {
  if (low === null) return `< ${param(high)}`;
  if (high === null) return `≥ ${param(low)}`;
  return `${param(low)}–${param(high)}`;
}

/** Tramos de `f_hist`: `[[0, 0,4], [6, 0,7], …]` → «< 6 m 0,4 · 6–11 m 0,7 · …». */
function histRanges(entries: readonly [number, number][]): string {
  return entries
    .map(([from, factor], index) => {
      const next = entries[index + 1]?.[0];
      const range =
        next === undefined ? `≥ ${from} m` : from === 0 ? `< ${next} m` : `${from}–${next - 1} m`;
      return `${range} ${param(factor)}`;
    })
    .join(" · ");
}

/** Cómo se normaliza una señal del catálogo: sus anclas, o el número de cortes de percentil. */
function signalNorm(item: CatalogSignal): string {
  if (item.norm === "anchor" && item.anchors) {
    const anchors = item.anchors.map(([x, y]) => `${param(x)}→${param(y)}`).join(" · ");
    return `${item.signal_id} anclas ${anchors}`;
  }
  return `${item.signal_id} percentil (${item.breakpoints?.length ?? PENDING} cortes)`;
}

type Identity = {
  /** Mes de la fila de `/timeline` usada; `null` = cifras del corte. */
  month: string | null;
  base: number;
  sum: number;
  penalty: number;
  capAdj: number;
  score: number;
};

/**
 * Términos de `score = base + Σ contrib − penalización − ajuste de techo` para un mes.
 * Con mes, la fila de `/timeline` y los puntos de `series_24m`; sin él (o sin fila, como
 * al apuntar a la banda de forecast), la ficha del corte y `month: null`. El ajuste de
 * techo solo existe si ese mes hubo techo. `null` si la publicación no sirve `base`
 * (el motor real no publica esa descomposición) o falta alguno de sus términos.
 */
function identityAt(
  company: TemporalCompanyV2,
  signals: CompanySignals,
  timeline: readonly TimelineRow[] | undefined,
  month: string | null,
): Identity | null {
  const row = month === null ? undefined : timeline?.find((r) => r.month === month);
  const sum = signals.pillars
    .flatMap((pillar) => pillar.signals)
    .reduce((total, signal) => total + signalAt(signal, row ? month : null).contribution, 0);
  if (
    row &&
    row.base !== null &&
    row.penalty !== null &&
    row.level !== null &&
    row.score !== null
  ) {
    return {
      month: row.month,
      base: row.base,
      sum,
      penalty: row.penalty,
      capAdj: row.cap_code === null ? 0 : Math.max(0, row.level - row.score),
      score: row.score,
    };
  }
  if (company.base === null || company.penalty === null || company.score === null) return null;
  const level = company.base + sum - company.penalty.points;
  return {
    month: null,
    base: company.base,
    sum,
    penalty: company.penalty.points,
    capAdj: company.cap === null ? 0 : Math.max(0, level - company.score),
    score: company.score,
  };
}

const FORMULA_CLASS =
  "num inline-block w-fit rounded-[var(--radius-control)] bg-surface-glass px-2 py-1 text-[length:var(--text-control)] text-content-primary";

function Formula({ children }: { children: ReactNode }): ReactElement {
  return <code className={FORMULA_CLASS}>{children}</code>;
}

const SECTION_CLASS: Record<MethodologyVariant, string> = {
  stack: "flex shrink-0 flex-col gap-3 border-t border-border-glass pt-3",
  grid: "grid grid-cols-2 gap-3",
};

const BLOCK_CLASS: Record<MethodologyVariant, string> = {
  stack: "flex flex-col gap-1 text-[length:var(--text-control)] text-content-secondary",
  grid: "flex flex-col gap-1 rounded-[var(--radius-card)] bg-surface-glass p-3 text-[length:var(--text-body)] text-content-secondary shadow-[inset_0_0_0_1px_var(--border-glass)]",
};

function Block({
  title,
  variant,
  children,
}: {
  title: string;
  variant: MethodologyVariant;
  children: ReactNode;
}): ReactElement {
  return (
    <div className={BLOCK_CLASS[variant]}>
      <h4 className="font-semibold text-content-primary">{title}</h4>
      {children}
    </div>
  );
}

export function Methodology({
  company,
  signals,
  timeline,
  meta,
  catalog,
  family = "L",
  activeMonth = null,
  error = false,
  variant = "stack",
}: MethodologyProps): ReactElement {
  const params = meta?.params;
  const reference = meta?.reference ?? null;
  const items = catalog?.items ?? [];
  const pillarWeights = reference?.pillar_weights ?? catalog?.pillar_weights;

  const weakest = company.penalty?.weakest_pillar ?? null;
  const penaltyPoints = company.penalty?.points ?? null;
  const penalised =
    penaltyPoints !== null && penaltyPoints > 0 && weakest
      ? `${MINUS_SIGN}${fmtPoints(penaltyPoints)} (${FAMILY_LABEL[weakest]})`
      : "sin penalización";

  const identity = signals ? identityAt(company, signals, timeline, activeMonth) : null;
  const identityText = identity
    ? [
        points(identity.base),
        "+",
        `(${identity.sum > 0 ? "+" : ""}${points(identity.sum)})`,
        MINUS_SIGN,
        points(identity.penalty),
        MINUS_SIGN,
        points(identity.capAdj),
        "=",
        fmtPoints(identity.score),
      ].join(" ")
    : PENDING;

  const histEntries = params?.confidence.f_hist ?? [];
  const monthsHist = company.company.months_hist;
  const histToday = [...histEntries].reverse().find(([from]) => from <= monthsHist)?.[1];

  return (
    <section aria-label={TITLE} className={SECTION_CLASS[variant]}>
      {variant === "stack" ? (
        <h3 className="text-[length:var(--text-body)] font-semibold text-content-primary">
          {TITLE}
        </h3>
      ) : (
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <BandScale score={company.score} />
          <WeightsRow pillars={company.pillars} />
        </div>
      )}

      {error ? (
        <p className="col-span-2 text-[length:var(--text-control)] text-content-secondary">
          No se pudo cargar la metodología
        </p>
      ) : (
        <>
          <Block title="1 · De cada señal a una nota" variant={variant}>
            <p>
              Cada señal se traduce a una nota de 0 a 1 con anclas de dominio o con percentiles
              congelados del universo de referencia, y se suaviza con EWMA: α ={" "}
              {param(params?.ewma_alpha.flow)} (flujo) · {param(params?.ewma_alpha.stock)}{" "}
              (stock).
            </p>
            <Formula>u ∈ [0, 1] · u_suav = EWMA(u, α)</Formula>
            <p className="num">
              {items.length === 0
                ? PENDING
                : items
                    .filter((item) => item.pillar === family)
                    .map(signalNorm)
                    .join(" — ")}
            </p>
          </Block>

          <Block title="2 · Pilares" variant={variant}>
            <Formula>P_k = Σ w_i · u_i / Σ w_i</Formula>
            <p>
              Peso del pilar en el universo (w), peso efectivo hoy tras renormalizar sobre lo
              disponible (w_eff) y peso de cada señal dentro del pilar.
            </p>
            {PILLARS.map((pillar) => (
              <p key={pillar} className="num">
                {FAMILY_LABEL[pillar]} · w {param(pillarWeights?.[pillar])} · w_eff{" "}
                {param(company.pillars?.[pillar].weight)}
                {items.length > 0
                  ? ` · ${items
                      .filter((item) => item.pillar === pillar && item.scores)
                      .map((item) => `${item.signal_id} ${param(item.weight_in_pillar)}`)
                      .join(" · ")}`
                  : ""}
              </p>
            ))}
          </Block>

          <Block title="3 · Nivel y penalización del pilar más débil" variant={variant}>
            <Formula>Nivel = 100 · Σ w_k^eff · P_k − Penalización</Formula>
            <Formula>Penalización = 100 · λ · max(0, τ − min_k P_k)</Formula>
            <p className="num">
              λ = {param(params?.penalty.lambda)} · τ = {param(params?.penalty.tau)} · hoy{" "}
              {penalised}
            </p>
          </Block>

          <Block title="4 · Techos por eventos duros" variant={variant}>
            <Formula>Score = min(Nivel, techo)</Formula>
            <p className="num">
              {params
                ? Object.entries(params.caps)
                    .map(([code, value]) => `${code} ${param(value)}`)
                    .join(" · ")
                : PENDING}
            </p>
            <p className="num">
              Hoy:{" "}
              {company.cap
                ? `techo ${company.cap.code} ${fmtPoints(company.cap.value)}`
                : "sin techo"}
            </p>
          </Block>

          <Block title="5 · Bandas" variant={variant}>
            <p className="num">
              {reference
                ? BANDS.map((band) => `${bandRange(reference.bands[band])} ${BAND_LABEL[band]}`).join(
                    " · ",
                  )
                : PENDING}
            </p>
          </Block>

          <Block title="6 · Contribuciones e identidad" variant={variant}>
            <Formula>contrib_i = 100 · w_k^eff · (w_i / Σ w) · (u_i − u_ref,i)</Formula>
            <p>
              Cada señal suma o resta frente a la empresa mediana del universo, y el score se
              descompone exactamente: base + Σ contrib − penalización − ajuste de techo.
            </p>
            <Formula>
              {identityText}
              {identity?.month ? ` · ${fmtMonth(identity.month)}` : ""}
            </Formula>
          </Block>

          <Block title="7 · Outlook a 3 y 6 meses" variant={variant}>
            <Formula>Outlook_h = Score + φ · slope_6m · h + γ · LeadIndex ± z_90 · σ · √h</Formula>
            <p className="num">
              φ = {param(params?.outlook.phi)} · γ = {param(params?.outlook.gamma)} · z_90 ={" "}
              {param(params?.outlook.z_90)} · σ = {param(params?.outlook.sigma_resid)} · h ={" "}
              {params ? params.outlook.horizons.map(param).join(", ") : PENDING}
            </p>
            <p className="num">
              Hoy: h3 {fmtPoints(company.outlook?.h3)} · h6 {fmtPoints(company.outlook?.h6)} · [
              {fmtPoints(company.outlook?.low)}, {fmtPoints(company.outlook?.high)}]
            </p>
          </Block>

          <Block title="8 · Confianza del score" variant={variant}>
            <Formula>confianza = f_hist · f_cov · f_calidad</Formula>
            <p className="num">
              f_hist: {histEntries.length > 0 ? histRanges(histEntries) : PENDING}
            </p>
            <p>
              f_cov es la parte del peso efectivo cubierta por señales disponibles; f_calidad ={" "}
              {param(params?.confidence.f_quality_low)} si la caja es de baja calidad o más del{" "}
              {params ? fmtConfidence(params.confidence.unclassified_share_max) : PENDING} de los
              movimientos está sin clasificar.
            </p>
            <p className="num">
              Hoy: {monthsHist} m → f_hist {histToday === undefined ? PENDING : param(histToday)} ·
              confianza {fmtConfidence(company.confidence)}
            </p>
          </Block>

          <Block title="9 · Regímenes" variant={variant}>
            <p>
              El régimen describe cómo se mueve la serie, no su nivel, y cambiar de régimen exige
              cumplir la nueva regla dos meses seguidos.
            </p>
            {(Object.keys(REGIME_RULE) as (keyof typeof REGIME_RULE)[]).map((regime) => (
              <p key={regime}>
                <span className="text-content-primary">{REGIME_LABEL[regime]}</span>:{" "}
                {REGIME_RULE[regime]}
              </p>
            ))}
            <p className="num">
              Hoy: {company.regime === null ? EMPTY_VALUE : REGIME_LABEL[company.regime]}
            </p>
          </Block>
        </>
      )}
    </section>
  );
}
