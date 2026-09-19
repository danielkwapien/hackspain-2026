/**
 * Ficha consolidada de un grupo, con la misma anatomía que la de empresa: cabecera
 * (Score · Δ rango · Confianza del corte · Outlook 6 m), gráfica de `group.timeline`
 * con la proyección de `groupForecast` (sin menú de métrica: el grupo no publica
 * pilares por mes) y una fila de KPIs de grupo: filiales puntuadas, dispersión, la
 * filial más débil y la más fuerte. Al pasar por la gráfica, score, dispersión y
 * filiales puntuadas hablan del mes apuntado; la confianza sigue siendo la del corte.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtPoints } from "@/charts";
import { ErrorState } from "@/components/states";
import { getGroupV2 } from "@/lib/api-v2";
import type { GroupV2 } from "@/lib/api-v2";
import { groupKey } from "@/lib/query-keys";
import { groupKpisAt } from "@/panels/research/hover";
import type { GroupMonthKpis } from "@/panels/research/hover";
import { KpiRow } from "@/panels/research/KpiRow";
import type { KpiCell } from "@/panels/research/KpiRow";
import { SheetFacts } from "@/panels/research/SheetFacts";
import { SheetHeader } from "@/panels/research/SheetHeader";
import { StrategicCards } from "@/panels/research/StrategicCards";
import { UnitSwitch } from "@/panels/research/UnitSwitch";
import {
  HISTORY_MESSAGE,
  SheetChart,
  SheetSkeleton,
  scoreChart,
} from "@/panels/research/SheetChart";
import type { RangeLabel } from "@/panels/research/series";
import { groupForecast, rangeDelta, visibleSlice } from "@/panels/research/series";

/** Nombre de la filial si viene en `companies`; si no, su id. */
function companyLabel(group: GroupV2, id: string | null): string {
  return id === null ? "—" : (group.companies.find((company) => company.id === id)?.name ?? id);
}

function groupCells(
  group: GroupV2,
  hovered: GroupMonthKpis | null,
): KpiCell[] {
  return [
    {
      key: "scored",
      label: "Filiales puntuadas",
      value: String(hovered ? hovered.nScored ?? "—" : group.n_companies_scored ?? "—"),
    },
    {
      key: "dispersion",
      label: "Dispersión",
      value: fmtPoints(hovered ? hovered.dispersion : group.dispersion),
    },
    {
      key: "weakest",
      label: "Más débil",
      value: `${companyLabel(group, group.weakest_company)} · ${fmtPoints(group.weakest_score)}`,
    },
    {
      key: "strongest",
      label: "Más fuerte",
      value: `${companyLabel(group, group.strongest_company)} · ${fmtPoints(group.strongest_score)}`,
    },
  ];
}

export function GroupSheet({
  id,
  range,
  onRange,
}: {
  id: string;
  range: RangeLabel;
  onRange: (range: RangeLabel) => void;
}): ReactElement {
  const group = useQuery({ queryKey: groupKey(id), queryFn: () => getGroupV2(id) });
  const [activeMonth, setActiveMonth] = useState<string | null>(null);

  if (group.isPending) return <SheetSkeleton />;

  if (group.isError) {
    return (
      <ErrorState
        error={group.error}
        context={`el grupo ${id}`}
        onRetry={() => void group.refetch()}
      />
    );
  }

  const data = group.data;
  const visible = visibleSlice(data.timeline, range);
  const hovered = activeMonth !== null ? groupKpisAt(data.timeline, activeMonth) : null;

  return (
    <div
      key={id}
      data-group={id}
      className="animate-crossfade motion-reduce:animate-none flex h-full min-h-0 flex-col gap-3 overflow-y-auto"
    >
      <SheetHeader
        name={data.group.name}
        score={hovered ? hovered.score : data.score}
        delta={rangeDelta(visible, activeMonth)}
        rangeLabel={range}
        confidence={data.confidence}
        outlook6={data.outlook_6m}
        month={hovered ? activeMonth : null}
        narrative={data.narrative}
      />
      <SheetFacts
        opIn12m={data.op_in_12m}
        currency={data.op_in_12m_currency}
        opIn12mEur={data.op_in_12m_eur}
        flags={data.strength_flags}
      />
      <SheetChart
        range={range}
        onRange={onRange}
        menu={
          <UnitSwitch kind="group" companyId={data.strongest_company} groupId={id} />
        }
        chart={scoreChart(data.timeline, range, {
          forecast: groupForecast(data),
          label: `Score consolidado de ${data.group.name}, ${range}`,
        })}
        message={HISTORY_MESSAGE}
        activeMonth={activeMonth}
        onHover={setActiveMonth}
      />
      <KpiRow cells={groupCells(data, hovered)} />
      <StrategicCards signals={data.strategic_signals} />
    </div>
  );
}
