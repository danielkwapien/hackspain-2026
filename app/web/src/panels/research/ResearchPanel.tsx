/**
 * Panel Investigación: la ficha de la empresa seleccionada, al estilo de la ficha de
 * instrumento de Trade Republic.
 *
 * De arriba abajo: cabecera (nombre y el trío Score · Δ 1 m · Confianza), gráfica sin
 * ejes con rango, familia de señales (`FamilyStats`), última alerta y metodología
 * (`Methodology`). El marco lo pone el widget; aquí solo va el contenido.
 *
 * Al pasar el ratón por la gráfica (`activeMonth`) la cabecera, las señales y la
 * identidad de la metodología hablan del mes apuntado; al salir vuelven al corte.
 *
 * Al cambiar de empresa el contenedor `data-company` se remonta (`key`) y entra con
 * el cross-fade de `index.css`. Rango y familia viven fuera de ese contenedor para
 * que sobrevivan al cambio: quien compara empresas a 6M no quiere volver a 1A.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { LineNoAxes, fmtConfidence, fmtDelta, fmtMonth, fmtPoints, fmtU } from "@/charts";
import type { LineMarker } from "@/charts";
import { ErrorState } from "@/components/states";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useSelection } from "@/dashboard/selection";
import { ApiError } from "@/lib/api";
import type { AlertRow, TemporalCompanyV2, Pillar } from "@/lib/api-v2";
import {
  isTemporalCompany,
  getCatalogSignals,
  getCompanySignals,
  getCompanyTimeline,
  getCompanyV2,
  getMeta,
} from "@/lib/api-v2";
import {
  catalogKey,
  companyKey,
  companySignalsKey,
  companyTimelineKey,
  metaKey,
} from "@/lib/query-keys";
import { FAMILY_LABEL, FamilyStats, FamilyStatsSkeleton } from "@/panels/research/FamilyStats";
import { Methodology } from "@/panels/research/Methodology";
import { SnapshotSheet } from "./SnapshotSheet";
import { buildForecast } from "@/panels/research/forecast";
import { kpisAt } from "@/panels/research/hover";
import type { MonthKpis } from "@/panels/research/hover";

/** Rango como texto; `points` es el número de meses visibles, `null` = todos. */
const RANGES = [
  { label: "3M", points: 4 },
  { label: "6M", points: 7 },
  { label: "1A", points: 13 },
  { label: "Máx", points: null },
] as const;

type RangeLabel = (typeof RANGES)[number]["label"];

const RANGE_OPTIONS = RANGES.map((range) => ({ value: range.label, label: range.label }));

const FAMILY_OPTIONS = (Object.keys(FAMILY_LABEL) as Pillar[]).map((pillar) => ({
  value: pillar,
  label: FAMILY_LABEL[pillar],
}));

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

const SEVERITY: Record<AlertRow["severity"], { label: string; className: string }> = {
  watch: { label: "Vigilar", className: "text-content-alert" },
  review: { label: "Revisar", className: "text-content-alert" },
  urgent: { label: "Urgente", className: "text-content-negative" },
};

const SECTION_CLASS = "flex shrink-0 flex-col gap-2 border-t border-border-glass pt-3";
const KPI_TERM_CLASS = "text-[length:var(--text-micro)] text-content-secondary";

/** `entity` fija una empresa en el widget; `null` sigue la selección global. */
export function ResearchPanel({ entity = null }: { entity?: string | null }): ReactElement {
  const selected = useSelection((state) => state.selected);
  const id = entity ?? selected;
  const [range, setRange] = useState<RangeLabel>("1A");
  const [family, setFamily] = useState<Pillar>("L");

  if (id === null) {
    return (
      <p className="pt-2 text-[length:var(--text-body)] text-content-secondary">
        Selecciona una empresa en la tabla
      </p>
    );
  }

  return (
    <CompanySheet
      id={id}
      range={range}
      onRange={setRange}
      family={family}
      onFamily={setFamily}
    />
  );
}

function CompanySheet({
  id,
  range,
  onRange,
  family,
  onFamily,
}: {
  id: string;
  range: RangeLabel;
  onRange: (range: RangeLabel) => void;
  family: Pillar;
  onFamily: (family: Pillar) => void;
}): ReactElement {
  const company = useQuery({ queryKey: companyKey(id), queryFn: () => getCompanyV2(id) });
  const timeline = useQuery({
    queryKey: companyTimelineKey(id),
    queryFn: () => getCompanyTimeline(id),
    enabled: company.data !== undefined && isTemporalCompany(company.data),
  });
  const signals = useQuery({
    queryKey: companySignalsKey(id),
    queryFn: () => getCompanySignals(id),
    enabled: company.data !== undefined && isTemporalCompany(company.data),
  });
  const meta = useQuery({ queryKey: metaKey, queryFn: getMeta, staleTime: Infinity });
  const catalog = useQuery({
    queryKey: catalogKey,
    queryFn: getCatalogSignals,
    enabled: company.data !== undefined && isTemporalCompany(company.data),
    staleTime: Infinity,
  });
  const [activeMonth, setActiveMonth] = useState<string | null>(null);

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

  if (!isTemporalCompany(company.data)) return <SnapshotSheet company={company.data} />;

  const hovered =
    activeMonth !== null && timeline.data ? kpisAt(timeline.data, activeMonth) : null;
  const familySignals = signals.data?.pillars.find((pillar) => pillar.pillar === family);

  return (
    <div
      key={id}
      data-company={id}
      className="animate-crossfade motion-reduce:animate-none flex h-full min-h-0 flex-col gap-3 overflow-y-auto"
    >
      <SheetHeader
        company={company.data}
        kpis={hovered}
        month={hovered ? activeMonth : null}
      />
      <SheetChart
        company={company.data}
        range={range}
        onRange={onRange}
        activeMonth={activeMonth}
        onHover={setActiveMonth}
      />

      <section className={SECTION_CLASS} aria-label="Señales de la familia">
        <div className="flex items-center justify-between gap-3">
          <Segmented value={family} options={FAMILY_OPTIONS} onChange={onFamily} label="Familia" />
          <span className="num text-[length:var(--text-control)] text-content-secondary">
            {fmtU(company.data.pillars[family].value)} · peso{" "}
            {fmtU(company.data.pillars[family].weight)}
            {activeMonth ? ` · ${fmtMonth(activeMonth)}` : ""}
          </span>
        </div>
        {signals.isPending ? <FamilyStatsSkeleton /> : null}
        {signals.isError ? (
          <ErrorState
            error={signals.error}
            context="las señales"
            onRetry={() => void signals.refetch()}
          />
        ) : null}
        {familySignals ? (
          <FamilyStats signals={familySignals.signals} activeMonth={activeMonth} />
        ) : null}
      </section>

      {company.data.alert ? <SheetAlert alert={company.data.alert} /> : null}

      <Methodology
        company={company.data}
        signals={signals.data}
        timeline={timeline.data}
        meta={meta.data}
        catalog={catalog.data}
        family={family}
        activeMonth={activeMonth}
        error={meta.isError || catalog.isError}
      />
    </div>
  );
}

function SheetHeader({
  company,
  kpis,
  month,
}: {
  company: TemporalCompanyV2;
  /** Cifras del mes apuntado; `null` = las del corte. */
  kpis: MonthKpis | null;
  month: string | null;
}): ReactElement {
  const delta = fmtDelta(kpis ? kpis.delta : company.delta_1m);
  const suffix = month ? ` · ${fmtMonth(month)}` : "";

  return (
    <header className="flex shrink-0 items-baseline justify-between gap-3">
      <span
        className="min-w-0 truncate text-[length:var(--text-panel-title)] font-semibold text-content-primary"
        title={company.company.name}
      >
        {company.company.name}
      </span>

      <dl aria-live="polite" className="flex shrink-0 items-baseline gap-4 text-right">
        <div>
          <dt className={KPI_TERM_CLASS}>Score</dt>
          <dd className="num text-[length:var(--text-figure)] font-semibold text-content-primary">
            {fmtPoints(kpis ? kpis.score : company.score)}
            {suffix ? <span className={KPI_TERM_CLASS}>{suffix}</span> : null}
          </dd>
        </div>
        <div>
          <dt className={KPI_TERM_CLASS}>Δ 1 m</dt>
          <dd className="num text-[length:var(--text-body)]" style={{ color: delta.tone }}>
            {delta.text}
          </dd>
        </div>
        <div>
          <dt className={KPI_TERM_CLASS}>Confianza</dt>
          <dd className="num text-[length:var(--text-body)] text-content-primary">
            {fmtConfidence(kpis ? kpis.confidence : company.confidence)}
          </dd>
        </div>
      </dl>
    </header>
  );
}

function SheetChart({
  company,
  range,
  onRange,
  activeMonth,
  onHover,
}: {
  company: TemporalCompanyV2;
  range: RangeLabel;
  onRange: (range: RangeLabel) => void;
  activeMonth: string | null;
  onHover: (month: string | null) => void;
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
      <Segmented value={range} options={RANGE_OPTIONS} onChange={onRange} label="Rango" />

      {company.timeline.length < MIN_HISTORY || !first ? (
        <p
          className="flex items-center text-[length:var(--text-control)] text-content-secondary"
          style={{ height: CHART_HEIGHT }}
        >
          Historia insuficiente: hacen falta tres meses de score
        </p>
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
            activeMonth={activeMonth}
            tooltip={false}
            onHover={onHover}
            label={`Score de ${company.company.name}, ${range}`}
            unit="pts"
          />
        </div>
      )}
    </div>
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
        <span className="num text-[length:var(--text-micro)] text-content-secondary">
          {fmtMonth(alert.month_detected)}
        </span>
      </div>
      <p
        className="line-clamp-2 text-[length:var(--text-control)] text-content-primary"
        title={alert.message}
      >
        {alert.message}
      </p>
    </section>
  );
}

/** Skeleton con la forma de la ficha: cabecera, gráfica y seis celdas de señal. */
function SheetSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-3 pt-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos</span>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-40" />
      </div>
      <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
