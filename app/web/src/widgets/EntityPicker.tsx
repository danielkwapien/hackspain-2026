/**
 * Selector de entidad: popover anclado con buscador, hecho a mano.
 *
 * Sin Radix y sin virtualización, a propósito: en jsdom el popover de Radix es
 * frágil y medir alturas para virtualizar lo es más. Un buscador no necesita
 * pintar 1.286 filas — pinta 50 y pide afinar la búsqueda.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { cn } from "cn";
import type { Entity, EntityKind } from "@/dashboard/types";
import type { UniverseItem } from "@/lib/api-v2";
import { ENTITY_PICKER_WIDTH } from "./registry";
import { REGIME_CLASS, REGIME_LABEL } from "./regime";
import { Sparkline } from "./Sparkline";

const MAX_ROWS = 50;
const MAX_RECENTS = 5;

/** Últimas entidades elegidas en toda la sesión, compartidas por todos los selectores. */
let recentIds: string[] = [];

function rememberRecent(id: string): void {
  recentIds = [id, ...recentIds.filter((candidate) => candidate !== id)].slice(0, MAX_RECENTS);
}

/** El prefijo del id manda: `GROUP_*` es grupo consolidado, el resto empresa. */
function kindOf(id: string): EntityKind {
  return id.startsWith("GROUP_") ? "group" : "company";
}

/** Búsqueda sin acentos y sin mayúsculas: "iruna" encuentra "Montajes Iruña". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function toEntity(item: UniverseItem): Entity {
  return { kind: kindOf(item.id), id: item.id, name: item.name };
}

type EntityPickerProps = {
  open: boolean;
  mode?: "single" | "multi";
  kinds?: EntityKind[];
  max?: number;
  /** Universo a filtrar: empresas y grupos ya mezclados por quien lo abre. */
  items: UniverseItem[];
  selected?: Entity[];
  /** En `multi`, el array completo en orden de selección. */
  onSelect: (entities: Entity[]) => void;
  onClose: () => void;
  anchorLabel?: string;
};

/**
 * Cerrado es desmontado: así el buscador, el resaltado y la selección en curso
 * nacen limpios en cada apertura, sin un efecto que los reinicie.
 */
export function EntityPicker(props: EntityPickerProps): ReactElement | null {
  if (!props.open) return null;
  return <PickerBody {...props} />;
}

function PickerBody({
  mode = "single",
  kinds = ["company"],
  max = 1,
  items,
  selected,
  onSelect,
  onClose,
  anchorLabel,
}: EntityPickerProps): ReactElement {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [order, setOrder] = useState<Entity[]>(() => selected ?? []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const kindsKey = kinds.join(",");
  const selectedKey = order.map((entity) => entity.id).join(",");

  const { recent, rest, total } = useMemo(() => {
    const allowed = new Set(kindsKey.split(","));
    const pool = items.filter((item) => allowed.has(kindOf(item.id)));
    const text = normalize(query.trim());

    if (text) {
      const matches = pool.filter(
        (item) =>
          normalize(item.id).includes(text) ||
          normalize(item.name).includes(text) ||
          normalize(item.group_id).includes(text),
      );
      return { recent: [] as UniverseItem[], rest: matches, total: matches.length };
    }

    // Sin texto: lo que ya está elegido y lo último elegido suben arriba.
    const preferred: string[] = [];
    for (const id of [...selectedKey.split(","), ...recentIds]) {
      if (id && !preferred.includes(id)) preferred.push(id);
    }
    const head = preferred
      .map((id) => pool.find((item) => item.id === id))
      .filter((item): item is UniverseItem => item !== undefined);
    const headIds = new Set(head.map((item) => item.id));
    const tail = pool.filter((item) => !headIds.has(item.id));
    return { recent: head, rest: tail, total: head.length + tail.length };
  }, [items, kindsKey, query, selectedKey]);

  const recentVisible = recent.slice(0, MAX_ROWS);
  const restVisible = rest.slice(0, MAX_ROWS - recentVisible.length);
  const visible = [...recentVisible, ...restVisible];
  const activeIndex = Math.min(highlight, Math.max(0, visible.length - 1));
  const atMax = mode === "multi" && order.length >= max;
  const optionId = (id: string): string => `${listId}-option-${id}`;

  function choose(item: UniverseItem): void {
    const entity = toEntity(item);
    if (mode === "single") {
      rememberRecent(entity.id);
      onSelect([entity]);
      onClose();
      return;
    }
    const already = order.some((candidate) => candidate.id === entity.id);
    if (already) {
      const next = order.filter((candidate) => candidate.id !== entity.id);
      setOrder(next);
      onSelect(next);
      return;
    }
    if (order.length >= max) return;
    rememberRecent(entity.id);
    const next = [...order, entity];
    setOrder(next);
    onSelect(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight(Math.min(activeIndex + 1, visible.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(Math.max(activeIndex - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = visible[activeIndex];
      if (item && !(atMax && !order.some((candidate) => candidate.id === item.id))) choose(item);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  function renderRow(item: UniverseItem, index: number): ReactElement {
    const isSelected = order.some((candidate) => candidate.id === item.id);
    const disabled = atMax && !isSelected;
    return (
      <div
        key={item.id}
        id={optionId(item.id)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={disabled || undefined}
        className={cn(
          "flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-xs",
          index === activeIndex && "bg-accent",
          disabled && "opacity-40",
        )}
        // Sin `preventDefault` el clic roba el foco al input y se pierde el teclado.
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setHighlight(index)}
        onClick={() => {
          if (!disabled) choose(item);
        }}
      >
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.name}</span>
        <span className="shrink-0 font-mono text-muted-foreground">{item.id}</span>
        <span className="shrink-0 truncate text-muted-foreground">{item.group_id}</span>
        <span className="shrink-0 font-mono tabular-nums text-foreground">
          {item.score.toFixed(0)}
        </span>
        <span className={cn("shrink-0", REGIME_CLASS[item.regime])}>
          {REGIME_LABEL[item.regime]}
        </span>
        <Sparkline values={item.sparkline_12} className={cn("shrink-0", REGIME_CLASS[item.regime])} />
      </div>
    );
  }

  return (
    <div
      className="absolute left-0 top-full z-30 mt-1 rounded-lg border border-border bg-popover p-1 shadow-lg"
      style={{ width: ENTITY_PICKER_WIDTH }}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Buscar empresa o grupo"
        aria-expanded={true}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible[activeIndex] ? optionId(visible[activeIndex].id) : undefined}
        placeholder={anchorLabel ?? "Buscar empresa o grupo"}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
        }}
        className="h-8 w-full rounded-md bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div id={listId} role="listbox" aria-label="Empresas y grupos" className="max-h-80 overflow-y-auto">
        {recentVisible.length > 0 ? (
          <div role="presentation" className="px-2 py-1 text-xs text-muted-foreground">
            Recientes
          </div>
        ) : null}
        {recentVisible.map((item, index) => renderRow(item, index))}
        {restVisible.map((item, index) => renderRow(item, recentVisible.length + index))}
        {visible.length === 0 ? (
          <div role="presentation" className="px-2 py-3 text-xs text-muted-foreground">
            Sin resultados
          </div>
        ) : null}
      </div>

      {total > visible.length ? (
        <div role="presentation" className="px-2 py-1 text-xs text-muted-foreground">
          {`${total} resultados; afina la búsqueda`}
        </div>
      ) : null}
    </div>
  );
}
