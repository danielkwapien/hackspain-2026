/**
 * Fila de una filial (`role="option"` de un `listbox`): nombre, score, Δ 1 m y
 * sparkline. La comparten el widget Grupo y el modo grupo de Investigación profunda:
 * clic, Enter o Espacio llaman a `onSelect`.
 */

import type { KeyboardEvent, ReactElement } from "react";
import { cn } from "cn";
import { Sparkline, fmtDelta, fmtPoints } from "@/charts";
import type { UniverseItem } from "@/lib/api-v2";

/** Alto de fila en px: es `--size-table-row`. */
export const SUBSIDIARY_ROW_HEIGHT = 28;

const ROW_CLASS =
  "flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-2 transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none";

const NUM_CLASS = "shrink-0 num text-[length:var(--text-control)]";

export function SubsidiaryRow({
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
      style={{ height: SUBSIDIARY_ROW_HEIGHT }}
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
