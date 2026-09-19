/**
 * Widget Favoritos: la watchlist (empresas y grupos) con una fila de 28 px por id,
 * en el orden de la lista. Cada id pide su ficha por prefijo (`companyKey` o
 * `groupKey`, la misma caché que Investigación y Grupo) y cada fila tiene sus
 * propios estados: skeleton mientras carga y «No se pudo cargar · Reintentar» si
 * falla, sin tumbar a las demás. Clic o Enter escriben la selección de su clase
 * (`select` / `selectGroup`); la estrella quita la fila sin seleccionar.
 */

import type { KeyboardEvent, ReactElement } from "react";
import { useQueries } from "@tanstack/react-query";
import { cn } from "cn";
import { Sparkline, fmtDelta, fmtPoints } from "@/charts";
import { FavoriteStar } from "@/components/FavoriteStar";
import { select, selectGroup, useSelection } from "@/dashboard/selection";
import { useWatchlist } from "@/dashboard/watchlist";
import type { CompanyV2, GroupV2 } from "@/lib/api-v2";
import { getCompanyV2, getGroupV2 } from "@/lib/api-v2";
import { isGroupId } from "@/lib/entity";
import { companyKey, groupKey } from "@/lib/query-keys";
import type { WidgetContentProps } from "@/widgets/registry";
import type { FavoriteRow } from "./rows";
import { favoriteRow } from "./rows";

type Favorite = CompanyV2 | GroupV2;

/** Alto de fila en px: es `--size-table-row`. */
const ROW_HEIGHT = 28;

const ROW_CLASS =
  "flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 transition-colors duration-[var(--duration-fast)] focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none";

const NUM_CLASS = "shrink-0 num text-[length:var(--text-control)]";

const SKELETON_BAR_CLASS =
  "h-3 animate-pulse rounded-[var(--radius-control)] bg-surface-glass motion-reduce:animate-none";

/** La ficha de un favorito, por prefijo del id; ambas devuelven la misma forma de fila. */
function favoriteQuery(id: string) {
  return isGroupId(id)
    ? { queryKey: groupKey(id), queryFn: (): Promise<Favorite> => getGroupV2(id) }
    : { queryKey: companyKey(id), queryFn: (): Promise<Favorite> => getCompanyV2(id) };
}

function LoadingRow(): ReactElement {
  return (
    <li
      role="option"
      aria-selected={false}
      aria-busy="true"
      className={cn(ROW_CLASS, "cursor-default")}
      style={{ height: ROW_HEIGHT }}
    >
      <span className="sr-only">Cargando favorito</span>
      <div className={cn(SKELETON_BAR_CLASS, "min-w-0 flex-1")} />
      <div className={cn(SKELETON_BAR_CLASS, "w-12 shrink-0")} />
      <div className={cn(SKELETON_BAR_CLASS, "w-16 shrink-0")} />
    </li>
  );
}

function ErrorRow({
  id,
  onRetry,
}: {
  id: string;
  onRetry: () => void;
}): ReactElement {
  return (
    <li
      role="option"
      aria-selected={false}
      className={cn(ROW_CLASS, "cursor-default")}
      style={{ height: ROW_HEIGHT }}
    >
      <span
        className="min-w-0 flex-1 truncate text-[length:var(--text-control)] text-content-secondary"
        title={id}
      >
        No se pudo cargar
      </span>
      <button
        type="button"
        className="shrink-0 rounded-[var(--radius-control)] px-1 text-[length:var(--text-control)] text-content-accent transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onRetry}
      >
        Reintentar
      </button>
      <FavoriteStar id={id} name={id} />
    </li>
  );
}

function Row({
  row,
  isSelected,
  onSelect,
}: {
  row: FavoriteRow;
  isSelected: boolean;
  onSelect: () => void;
}): ReactElement {
  const delta1m = fmtDelta(row.delta_1m);
  const delta3m = fmtDelta(row.delta_3m);

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>): void {
    // La estrella también dispara keydown al pulsarla con Enter: solo la fila selecciona.
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  }

  return (
    <li
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      className={cn(
        ROW_CLASS,
        "cursor-pointer [@media(hover:hover)]:hover:bg-surface-glass",
        isSelected && "bg-fills-accent-thin",
      )}
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
      {row.kind === "group" ? (
        <>
          <span
            aria-hidden="true"
            className="shrink-0 rounded-[var(--radius-control)] bg-surface-glass px-1 text-[length:var(--text-micro)] font-medium text-content-secondary"
          >
            G
          </span>
          <span className="sr-only">Grupo</span>
        </>
      ) : null}
      <span className={cn(NUM_CLASS, "text-content-primary")}>{fmtPoints(row.score)}</span>
      <span className={NUM_CLASS} style={{ color: delta1m.tone }}>
        {delta1m.text}
      </span>
      <span className={cn(NUM_CLASS, "hidden @sm:inline")} style={{ color: delta3m.tone }}>
        {delta3m.text}
      </span>
      {row.sparkline.length >= 2 ? (
        <Sparkline points={row.sparkline} regime={row.regime} />
      ) : (
        <span className={cn(NUM_CLASS, "text-content-secondary")}>—</span>
      )}
      <FavoriteStar id={row.id} name={row.name} />
    </li>
  );
}

export function FavoritesWidget(_props: WidgetContentProps): ReactElement {
  const favorites = useWatchlist();
  const selectedEntity = useSelection((state) => state.selectedEntity);
  const queries = useQueries({ queries: favorites.map(favoriteQuery) });

  if (favorites.length === 0) {
    return (
      <div className="pt-2 text-[length:var(--text-body)] text-content-secondary">
        <p>Sin favoritos</p>
        <p>Pulsa la estrella de una fila en Empresas</p>
      </div>
    );
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <ul role="listbox" aria-label="Favoritos" className="flex min-h-0 flex-col overflow-y-auto">
        {favorites.map((id, index) => {
          const query = queries[index];
          if (query.isPending) return <LoadingRow key={id} />;
          if (query.isError) {
            return <ErrorRow key={id} id={id} onRetry={() => void query.refetch()} />;
          }
          const row = favoriteRow(id, query.data);
          return (
            <Row
              key={id}
              row={row}
              isSelected={selectedEntity?.kind === row.kind && selectedEntity.id === row.id}
              onSelect={() => (row.kind === "group" ? selectGroup(row.id) : select(row.id))}
            />
          );
        })}
      </ul>
    </div>
  );
}
