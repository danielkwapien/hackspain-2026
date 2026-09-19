/**
 * Panel Investigación: la ficha de la entidad seleccionada (empresa o grupo), al
 * estilo de la ficha de instrumento de Trade Republic.
 *
 * Empresa, de arriba abajo: cabecera (nombre y Score · Δ rango · Confianza · Outlook
 * 6 m), gráfica con rango y menú de métrica (Health score o una familia), la fila de
 * KPIs de la métrica activa (pilares en pts o señales de la familia, con ⓘ y % del
 * rango) y, con el Health score, «Señales» con los cinco drivers que más pesan. Con
 * una familia la fila ya lista sus señales, así que el bloque de drivers no se repite.
 * Grupo: `GroupSheet`. Ni fórmulas ni alerta: viven en Investigación profunda y en
 * Alertas.
 *
 * Al pasar el ratón por la gráfica (`activeMonth`) cabecera y celdas hablan del mes
 * apuntado, con las cifras de la fila de `/timeline`; al salir vuelven al corte.
 * Rango y métrica viven fuera del contenedor `key={id}` para sobrevivir al cambio de
 * entidad: quien compara a 6M no quiere volver a 1A.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LineForecast, LineMarker } from "@/charts";
import { ErrorState } from "@/components/states";
import { resolveEntity, useSelection } from "@/dashboard/selection";
import { ApiError } from "@/lib/api";
import type { CompanyV2, Pillar, TimelineRow } from "@/lib/api-v2";
import { getCompanySignals, getCompanyTimeline, getCompanyV2, isTemporalCompany } from "@/lib/api-v2";
import type { Metric } from "@/lib/definitions";
import { companyKey, companySignalsKey, companyTimelineKey } from "@/lib/query-keys";
import { GroupSheet } from "@/panels/research/GroupSheet";
import { buildForecast } from "@/panels/research/forecast";
import { kpisAt } from "@/panels/research/hover";
import { KpiRow, KpiRowSkeleton, pillarCells, signalCells } from "@/panels/research/KpiRow";
import { MetricMenu } from "@/panels/research/MetricMenu";
import {
  HISTORY_MESSAGE,
  MIN_HISTORY,
  PILLAR_MESSAGE,
  SheetChart,
  SheetSkeleton,
  pillarChart,
  scoreChart,
} from "@/panels/research/SheetChart";
import { SheetFacts } from "@/panels/research/SheetFacts";
import { SheetHeader } from "@/panels/research/SheetHeader";
import { SnapshotSheet } from "@/panels/research/SnapshotSheet";
import { StrategicCards } from "@/panels/research/StrategicCards";
import { UnitSwitch } from "@/panels/research/UnitSwitch";
import type { RangeLabel } from "@/panels/research/series";
import { rangeDelta, topDrivers, visibleSlice } from "@/panels/research/series";
import { TopDrivers } from "@/panels/research/TopDrivers";

/** `entity` fija una empresa o un grupo en el widget; `null` sigue la selección global. */
export function ResearchPanel({ entity = null }: { entity?: string | null }): ReactElement {
  const selectedEntity = useSelection((state) => state.selectedEntity);
  const resolved = resolveEntity(entity, selectedEntity);
  const [range, setRange] = useState<RangeLabel>("1A");
  const [metric, setMetric] = useState<Metric>("score");

  if (resolved === null) {
    return (
      <p className="pt-2 text-[length:var(--text-body)] text-content-secondary">
        Selecciona una empresa o un grupo en el buscador
      </p>
    );
  }

  if (resolved.kind === "group") {
    return <GroupSheet id={resolved.id} range={range} onRange={setRange} />;
  }

  return (
    <CompanySheet
      id={resolved.id}
      range={range}
      onRange={setRange}
      metric={metric}
      onMetric={setMetric}
    />
  );
}

/** Marcadores del score: la alerta si cae en el rango y el techo en el corte. */
function scoreMarkers(company: CompanyV2, visible: readonly TimelineRow[]): LineMarker[] {
  const markers: LineMarker[] = [];
  const alertMonth = company.alert?.month_detected;
  if (alertMonth && visible.some((row) => row.month === alertMonth)) {
    markers.push({ month: alertMonth, kind: "alert" });
  }
  if (company.cap) markers.push({ month: company.as_of, kind: "cap" });
  return markers;
}

/**
 * Proyección del corte, solo cuando la publicación trae score y banda completos.
 * Sin ellos la gráfica va sin banda: nunca se inventa un centro ni un rango.
 */
function forecastOf(company: CompanyV2): LineForecast | undefined {
  const outlook = company.outlook;
  if (
    company.score === null ||
    outlook === null ||
    outlook.h3 === null ||
    outlook.h6 === null ||
    outlook.low === null ||
    outlook.high === null
  ) {
    return undefined;
  }
  return buildForecast(company.as_of, company.score, {
    ...outlook,
    h3: outlook.h3,
    h6: outlook.h6,
    low: outlook.low,
    high: outlook.high,
  });
}

function CompanySheet({
  id,
  range,
  onRange,
  metric,
  onMetric,
}: {
  id: string;
  range: RangeLabel;
  onRange: (range: RangeLabel) => void;
  metric: Metric;
  onMetric: (metric: Metric) => void;
}): ReactElement {
  const company = useQuery({ queryKey: companyKey(id), queryFn: () => getCompanyV2(id) });
  const isTemporal = company.data !== undefined && isTemporalCompany(company.data);
  const timeline = useQuery({
    queryKey: companyTimelineKey(id),
    queryFn: () => getCompanyTimeline(id),
    enabled: isTemporal,
  });
  const [activeMonth, setActiveMonth] = useState<string | null>(null);

  if (company.isPending || (isTemporal && timeline.isPending)) return <SheetSkeleton />;

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

  if (company.data === undefined) return <SheetSkeleton />;

  if (!isTemporalCompany(company.data)) return <SnapshotSheet company={company.data} />;

  if (timeline.isError) {
    return (
      <ErrorState
        error={timeline.error}
        context="la historia del score"
        onRetry={() => void timeline.refetch()}
      />
    );
  }

  if (timeline.data === undefined) return <SheetSkeleton />;

  const data = company.data;
  const rows = timeline.data;
  const name = data.company.name;
  const visible = visibleSlice(rows, range);
  const first = visible[0] ?? null;
  const hovered = activeMonth !== null ? kpisAt(rows, activeMonth) : null;
  // La gráfica necesita tres puntos de score: los meses sin score no cuentan como historia.
  const scoredMonths = rows.filter((row) => row.score !== null).length;

  const chart =
    metric === "score"
      ? scoreChart(rows, range, {
          forecast: forecastOf(data),
          markers: scoreMarkers(data, visible),
          label: `Score de ${name}, ${range}`,
        })
      : pillarChart(rows, metric, range, name);

  return (
    <div
      key={id}
      data-company={id}
      className="animate-crossfade motion-reduce:animate-none flex h-full min-h-0 flex-col gap-3 overflow-y-auto"
    >
      <SheetHeader
        name={name}
        score={hovered ? hovered.score : data.score}
        delta={rangeDelta(visible, activeMonth)}
        rangeLabel={range}
        confidence={hovered ? hovered.confidence : data.confidence}
        outlook6={hovered ? hovered.outlook6 : (data.outlook?.h6 ?? null)}
        month={hovered ? activeMonth : null}
        narrative={data.narrative}
      />
      <SheetFacts
        opIn12m={data.op_in_12m}
        currency={data.op_in_12m_currency}
        flags={data.strength_flags}
      />
      <SheetChart
        range={range}
        onRange={onRange}
        menu={
          <div className="flex items-center gap-2">
            <UnitSwitch kind="company" companyId={id} groupId={data.company.group_id} />
            <MetricMenu value={metric} onChange={onMetric} />
          </div>
        }
        chart={chart}
        message={scoredMonths < MIN_HISTORY ? HISTORY_MESSAGE : PILLAR_MESSAGE}
        activeMonth={activeMonth}
        onHover={setActiveMonth}
      />

      {metric === "score" ? (
        <>
          <KpiRow
            cells={pillarCells({
              pillars: hovered?.pillars ?? data.pillars,
              firstPillars: first?.pillars ?? null,
              range,
            })}
          />
          <TopDrivers drivers={topDrivers(data.drivers)} />
          <StrategicCards signals={data.strategic_signals} />
        </>
      ) : (
        <FamilyRow
          id={id}
          pillar={metric}
          activeMonth={hovered ? activeMonth : null}
          firstMonth={first?.month ?? null}
          range={range}
        />
      )}
    </div>
  );
}

/** Fila de señales de la familia: `/signals` se pide solo cuando hay una familia activa. */
function FamilyRow({
  id,
  pillar,
  activeMonth,
  firstMonth,
  range,
}: {
  id: string;
  pillar: Pillar;
  activeMonth: string | null;
  firstMonth: string | null;
  range: RangeLabel;
}): ReactElement {
  const signals = useQuery({
    queryKey: companySignalsKey(id),
    queryFn: () => getCompanySignals(id),
  });

  if (signals.isPending) return <KpiRowSkeleton />;
  if (signals.isError) {
    return (
      <ErrorState
        error={signals.error}
        context="las señales"
        onRetry={() => void signals.refetch()}
      />
    );
  }

  const family = signals.data.pillars.find((item) => item.pillar === pillar);
  if (!family) {
    return (
      <p className="text-[length:var(--text-body)] text-content-secondary">{PILLAR_MESSAGE}</p>
    );
  }

  return (
    <KpiRow cells={signalCells({ signals: family.signals, activeMonth, firstMonth, range })} />
  );
}
