/**
 * Panel Investigación: la ficha de la empresa seleccionada sobre
 * `/api/v2/companies/:id`, al estilo de la ficha de instrumento de Trade Republic.
 *
 * De arriba abajo: cabecera (nombre, score, Δ1m, régimen, banda y outlook a seis
 * meses como Bid/Ask), titular de la narrativa, gráfica sin ejes con la banda de
 * outlook proyectada desde `as_of`, cinco pilares, los drivers del mes y la última
 * alerta. El marco (título, fondo glass) lo pone `Panel`; aquí solo va el contenido.
 *
 * Al cambiar de empresa el contenedor `data-company` se remonta (`key`) y entra con
 * el cross-fade de `index.css`. El rango de la gráfica vive fuera de ese contenedor
 * para que sobreviva al cambio: quien compara empresas a 6M no quiere volver a 1A.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { LineNoAxes, PillarBar, fmtDelta, fmtMonth, fmtPoints, fmtU } from "@/charts";
import type { LineMarker } from "@/charts";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useSelection } from "@/dashboard/selection";
import { ApiError } from "@/lib/api";
import type { AlertRow, CompanyV2, Pillar } from "@/lib/api-v2";
import { getCompanyV2 } from "@/lib/api-v2";
import { EMPTY_VALUE } from "@/lib/format";
import { BAND_CLASS, BAND_LABEL, REGIME_CLASS, REGIME_LABEL } from "@/lib/regime";
import { buildForecast } from "@/panels/research/forecast";

/** Rango como texto; `points` es el número de meses visibles, `null` = todos. */
const RANGES = [
  { label: "3M", points: 4 },
  { label: "6M", points: 7 },
  { label: "1A", points: 13 },
  { label: "Máx", points: null },
] as const;

type RangeLabel = (typeof RANGES)[number]["label"];

/** Meses mínimos de score para dibujar una trayectoria. */
const MIN_HISTORY = 3;

/**
 * Alto fijo de la gráfica, entre `--size-chart-large` (148) y el techo de 260.
 * Trade Republic también fija los 148 px de su ficha. Medirlo con `ResizeObserver`
 * sobre un `flex-1` retroalimenta el alto: el contenedor crece con su propio
 * contenido (SVG `preserveAspectRatio="none"` más la capa HTML absoluta), la
 * gráfica se pinta más alta que su caja y pisa las secciones de abajo.
 */
const CHART_HEIGHT = 168;

/** Drivers que se muestran; `PENALTY` y `CAP` ya viven en pilares y marcadores. */
const MAX_DRIVERS = 5;
const HIDDEN_SIGNALS = new Set(["PENALTY", "CAP"]);

const PILLARS: { key: Pillar; label: string }[] = [
  { key: "L", label: "Liquidez" },
  { key: "P", label: "Pago propio" },
  { key: "C", label: "Cobros" },
  { key: "D", label: "Deuda" },
  { key: "A", label: "Actividad" },
];

const SEVERITY: Record<AlertRow["severity"], { label: string; className: string }> = {
  watch: { label: "Vigilar", className: "text-content-alert" },
  review: { label: "Revisar", className: "text-content-alert" },
  urgent: { label: "Urgente", className: "text-content-negative" },
};

/** Signo menos tipográfico, el mismo que emite `@/charts/format`. */
const MINUS_SIGN = "−";

const SECTION_CLASS = "flex shrink-0 flex-col gap-2 border-t border-border-glass pt-3";
const SECTION_TITLE_CLASS =
  "text-[length:var(--text-control)] font-semibold text-content-primary";
const MONO_CLASS = "font-mono tabular-nums";
const RANGE_BUTTON_CLASS =
  "text-[length:var(--text-control)] font-semibold transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:text-content-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function ResearchPanel(): ReactElement {
  const selected = useSelection((state) => state.selected);
  const [range, setRange] = useState<RangeLabel>("1A");

  if (selected === null) {
    return (
      <div className="flex flex-col gap-1 pt-2 text-content-secondary">
        <p className="text-[length:var(--text-body)]">Selecciona una empresa</p>
        <p className="text-[length:var(--text-control)]">
          Haz clic en una fila de Empresas para verla aquí.
        </p>
      </div>
    );
  }

  return <CompanySheet id={selected} range={range} onRange={setRange} />;
}

function CompanySheet({
  id,
  range,
  onRange,
}: {
  id: string;
  range: RangeLabel;
  onRange: (range: RangeLabel) => void;
}): ReactElement {
  const company = useQuery({
    queryKey: ["company-v2", id],
    queryFn: () => getCompanyV2(id),
  });

  if (company.isPending) return <SheetSkeleton />;

  if (company.isError) {
    const notFound = company.error instanceof ApiError && company.error.status === 404;
    return (
      <ErrorState
        error={notFound ? new Error(`No existe ninguna empresa ${id} en este corte.`) : company.error}
        context="la ficha de la empresa"
        onRetry={() => void company.refetch()}
      />
    );
  }

  return (
    <div
      key={id}
      data-company={id}
      className="animate-crossfade motion-reduce:animate-none flex h-full min-h-0 flex-col gap-3 overflow-y-auto"
    >
      <SheetHeader company={company.data} />
      <SheetChart company={company.data} range={range} onRange={onRange} />
      <SheetPillars company={company.data} />
      <SheetDrivers company={company.data} />
      {company.data.alert ? <SheetAlert alert={company.data.alert} /> : null}
    </div>
  );
}

function SheetHeader({ company }: { company: CompanyV2 }): ReactElement {
  const delta = fmtDelta(company.delta_1m);

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span
              className="truncate text-[length:var(--text-panel-title)] font-semibold text-content-primary"
              title={company.company.name}
            >
              {company.company.name}
            </span>
            <span
              className={cn(MONO_CLASS, "text-[length:var(--text-micro)] text-content-secondary")}
            >
              {company.company.company_id}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[length:var(--text-control)]">
            <span
              className={cn(
                MONO_CLASS,
                "text-[length:var(--text-figure)] font-semibold text-content-primary",
              )}
            >
              {fmtPoints(company.score)}
            </span>
            <span className={MONO_CLASS} style={{ color: delta.tone }}>
              {delta.text}
            </span>
            <span className="text-content-tertiary">·</span>
            <span className={REGIME_CLASS[company.regime]}>{REGIME_LABEL[company.regime]}</span>
            <span className="text-content-tertiary">·</span>
            <span className={BAND_CLASS[company.band]}>{BAND_LABEL[company.band]}</span>
          </div>
        </div>

        <dl className="shrink-0 text-right text-[length:var(--text-control)]">
          <dt className="text-[length:var(--text-micro)] text-content-secondary">Outlook 6 m</dt>
          <dd className={cn(MONO_CLASS, "text-content-primary")}>
            {fmtPoints(company.outlook.low)} · {fmtPoints(company.outlook.high)}
          </dd>
          <dt className="mt-1 text-[length:var(--text-micro)] text-content-secondary">
            Confianza
          </dt>
          <dd className={cn(MONO_CLASS, "text-content-primary")}>{fmtU(company.confidence)}</dd>
        </dl>
      </header>

      <p
        className="truncate text-[length:var(--text-body)] font-medium text-content-primary"
        title={company.narrative.headline}
      >
        {company.narrative.headline}
      </p>
    </div>
  );
}

function SheetChart({
  company,
  range,
  onRange,
}: {
  company: CompanyV2;
  range: RangeLabel;
  onRange: (range: RangeLabel) => void;
}): ReactElement {
  const points = RANGES.find((option) => option.label === range)?.points ?? null;
  const visible = points === null ? company.timeline : company.timeline.slice(-points);
  const first = visible[0];

  const markers: LineMarker[] = [];
  const alertMonth = company.alert?.month_detected;
  if (alertMonth && visible.some((point) => point.month === alertMonth)) {
    markers.push({ month: alertMonth, kind: "alert" });
  }
  if (company.cap) markers.push({ month: company.as_of, kind: "cap" });

  return (
    <div className={SECTION_CLASS}>
      <div role="group" aria-label="Rango" className="flex justify-end gap-3">
        {RANGES.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={range === option.label}
            className={cn(
              RANGE_BUTTON_CLASS,
              range === option.label ? "text-content-primary" : "text-content-secondary",
            )}
            style={{ borderRadius: "var(--radius-control)" }}
            onClick={() => onRange(option.label)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {company.timeline.length < MIN_HISTORY || !first ? (
        <div
          className="flex flex-col justify-center gap-1 text-content-secondary"
          style={{ height: "var(--size-chart-large)" }}
        >
          <p className="text-[length:var(--text-body)] text-content-primary">
            Historia insuficiente
          </p>
          <p className="text-[length:var(--text-control)]">
            Hacen falta al menos tres meses de score para dibujar la trayectoria.
          </p>
        </div>
      ) : (
        <div className="relative h-[168px] shrink-0 overflow-hidden">
          <LineNoAxes
            series={[
              {
                id: "score",
                points: visible.map((point) => ({
                  month: point.month,
                  value: point.score,
                  regime: point.regime,
                })),
              },
            ]}
            baseline={{ value: first.score, label: fmtMonth(first.month) }}
            forecast={buildForecast(company.as_of, company.score, company.outlook)}
            markers={markers}
            height={CHART_HEIGHT}
            label={`Score de ${company.company.name}, ${range}`}
            unit="pts"
          />
        </div>
      )}
    </div>
  );
}

function SheetPillars({ company }: { company: CompanyV2 }): ReactElement {
  const { penalty, pillars } = company;
  const penalised = penalty.points > 0 ? penalty.weakest_pillar : null;

  return (
    <section className={SECTION_CLASS} aria-label="Pilares del score">
      <h3 className={SECTION_TITLE_CLASS}>Pilares del score</h3>
      {PILLARS.map(({ key, label }) => {
        const value = pillars[key].value;
        const known = Number.isFinite(value);
        const weakest = penalised === key;
        return (
          <div key={key} className="grid grid-cols-[96px_1fr_44px] items-center gap-3">
            <span
              className={cn(
                "truncate text-[length:var(--text-control)]",
                weakest ? "text-content-alert" : "text-content-secondary",
              )}
            >
              {label}
              {weakest ? (
                <span className={cn(MONO_CLASS, "ml-1")}>
                  · {MINUS_SIGN}
                  {fmtPoints(penalty.points)}
                </span>
              ) : null}
            </span>
            <PillarBar value={known ? value : 0} label={label} variant="plain" />
            <span
              className={cn(
                MONO_CLASS,
                "text-right text-[length:var(--text-control)] text-content-primary",
              )}
            >
              {known ? fmtU(value) : EMPTY_VALUE}
            </span>
          </div>
        );
      })}
    </section>
  );
}

function SheetDrivers({ company }: { company: CompanyV2 }): ReactElement {
  const drivers = company.drivers
    .filter((driver) => !HIDDEN_SIGNALS.has(driver.signal_id))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_DRIVERS);

  return (
    <section className={SECTION_CLASS} aria-label="Qué se movió">
      <h3 className={SECTION_TITLE_CLASS}>Qué se movió</h3>
      {drivers.map((driver) => {
        const contribution = fmtDelta(driver.contribution);
        const previous = fmtDelta(driver.delta_vs_prev);
        const text = driver.value_fmt ?? driver.signal_id;
        return (
          <div key={driver.signal_id} className="flex items-baseline justify-between gap-3">
            <span
              className="min-w-0 truncate text-[length:var(--text-body)] text-content-primary"
              title={text}
            >
              {text}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span
                className={cn(MONO_CLASS, "text-[length:var(--text-control)]")}
                style={{ color: contribution.tone }}
              >
                {contribution.text}
              </span>
              <span
                className={cn(
                  MONO_CLASS,
                  "text-[length:var(--text-micro)] text-content-secondary",
                )}
              >
                vs mes ant. {previous.text}
              </span>
            </span>
          </div>
        );
      })}
    </section>
  );
}

function SheetAlert({ alert }: { alert: AlertRow }): ReactElement {
  const severity = SEVERITY[alert.severity];
  return (
    <section className={SECTION_CLASS} aria-label="Última alerta">
      <div className="flex items-baseline gap-2">
        <span className={cn("text-[length:var(--text-micro)] font-semibold", severity.className)}>
          {severity.label}
        </span>
        <span
          className={cn(MONO_CLASS, "text-[length:var(--text-micro)] text-content-secondary")}
        >
          {fmtMonth(alert.month_detected)}
        </span>
      </div>
      <p className="line-clamp-2 text-[length:var(--text-control)] text-content-primary">
        {alert.message}
      </p>
    </section>
  );
}

/** Skeleton con la forma de la ficha: cabecera, gráfica y cinco barras. */
function SheetSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-3 pt-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos</span>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="w-full" style={{ height: "var(--size-chart-large)" }} />
      <div className="flex flex-col gap-3 pt-2">
        {Array.from({ length: PILLARS.length }, (_, index) => (
          <Skeleton key={index} className="h-1.5 w-full" />
        ))}
      </div>
    </div>
  );
}
