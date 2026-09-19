/**
 * Widget Grupo: `/api/v2/groups/:id` con la cabecera consolidada, la dispersión
 * entre la filial más débil y la más fuerte, y la lista de filiales.
 *
 * Qué grupo se pinta, por orden: el de la entidad fijada en el widget (`item.entity`
 * es una empresa elegida con «Elegir empresa», o un `GROUP_…` directo), el grupo
 * seleccionado en el store, o el grupo de la empresa seleccionada. El grupo de una
 * empresa sale de su ficha, pedida por `companyKey` para compartir caché con
 * Investigación. Sin ninguno, se pide elegir.
 */

import { useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { RangeBar, Sparkline, fmtDelta, fmtPoints } from "@/charts";
import { ErrorState } from "@/components/states";
import { select, useSelection } from "@/dashboard/selection";
import type { UniverseItem } from "@/lib/api-v2";
import { getCompanyV2, getGroupV2 } from "@/lib/api-v2";
import { companyKey, groupKey } from "@/lib/query-keys";
import { BAND_CLASS, BAND_LABEL, REGIME_CLASS, REGIME_LABEL } from "@/lib/regime";
import type { WidgetContentProps } from "@/widgets/registry";

/** Un `item.entity` con este prefijo ya es un grupo; el resto son empresas del picker. */
const GROUP_PREFIX = "GROUP_";

/** Alto de fila en px: es `--size-table-row`. */
const ROW_HEIGHT = 28;
const SKELETON_ROWS = 6;

const ROW_CLASS =
  "flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-2 transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none";

const NUM_CLASS = "shrink-0 font-mono text-[length:var(--text-control)] tabular-nums";

const SKELETON_BAR_CLASS =
  "h-3 animate-pulse rounded-[var(--radius-control)] bg-surface-glass motion-reduce:animate-none";

function Hint({ children }: { children: string }): ReactElement {
  return (
    <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
      <p>{children}</p>
      <p>El grupo sigue a la selección salvo que el widget fije uno.</p>
    </div>
  );
}

function GroupSkeleton(): ReactElement {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">Cargando grupo</span>
      <div className="flex flex-col gap-2">
        <div className={cn(SKELETON_BAR_CLASS, "w-48")} />
        <div className={cn(SKELETON_BAR_CLASS, "h-5 w-32")} />
        <div className={cn(SKELETON_BAR_CLASS, "h-1.5 w-full")} />
      </div>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <div key={row} className="flex items-center gap-3 px-2" style={{ height: ROW_HEIGHT }}>
          <div className={cn(SKELETON_BAR_CLASS, "min-w-0 flex-1")} />
          <div className={cn(SKELETON_BAR_CLASS, "w-12 shrink-0")} />
          <div className={cn(SKELETON_BAR_CLASS, "w-16 shrink-0")} />
        </div>
      ))}
    </div>
  );
}

function SubsidiaryRow({
  row,
  isSelected,
  onSelect,
}: {
  row: UniverseItem;
  isSelected: boolean;
  onSelect: () => void;
}): ReactElement {
  const delta = fmtDelta(row.delta_1m);

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  }

  return (
    <li
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      className={cn(ROW_CLASS, isSelected && "bg-fills-accent-thin")}
      style={{ height: ROW_HEIGHT }}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <span
        className="min-w-0 flex-1 truncate text-[length:var(--text-body)] text-content-primary"
        title={`${row.name} · ${row.id}`}
      >
        {row.name}
      </span>
      <span className={cn(NUM_CLASS, "text-content-primary")}>{fmtPoints(row.score)}</span>
      <span className={NUM_CLASS} style={{ color: delta.tone }}>
        {delta.text}
      </span>
      <Sparkline points={row.sparkline_12} regime={row.regime} />
    </li>
  );
}

function GroupSheet({
  id,
  onPick,
}: {
  id: string;
  onPick: (companyId: string) => void;
}): ReactElement {
  const selected = useSelection((state) => state.selected);
  const group = useQuery({
    queryKey: groupKey(id),
    queryFn: () => getGroupV2(id),
  });

  if (group.isPending) return <GroupSkeleton />;

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
  const delta = fmtDelta(data.delta_1m);

  return (
    <div key={id} className="animate-crossfade motion-reduce:animate-none flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <h3 className="min-w-0 truncate text-[length:var(--text-panel-title)] font-semibold text-content-primary">
            {data.group.name}
          </h3>
          <span className="shrink-0 font-mono text-[length:var(--text-micro)] tabular-nums text-content-secondary">
            {data.group.group_id}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[length:var(--text-control)]">
          <span className="font-mono text-[length:var(--text-figure)] font-semibold tabular-nums text-content-primary">
            {fmtPoints(data.score)}
          </span>
          <span className="font-mono tabular-nums" style={{ color: delta.tone }}>
            {delta.text}
          </span>
          <span className={REGIME_CLASS[data.regime]}>{REGIME_LABEL[data.regime]}</span>
          <span className={BAND_CLASS[data.band]}>{BAND_LABEL[data.band]}</span>
        </div>
      </header>

      <div className="flex flex-col gap-1">
        <RangeBar
          min={data.weakest_score}
          max={data.strongest_score}
          value={data.score}
          labels={{ min: data.weakest_company, max: data.strongest_company }}
          variant="segmented"
        />
        <span className="text-[length:var(--text-micro)] text-content-secondary">
          {`Dispersión ${fmtPoints(data.dispersion)}`}
        </span>
      </div>

      {data.companies.length === 0 ? (
        <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
          <p>Sin filiales en este corte</p>
          <p>El grupo no tiene empresas puntuadas.</p>
        </div>
      ) : (
        <ul role="listbox" aria-label="Filiales" className="flex min-h-0 flex-col overflow-y-auto">
          {data.companies.map((row) => (
            <SubsidiaryRow
              key={row.id}
              row={row}
              isSelected={selected === row.id}
              onSelect={() => onPick(row.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function GroupWidget({ item }: WidgetContentProps): ReactElement {
  const selected = useSelection((state) => state.selected);
  const selectedGroup = useSelection((state) => state.selectedGroup);
  /**
   * Filial elegida desde este widget: su grupo ya se conoce, así que no hace falta
   * pedir su ficha para volver a descubrir el mismo grupo.
   */
  const [picked, setPicked] = useState<{ companyId: string; groupId: string } | null>(null);
  const knownGroupId = picked !== null && picked.companyId === selected ? picked.groupId : null;

  const pinnedGroupId = item.entity?.startsWith(GROUP_PREFIX) ? item.entity : null;
  const pinnedCompanyId = pinnedGroupId === null ? item.entity : null;

  /**
   * Ficha que hace falta para descubrir el grupo: la de la empresa fijada, o la de
   * la seleccionada cuando nada fija ni selecciona un grupo y no se la conoce ya.
   */
  const companyId =
    pinnedCompanyId ??
    (pinnedGroupId === null && selectedGroup === null && knownGroupId === null ? selected : null);
  const company = useQuery({
    queryKey: companyKey(companyId ?? ""),
    queryFn: () => getCompanyV2(companyId ?? ""),
    enabled: companyId !== null,
  });
  const groupOfCompany = company.data?.company.group_id ?? null;

  const id =
    pinnedGroupId ??
    (pinnedCompanyId !== null ? groupOfCompany : (selectedGroup ?? knownGroupId ?? groupOfCompany));

  if (companyId !== null && id === null) {
    if (company.isError) {
      return (
        <ErrorState
          error={company.error}
          context={`la empresa ${companyId}`}
          onRetry={() => void company.refetch()}
        />
      );
    }
    return <GroupSkeleton />;
  }

  if (id === null) return <Hint>Selecciona una empresa o un grupo</Hint>;

  const groupId = id;
  function pick(pickedCompanyId: string): void {
    setPicked({ companyId: pickedCompanyId, groupId });
    select(pickedCompanyId);
  }

  return <GroupSheet id={groupId} onPick={pick} />;
}
